/**
 * Minimal A2A server — `node:http` only, no dependencies. Implements the
 * `HTTP+JSON` binding subset described in `types.ts`'s header:
 *
 *   GET  /.well-known/agent-card.json
 *   POST /message:send
 *   GET  /tasks/{id}
 *   POST /tasks/{id}:cancel
 *
 * Task execution is injected via `TaskExecutor` — this module owns the wire
 * protocol and the task-state machine, not how a skill actually runs. The
 * headless-invocation bridge (dispatching to a real Claude Code / OpenCode
 * subagent) is a separate, not-yet-built piece (see plan Fase 3's spike);
 * until then, callers pass a stub/echo executor (as the CLI's `a2a serve`
 * does today — see commands/index.ts).
 *
 * Auth: optional shared bearer token (`authToken`). The Agent Card itself is
 * always served unauthenticated (it's meant to be publicly discoverable);
 * every other route requires `Authorization: Bearer <token>` when a token is
 * configured. There is no auth by default — callers exposing this beyond
 * localhost MUST set one (see plan's security-review note).
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { AgentCard, Message, Part, SendMessageRequest, Task, TaskState } from "./types.js";
import { TERMINAL_TASK_STATES } from "./types.js";

const MAX_BODY_BYTES = 1_000_000; // 1MB — plenty for text/data parts, bounds memory use.

export type TaskExecutor = (input: {
  skillId?: string;
  message: Message;
  task: Task;
}) => Promise<Part[]>;

export interface StartA2AServerOptions {
  /** Receives the final bound URL (host:port) so the card can advertise its real address. */
  buildAgentCard: (url: string) => AgentCard;
  executor: TaskExecutor;
  /** When set, all routes except the Agent Card require `Authorization: Bearer <authToken>`. */
  authToken?: string;
  /** Default: 0 (OS-assigned ephemeral port). */
  port?: number;
  /** Default: "127.0.0.1" — not exposed beyond localhost unless explicitly overridden. */
  host?: string;
}

export interface A2AServerHandle {
  server: Server;
  url: string;
  close(): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { error: { code, message } });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    }
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function isAuthorized(req: IncomingMessage, authToken: string | undefined): boolean {
  if (!authToken) return true;
  const header = req.headers.authorization;
  return header === `Bearer ${authToken}`;
}

function validateSendMessageRequest(body: unknown): SendMessageRequest {
  if (!body || typeof body !== "object") {
    throw Object.assign(new Error("Request body must be a JSON object"), { statusCode: 400 });
  }
  const message = (body as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    throw Object.assign(new Error("`message` is required"), { statusCode: 400 });
  }
  const parts = (message as Record<string, unknown>).parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw Object.assign(new Error("`message.parts` must be a non-empty array"), { statusCode: 400 });
  }
  return body as SendMessageRequest;
}

function extractSkillId(message: Message): string | undefined {
  const fromMetadata = message.metadata?.skillId;
  return typeof fromMetadata === "string" ? fromMetadata : undefined;
}

/**
 * Resolves and validates which skill a request targets, against the skills
 * this server instance actually publishes (`cardRef.current.skills` — which
 * already reflects `aiyoucli a2a serve --agent <name>`'s filter). This is
 * the enforcement point, not the Agent Card: the card being scoped to a
 * subset of agents is meaningless if any caller can still request an
 * unpublished, more-privileged skillId and have it dispatched anyway. Auth
 * is whole-server (one bearer token for every route), so without this check
 * any caller who can reach one published skill could reach every agent on
 * the roster regardless of what the operator intended to expose.
 */
function resolveSkillId(message: Message, publishedSkillIds: readonly string[]): string {
  const requested = extractSkillId(message);

  if (requested !== undefined) {
    if (!publishedSkillIds.includes(requested)) {
      throw Object.assign(
        new Error(`skillId "${requested}" is not published by this server. Published: ${publishedSkillIds.join(", ") || "(none)"}`),
        { statusCode: 403 }
      );
    }
    return requested;
  }

  if (publishedSkillIds.length === 1) {
    return publishedSkillIds[0]!;
  }

  throw Object.assign(
    new Error(
      publishedSkillIds.length === 0
        ? "This server publishes no skills."
        : `message.metadata.skillId is required — this server publishes multiple skills: ${publishedSkillIds.join(", ")}`
    ),
    { statusCode: 400 }
  );
}

