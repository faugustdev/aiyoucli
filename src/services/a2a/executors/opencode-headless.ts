/**
 * A2A `TaskExecutor` that dispatches to a real aiyou-team agent through a
 * running `opencode serve` instance's HTTP API.
 *
 * This is the Fase 3 OpenCode follow-up (plan: sleepy-singing-lobster) that
 * claude-headless.ts's header left open. Two things had to be discovered
 * empirically before this worked (both confirmed against a real `opencode
 * serve` + its `/doc` OpenAPI schema):
 *
 * 1. `opencode run --agent <name>` (the CLI headless path used for Claude
 *    Code) doesn't apply here for two independent reasons:
 *      - The name aiyou-team's plugin registers is NOT the bare roster name
 *        (`codebase-explorer`). It's `createCanonicalAgentId(teamId, agentId)`
 *        from aiyou-team's `agent-teams/canonical-agent-id.ts`: the built-in
 *        team id `"coding-team"` becomes stem `"coding"`, so most agents get
 *        prefixed to `coding-<name>` (`coding-codebase-explorer`,
 *        `coding-reviewer`, ...) — except ones whose own name already starts
 *        with the stem (`coding-leader`, `coding-executor` stay bare).
 *      - Even with the right name, `opencode run --agent <canonical-id>`
 *        refuses: aiyou-team's agents are registered `mode: "subagent"`, and
 *        `run --agent` only accepts a top-level *primary* agent — it logs
 *        `agent "..." is a subagent, not a primary agent. Falling back to
 *        default agent` and silently runs the default persona instead.
 * 2. The fix is to go under the CLI, straight to the HTTP API `opencode
 *    serve` exposes: `POST /session` to create a session, then `POST
 *    /session/{id}/message` (SDK name: `session.prompt`) with `agent:
 *    <canonicalId>` **in the message body itself**. Setting `agent` only at
 *    session-creation time was silently ignored (the reply came back
 *    attributed to the default primary agent, no error, no server log) —
 *    confirmed empirically. Passing `agent` on the message call is what
 *    actually pins the persona; the response's `info.agent` field then
 *    matches, so this is verifiable per-call rather than assumed.
 *
 * Canonical-id resolution: rather than reimplementing aiyou-team's stem-
 * prefixing algorithm here (fragile if it ever changes), this queries the
 * live `GET /agent` list and matches by exact name or `-<skillId>` suffix —
 * every canonical id aiyou-team produces is, by construction, either the
 * bare agent slug or `<stem>-<agent slug>`, so the suffix always holds.
 *
 * Unlike claude-headless.ts (spawns a fresh `claude` process per request),
 * this assumes a long-lived `opencode serve` is already running at
 * `serverUrl` — OpenCode's plugin bootstrap (model registry discovery, team
 * library load, ...) takes a few seconds, too slow to redo per A2A request.
 * `commands/index.ts`'s `a2a serve --runtime opencode` is responsible for
 * either pointing at an operator-supplied server or spawning/managing one.
 */

import type { TaskExecutor } from "../server.js";
import type { Part } from "../types.js";

export interface OpenCodeHeadlessExecutorOptions {
  /** Base URL of a running `opencode serve` instance, e.g. "http://127.0.0.1:4400". */
  serverUrl: string;
  /** HTTP Basic auth, if the server was started with `OPENCODE_SERVER_PASSWORD`. Username defaults to "opencode" (OpenCode's own default). */
  username?: string;
  password?: string;
  /** Per-HTTP-call timeout. Default: 300_000 (5 min) — headless agent runs can be slow. */
  timeoutMs?: number;
}

interface OpenCodeAgentSummary {
  name: string;
  mode?: string;
}

interface OpenCodeMessagePart {
  type: string;
  text?: string;
}

interface OpenCodePromptResult {
  info: { agent?: string };
  parts: OpenCodeMessagePart[];
}

function extractText(parts: Part[]): string {
  const textPart = parts.find((p): p is { text: string } => "text" in p);
  if (!textPart) {
    throw new Error("opencode-headless executor only supports text parts");
  }
  return textPart.text;
}

function authHeader(opts: OpenCodeHeadlessExecutorOptions): Record<string, string> {
  if (!opts.password) return {};
  const token = Buffer.from(`${opts.username ?? "opencode"}:${opts.password}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

async function opencodeFetch(path: string, init: RequestInit, opts: OpenCodeHeadlessExecutorOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300_000);
  try {
    const res = await fetch(`${opts.serverUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...authHeader(opts), ...init.headers },
      signal: controller.signal,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new Error(`opencode serve ${init.method ?? "GET"} ${path} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

/** Exported for tests. Resolves an aiyou-team roster name to OpenCode's registered canonical agent id. */
export async function resolveCanonicalAgentId(skillId: string, opts: OpenCodeHeadlessExecutorOptions): Promise<string> {
  const agents = (await opencodeFetch("/agent", { method: "GET" }, opts)) as OpenCodeAgentSummary[];
  const exact = agents.find((a) => a.name === skillId);
  if (exact) return exact.name;
  const suffixed = agents.find((a) => a.name.endsWith(`-${skillId}`));
  if (suffixed) return suffixed.name;
  throw new Error(
    `No OpenCode agent registered for skill "${skillId}" (checked exact match and "-${skillId}" suffix against ${agents.length} agents from ${opts.serverUrl}/agent). Is the aiyou-team plugin loaded in that server's project?`
  );
}

export function createOpenCodeHeadlessExecutor(opts: OpenCodeHeadlessExecutorOptions): TaskExecutor {
  return async ({ skillId, message }) => {
    if (!skillId) {
      throw new Error(
        "message.metadata.skillId is required — pick one of the agents from the Agent Card's skills[]"
      );
    }
    const text = extractText(message.parts);
    const canonicalAgentId = await resolveCanonicalAgentId(skillId, opts);

    const session = (await opencodeFetch(
      "/session",
      { method: "POST", body: JSON.stringify({ title: `a2a:${skillId}` }) },
      opts
    )) as { id: string };

    try {
      const result = (await opencodeFetch(
        `/session/${session.id}/message`,
        {
          method: "POST",
          body: JSON.stringify({ agent: canonicalAgentId, parts: [{ type: "text", text }] }),
        },
        opts
      )) as OpenCodePromptResult;

      const replyText = result.parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("\n\n");
      return [{ text: replyText }];
    } finally {
      // Best-effort — a leaked session isn't worth failing the task over.
      await opencodeFetch(`/session/${session.id}`, { method: "DELETE" }, opts).catch(() => {});
    }
  };
}
