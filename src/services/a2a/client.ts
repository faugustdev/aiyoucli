/**
 * A2A client — talks to any server implementing the `HTTP+JSON` binding
 * (see `types.ts`'s header). Native `fetch` only, no dependencies.
 */

import { randomUUID } from "node:crypto";
import type { AgentCard, Message, Part, SendMessageConfiguration, Task } from "./types.js";
import { A2AError, TERMINAL_TASK_STATES } from "./types.js";

export interface A2AClientOptions {
  /** Sent as `Authorization: Bearer <authToken>` when set. */
  authToken?: string;
  /** Abort/timeout for a single HTTP call, in ms. Default: 30_000. */
  timeoutMs?: number;
}

function headers(opts?: A2AClientOptions): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (opts?.authToken) h.authorization = `Bearer ${opts.authToken}`;
  return h;
}

async function request(url: string, init: RequestInit, opts?: A2AClientOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, { ...init, headers: { ...headers(opts), ...init.headers }, signal: controller.signal });
    const text = await res.text();
    const body = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const message = (body as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      const code = (body as { error?: { code?: string } })?.error?.code ?? "HTTP_ERROR";
      throw new A2AError(message, res.status, code);
    }
    return body;
  } catch (err) {
    if (err instanceof A2AError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new A2AError(`Request to ${url} timed out`, 408, "TIMEOUT");
    }
    throw new A2AError(err instanceof Error ? err.message : String(err), 0, "NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

/** GET `{baseUrl}/.well-known/agent-card.json`. Never authenticated — the card is meant to be public. */
export async function getAgentCard(baseUrl: string, opts?: Omit<A2AClientOptions, "authToken">): Promise<AgentCard> {
  return (await request(`${baseUrl}/.well-known/agent-card.json`, { method: "GET" }, opts)) as AgentCard;
}

export interface SendMessageInput {
  text: string;
  /** Which skill (aiyou agent) should handle this — sent as `message.metadata.skillId`. */
  skillId?: string;
  contextId?: string;
  configuration?: SendMessageConfiguration;
}

/** POST `{baseUrl}/message:send`. Always resolves to a `Task` — this client never expects a bare `message` response. */
export async function sendMessage(baseUrl: string, input: SendMessageInput, opts?: A2AClientOptions): Promise<Task> {
  const parts: Part[] = [{ text: input.text }];
  const message: Message = {
    messageId: randomUUID(),
    contextId: input.contextId,
    role: "ROLE_USER",
    parts,
    metadata: input.skillId ? { skillId: input.skillId } : undefined,
  };

  const body = await request(
    `${baseUrl}/message:send`,
    { method: "POST", body: JSON.stringify({ message, configuration: input.configuration }) },
    opts
  );
  const task = (body as { task?: Task }).task;
  if (!task) {
    throw new A2AError("Server responded without a task", 502, "UNEXPECTED_RESPONSE");
  }
  return task;
}

/** GET `{baseUrl}/tasks/{id}`. */
export async function getTask(baseUrl: string, id: string, opts?: A2AClientOptions): Promise<Task> {
  return (await request(`${baseUrl}/tasks/${encodeURIComponent(id)}`, { method: "GET" }, opts)) as Task;
}

/** POST `{baseUrl}/tasks/{id}:cancel`. */
export async function cancelTask(baseUrl: string, id: string, opts?: A2AClientOptions): Promise<Task> {
  return (await request(`${baseUrl}/tasks/${encodeURIComponent(id)}:cancel`, { method: "POST" }, opts)) as Task;
}

export interface PollOptions extends A2AClientOptions {
  intervalMs?: number;
  /** Give up after this long and throw. Default: 120_000 (2 minutes). */
  timeoutMs?: number;
}

/** Polls `GET /tasks/{id}` until a terminal state (completed/failed/canceled/rejected) or timeout. */
export async function pollTaskUntilTerminal(baseUrl: string, id: string, opts?: PollOptions): Promise<Task> {
  const intervalMs = opts?.intervalMs ?? 1000;
  const deadline = Date.now() + (opts?.timeoutMs ?? 120_000);

  for (;;) {
    const task = await getTask(baseUrl, id, opts);
    if (TERMINAL_TASK_STATES.has(task.status.state)) {
      return task;
    }
    if (Date.now() > deadline) {
      throw new A2AError(`Task ${id} did not reach a terminal state within timeout`, 408, "POLL_TIMEOUT");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