function agentTextMessage(text: string, taskId: string, contextId: string): Message {
  return {
    messageId: randomUUID(),
    taskId,
    contextId,
    role: "ROLE_AGENT",
    parts: [{ text }],
  };
}

/**
 * Build the request listener as a standalone function so it can be unit
 * tested without a real listening socket (e.g. with `http.request` against
 * a server bound to an ephemeral port, or directly with mock req/res).
 */
export function createA2ARequestListener(opts: {
  cardRef: { current: AgentCard };
  executor: TaskExecutor;
  authToken?: string;
  tasks: Map<string, Task>;
}) {
  return async function listener(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/.well-known/agent-card.json") {
        sendJson(res, 200, opts.cardRef.current);
        return;
      }

      if (!isAuthorized(req, opts.authToken)) {
        sendError(res, 401, "UNAUTHENTICATED", "Missing or invalid Authorization header");
        return;
      }

      if (req.method === "POST" && path === "/message:send") {
        const body = validateSendMessageRequest(await readJsonBody(req));
        const message = body.message;
        // Validated against what this server actually publishes *before* any
        // task is created — see resolveSkillId()'s header for why this can't
        // just live in the executor.
        const skillId = resolveSkillId(message, opts.cardRef.current.skills.map((s) => s.id));

        const taskId = randomUUID();
        const contextId = message.contextId ?? randomUUID();

        const task: Task = {
          id: taskId,
          contextId,
          status: { state: "TASK_STATE_SUBMITTED", timestamp: nowIso() },
          history: [{ ...message, taskId, contextId }],
        };
        opts.tasks.set(taskId, task);

        task.status = { state: "TASK_STATE_WORKING", timestamp: nowIso() };

        try {
          const resultParts = await opts.executor({ skillId, message, task });
          const agentMessage: Message = {
            messageId: randomUUID(),
            taskId,
            contextId,
            role: "ROLE_AGENT",
            parts: resultParts,
          };
          task.history = [...(task.history ?? []), agentMessage];
          task.status = { state: "TASK_STATE_COMPLETED", message: agentMessage, timestamp: nowIso() };
        } catch (err) {
          const errMessage = agentTextMessage(
            err instanceof Error ? err.message : String(err),
            taskId,
            contextId
          );
          task.history = [...(task.history ?? []), errMessage];
          task.status = { state: "TASK_STATE_FAILED", message: errMessage, timestamp: nowIso() };
        }

        opts.tasks.set(taskId, task);
        sendJson(res, 200, { task });
        return;
      }

      const taskMatch = path.match(/^\/tasks\/([^/:]+)(:cancel)?$/);
      if (taskMatch) {
        const [, id, isCancel] = taskMatch;
        const task = opts.tasks.get(id);
        if (!task) {
          sendError(res, 404, "NOT_FOUND", `No task with id ${id}`);
          return;
        }

        if (isCancel && req.method === "POST") {
          if (!TERMINAL_TASK_STATES.has(task.status.state)) {
            task.status = { state: "TASK_STATE_CANCELED" as TaskState, timestamp: nowIso() };
            opts.tasks.set(id, task);
          }
          sendJson(res, 200, task);
          return;
        }

        if (!isCancel && req.method === "GET") {
          sendJson(res, 200, task);
          return;
        }
      }

      sendError(res, 404, "NOT_FOUND", `No route for ${req.method} ${path}`);
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, statusCode, statusCode === 500 ? "INTERNAL" : "BAD_REQUEST", message);
    }
  };
}

export async function startA2AServer(opts: StartA2AServerOptions): Promise<A2AServerHandle> {
  const host = opts.host ?? "127.0.0.1";
  const tasks = new Map<string, Task>();
  // Placeholder until the server is actually bound and we know the real URL.
  const cardRef = { current: opts.buildAgentCard(`http://${host}`) };

  const listener = createA2ARequestListener({
    cardRef,
    executor: opts.executor,
    authToken: opts.authToken,
    tasks,
  });
  const server = createServer(listener);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port ?? 0;
  const url = `http://${host}:${port}`;
  cardRef.current = opts.buildAgentCard(url);

  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
