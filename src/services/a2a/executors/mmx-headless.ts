/**
 * `TaskExecutor` that dispatches to a real aiyou-team agent by shelling out
 * to MiniMax's CLI: `mmx text chat --message "<text>" --system "<persona>"
 * --model <model> --output json`.
 *
 * Built for `aiyoucli orchestrate` (plan: sleepy-singing-lobster, "Plan
 * Master 3") — same directory/pattern as claude-headless.ts/opencode-
 * headless.ts/agy-headless.ts for consistency, not because this is
 * A2A-network-specific.
 *
 * IMPORTANT — `mmx` is NOT a coding agent like claude/opencode/agy. It's a
 * pure chat-completion API client (`mmx --help`: text/speech/image/video/
 * music/search/vision/quota/config/file — no agentic tool-use loop, no
 * `--add-dir`, no filesystem/bash access at all). Confirmed via `mmx text
 * chat --help`. Unlike agy (which has to fake persona injection by
 * prepending to the user turn), mmx DOES have a real `--system` flag — a
 * genuine system-role message — so persona injection here is cleaner than
 * agy-headless.ts's. But because there's no file access, any task that
 * needs to see actual code has to have that content embedded in the task
 * text by the caller; this executor cannot fetch it. That's why
 * `orchestrate/defaults.ts` never assigns "mmx" to a file-reading agent
 * (codebase-explorer, reviewer, ...) by default — it's opt-in via
 * `aiyoucli agent set-runtime <agent> mmx` for genuinely text-only work.
 *
 * VERIFICATION GAP, not closed as of writing this: the exact JSON response
 * shape was never confirmed against a real authenticated call — `mmx auth
 * login` wasn't done in the environment this was written in (`mmx text chat`
 * returned `{"error":{"code":3,"message":"No credentials found"}}`). The
 * parser below is written from `mmx text chat --help`'s documented flags
 * only. Before trusting this executor, run `mmx auth login` then a real
 * `mmx text chat --message "hi" --output json` call and confirm the actual
 * field names match `MmxChatResult` below — adjust if not.
 */

import { spawn } from "node:child_process";
import type { TaskExecutor } from "../server.js";
import type { Part } from "../types.js";
import { AGENT_DEFS } from "../../../init/claude-agents.js";

export interface MmxHeadlessExecutorOptions {
  /** Working directory the subprocess spawns in. mmx has no workspace concept, so this only affects e.g. relative `--messages-file` paths, not what mmx can "see." */
  cwd?: string;
  /** Kills the subprocess and fails the task if it runs longer than this. Default: 300_000 (5 min). */
  timeoutMs?: number;
  /** Path/name of the `mmx` binary. Default: "mmx" (resolved via PATH). */
  mmxBin?: string;
  /** Model id (e.g. "MiniMax-M3"). Omit to use mmx's own default. */
  model?: string;
}

/**
 * UNVERIFIED shape — see this file's header. `mmx text chat --help` documents the
 * request flags but not the exact response JSON field names.
 */
interface MmxChatResult {
  response?: string;
  message?: { content?: string };
  choices?: Array<{ message?: { content?: string } }>;
  error?: { code?: number; message?: string; hint?: string };
}

function extractText(parts: Part[]): string {
  const textPart = parts.find((p): p is { text: string } => "text" in p);
  if (!textPart) {
    throw new Error("mmx-headless executor only supports text parts");
  }
  return textPart.text;
}

/** Best-effort extraction across the a few plausible response shapes — see MmxChatResult's header note. */
function extractResponseText(result: MmxChatResult): string | undefined {
  return result.response ?? result.message?.content ?? result.choices?.[0]?.message?.content;
}

/** Runs `mmx text chat ...` and parses its JSON stdout. Exported for tests. */
export function runMmxHeadless(args: string[], opts?: MmxHeadlessExecutorOptions): Promise<MmxChatResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts?.mmxBin ?? "mmx", args, {
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
      reject(new Error(`mmx text chat timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn '${opts?.mmxBin ?? "mmx"}': ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf-8").trim();
      // mmx prints structured JSON errors to stdout even on failure (e.g. the
      // "No credentials found" case) — parse first, only fall back to the
      // raw exit-code/stderr path if stdout wasn't JSON at all.
      try {
        resolve(JSON.parse(out) as MmxChatResult);
        return;
      } catch {
        // fall through
      }
      if (code !== 0) {
        reject(new Error(`mmx text chat exited ${code}: ${Buffer.concat(stderr).toString("utf-8").trim() || out.slice(0, 500)}`));
        return;
      }
      reject(new Error(`mmx text chat produced non-JSON output: ${out.slice(0, 500)}`));
    });
  });
}

export function createMmxHeadlessExecutor(opts?: MmxHeadlessExecutorOptions): TaskExecutor {
  return async ({ skillId, message }) => {
    if (!skillId) {
      throw new Error("message.metadata.skillId is required — pick one of the aiyou-team agents");
    }
    const def = AGENT_DEFS.find((d) => d.name === skillId);
    if (!def) {
      throw new Error(`Unknown agent "${skillId}" — not in the aiyou-team roster`);
    }

    const text = extractText(message.parts);
    const args = ["text", "chat", "--message", text, "--system", def.promptBody, "--output", "json"];
    if (opts?.model) args.push("--model", opts.model);

    const result = await runMmxHeadless(args, opts);
    if (result.error) {
      throw new Error(result.error.message ? `${result.error.message}${result.error.hint ? ` (${result.error.hint})` : ""}` : `${skillId} (mmx) reported an error`);
    }
    const responseText = extractResponseText(result);
    if (responseText === undefined) {
      throw new Error(
        `${skillId} (mmx) returned no recognizable response field — see mmx-headless.ts's verification gap note, the real JSON shape may differ from what's coded here`
      );
    }
    return [{ text: responseText.trim() }];
  };
}
