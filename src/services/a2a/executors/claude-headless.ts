/**
 * A2A `TaskExecutor` that dispatches to a real aiyou-team agent by shelling
 * out to Claude Code's headless mode: `claude -p "<text>" --agent <skillId>
 * --output-format json`.
 *
 * This is the Fase 3 spike result (plan: sleepy-singing-lobster) — confirmed
 * empirically: `--agent <name>` loads that name's `.claude/agents/<name>.md`
 * persona (system prompt, tools, model) for a one-shot headless run, and
 * `--output-format json` returns a single JSON object with a `result` string
 * and an `is_error` flag. No manual system-prompt injection needed.
 *
 * The OpenCode equivalent (`opencode run --agent <name>`) does NOT work the
 * same way — see `../executors/opencode-headless.ts` for the (different,
 * HTTP-API-based) mechanism `aiyoucli a2a serve --runtime opencode` uses
 * instead. Short version: `opencode run --agent` only accepts primary
 * agents, and aiyou-team's roster is registered as `mode: "subagent"` —
 * dispatch has to go through `opencode serve`'s `POST /session/{id}/message`
 * with `agent: <canonicalId>` in the body, not the `run` CLI at all.
 *
 * SECURITY: several aiyou-team agents (coding-leader, coding-executor, ...)
 * have Edit/Write/Bash in their tool allowlist. Running them headlessly in
 * response to a network request means an A2A caller's message can end up
 * driving filesystem/shell actions on this machine. This executor does NOT
 * set `--permission-mode` or `--dangerously-skip-permissions` — Claude
 * Code's own default headless behavior (declining tool calls that would
 * need interactive approval) is left in place. Do not add a bypass flag
 * here without re-reading the plan's security-review note first.
 *
 * This executor deliberately does NOT re-validate `skillId` against an
 * allowlist — that's `server.ts`'s `resolveSkillId()` job, enforced once in
 * `/message:send` against what the server actually publishes, before this
 * executor (or any future one) ever runs. An earlier version of this file
 * had no such check anywhere, letting a caller request any agent regardless
 * of `aiyoucli a2a serve --agent <name>`'s filter — see the security review
 * this went through (plan: sleepy-singing-lobster, Fase 3) before this
 * executor was wired into `serve`.
 */

import { spawn } from "node:child_process";
import type { TaskExecutor } from "../server.js";
import type { Part } from "../types.js";

export interface ClaudeHeadlessExecutorOptions {
  /** Working directory the headless session runs in — defaults to `process.cwd()`. */
  cwd?: string;
  /** Kills the subprocess and fails the task if it runs longer than this. Default: 300_000 (5 min). */
  timeoutMs?: number;
  /** Path/name of the `claude` binary. Default: "claude" (resolved via PATH). */
  claudeBin?: string;
}

interface ClaudePrintResult {
  is_error?: boolean;
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
}

function extractText(parts: Part[]): string {
  const textPart = parts.find((p): p is { text: string } => "text" in p);
  if (!textPart) {
    throw new Error("claude-headless executor only supports text parts");
  }
  return textPart.text;
}

/** Runs `claude -p ...` and parses its single-JSON-object stdout. Exported for tests. */
export function runClaudeHeadless(
  args: string[],
  opts?: ClaudeHeadlessExecutorOptions
): Promise<ClaudePrintResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts?.claudeBin ?? "claude", args, {
      cwd: opts?.cwd ?? process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (d) => stdout.push(d));
    child.stderr.on("data", (d) => stderr.push(d));

    const timeoutMs = opts?.timeoutMs ?? 300_000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn '${opts?.claudeBin ?? "claude"}': ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf-8").trim();
      if (code !== 0 && !out) {
        reject(new Error(`claude -p exited ${code}: ${Buffer.concat(stderr).toString("utf-8").trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(out) as ClaudePrintResult);
      } catch {
        reject(new Error(`claude -p produced non-JSON output: ${out.slice(0, 500)}`));
      }
    });
  });
}

export function createClaudeHeadlessExecutor(opts?: ClaudeHeadlessExecutorOptions): TaskExecutor {
  return async ({ skillId, message }) => {
    if (!skillId) {
      throw new Error(
        "message.metadata.skillId is required — pick one of the agents from the Agent Card's skills[]"
      );
    }
    const text = extractText(message.parts);
    const result = await runClaudeHeadless(["-p", text, "--agent", skillId, "--output-format", "json"], opts);

    if (result.is_error) {
      throw new Error(result.result || `${skillId} reported an error with no message`);
    }
    return [{ text: result.result ?? "" }];
  };
}
