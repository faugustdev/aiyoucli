/**
 * `TaskExecutor` that dispatches to a real aiyou-team agent by shelling out
 * to Google Antigravity's headless mode: `agy -p "<text>" --model <model>
 * --output-format json`.
 *
 * Built for `aiyoucli orchestrate` (plan: sleepy-singing-lobster, "Plan
 * Master 2") — grouped here alongside claude-headless.ts/opencode-
 * headless.ts because it's the same shape (`TaskExecutor`), not because
 * this is A2A-network-specific; none of the three actually are.
 *
 * Confirmed empirically before writing this (same standard as the other two
 * executors — nothing here is guessed):
 *   - `agy -p "..." --model <id> --output-format json` works and returns
 *     `{"status":"SUCCESS","response":"...", "usage": {...}}`.
 *   - `agy --agent <name>` does NOT validate the name — passing a name that
 *     doesn't exist in `agy agents` (empty by default; Antigravity has no
 *     `.claude/agents/*.md`-equivalent custom-persona file format) silently
 *     ran the default persona instead of erroring. No `--system-prompt` /
 *     `--append-system-prompt` flag exists in `agy --help` either.
 *
 * So unlike claude-headless.ts (`--agent` reliably loads the real persona)
 * this executor manually prepends the agent's `promptBody` to the prompt
 * text itself. That's weaker than a real system-role prompt — the model may
 * not hold to the persona's rules as strictly — but it's the only mechanism
 * that's actually verified to work. Revisit if Antigravity ships real custom
 * agent support.
 *
 * Also confirmed empirically: running two `agy -p` invocations concurrently
 * intermittently reports `status: "ERROR"` (`error: "The stream was
 * interrupted..."`) on one of them, even though `response` often still has
 * the real answer. Reproduced from *separate* cwds too (ruling out a
 * cwd/session-state conflict — this isn't the same shape as the Orca-style
 * "each agent needs its own git worktree" isolation), and did NOT reproduce
 * on every trial (1 failure in 2 runs, then 0 in a third) — a transient
 * condition under concurrent load, not a hard limit on concurrency itself.
 * `orchestrate` therefore still runs agy-routed tasks in parallel with
 * everything else; this executor absorbs the flakiness with a bounded retry
 * (`maxRetries`, default 2) instead.
 */

import { spawn } from "node:child_process";
import type { TaskExecutor } from "../server.js";
import type { Part } from "../types.js";
import { AGENT_DEFS } from "../../../init/claude-agents.js";

export interface AgyHeadlessExecutorOptions {
  /** Working directory the headless run happens in — defaults to `process.cwd()`. */
  cwd?: string;
  /** Kills the subprocess and fails the task if it runs longer than this. Default: 300_000 (5 min). */
  timeoutMs?: number;
  /** Path/name of the `agy` binary. Default: "agy" (resolved via PATH). */
  agyBin?: string;
  /** Model id from `agy models` (e.g. "gemini-3.7-flash-low"). Omit to use agy's own default. */
  model?: string;
  /**
   * Extra attempts on a non-SUCCESS status before giving up. Default: 2
   * (3 attempts total). Confirmed empirically that concurrent `agy -p`
   * invocations intermittently report `status: "ERROR"` with `error:
   * "The stream was interrupted..."` even though `response` often still
   * has the real answer — reproduced running two at once from *separate*
   * cwds too (ruling out a cwd/session-state conflict), and it didn't
   * reproduce every time (1 failure in 2 trials, 0 in a third) — a
   * transient/flaky condition under concurrent load, not a hard limit on
   * running `agy` concurrently. A bounded retry is the correct fix, not
   * serializing agy-routed orchestrate tasks.
   */
  maxRetries?: number;
}

interface AgyPrintResult {
  status?: string;
  response?: string;
  conversation_id?: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractText(parts: Part[]): string {
  const textPart = parts.find((p): p is { text: string } => "text" in p);
  if (!textPart) {
    throw new Error("agy-headless executor only supports text parts");
  }
  return textPart.text;
}

/** Runs `agy -p ...` and parses its single-JSON-object stdout. Exported for tests. */
export function runAgyHeadless(args: string[], opts?: AgyHeadlessExecutorOptions): Promise<AgyPrintResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts?.agyBin ?? "agy", args, {
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
      reject(new Error(`agy -p timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn '${opts?.agyBin ?? "agy"}': ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf-8").trim();
      if (code !== 0 && !out) {
        reject(new Error(`agy -p exited ${code}: ${Buffer.concat(stderr).toString("utf-8").trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(out) as AgyPrintResult);
      } catch {
        reject(new Error(`agy -p produced non-JSON output: ${out.slice(0, 500)}`));
      }
    });
  });
}

export function createAgyHeadlessExecutor(opts?: AgyHeadlessExecutorOptions): TaskExecutor {
  return async ({ skillId, message }) => {
    if (!skillId) {
      throw new Error("message.metadata.skillId is required — pick one of the aiyou-team agents");
    }
    const def = AGENT_DEFS.find((d) => d.name === skillId);
    if (!def) {
      throw new Error(`Unknown agent "${skillId}" — not in the aiyou-team roster`);
    }

    const text = extractText(message.parts);
    const prompt = `${def.promptBody}\n\n---\n\nTASK:\n${text}`;

    // Unlike claude/opencode, agy does NOT treat the process's spawn cwd as
    // its workspace automatically — confirmed empirically: without
    // --add-dir it reports "no active workspace" and falls back to its own
    // CLI data directory, completely blind to the actual project. Codebase-
    // aware agents (codebase-explorer, reviewer, ...) are useless without this.
    const args = ["-p", prompt, "--add-dir", opts?.cwd ?? process.cwd(), "--output-format", "json"];
    if (opts?.model) args.push("--model", opts.model);

    const maxRetries = opts?.maxRetries ?? 2;
    let lastResult: AgyPrintResult | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(500);
      lastResult = await runAgyHeadless(args, opts);
      if (lastResult.status === "SUCCESS") {
        return [{ text: (lastResult.response ?? "").trim() }];
      }
    }

    throw new Error(
      lastResult?.error ||
        lastResult?.response ||
        `${skillId} (agy) reported status=${lastResult?.status ?? "unknown"} after ${maxRetries + 1} attempt(s)`
    );
  };
}
