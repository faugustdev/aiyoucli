/**
 * claude-headless executor — vitest.
 *
 * Doesn't shell out to the real `claude` binary (that needs an authenticated
 * session and real API spend). Instead points `claudeBin` at a throwaway
 * executable script that mimics `claude -p ... --output-format json`'s
 * contract: read the prompt from argv, print a single JSON object with
 * `result`/`is_error` to stdout. That's the only contract this executor
 * depends on — see claude-headless.ts's header for how it was confirmed
 * against the real binary during the Fase 3 spike.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClaudeHeadlessExecutor, runClaudeHeadless } from "../src/services/a2a/executors/claude-headless.js";
import type { Message, Task } from "../src/services/a2a/types.js";

let dir: string;
let fakeClaude: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "aiyoucli-a2a-fake-claude-"));
  fakeClaude = join(dir, "fake-claude.mjs");
  // Mirrors the real CLI's argv shape: -p <text> --agent <name> --output-format json
  writeFileSync(
    fakeClaude,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const text = args[args.indexOf("-p") + 1] ?? "";
const agent = args[args.indexOf("--agent") + 1] ?? "";
if (text === "TRIGGER_ERROR") {
  process.stdout.write(JSON.stringify({ is_error: true, result: "denied: no permission" }));
  process.exit(0);
}
if (text === "TRIGGER_TIMEOUT") {
  setTimeout(() => {}, 60_000);
} else if (text === "TRIGGER_BAD_JSON") {
  process.stdout.write("not json");
} else {
  process.stdout.write(JSON.stringify({ is_error: false, result: \`[\${agent}] echo: \${text}\` }));
}
`,
    "utf-8"
  );
  chmodSync(fakeClaude, 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function userMessage(text: string, skillId?: string): Message {
  return {
    messageId: "m1",
    role: "ROLE_USER",
    parts: [{ text }],
    metadata: skillId ? { skillId } : undefined,
  };
}

const dummyTask: Task = { id: "t1", contextId: "c1", status: { state: "TASK_STATE_WORKING" } };

describe("runClaudeHeadless", () => {
  it("parses the fake binary's JSON stdout", async () => {
    const result = await runClaudeHeadless(["-p", "hello", "--agent", "reviewer", "--output-format", "json"], {
      claudeBin: fakeClaude,
    });
    expect(result.is_error).toBe(false);
    expect(result.result).toBe("[reviewer] echo: hello");
  });

  it("rejects on non-JSON stdout", async () => {
    await expect(
      runClaudeHeadless(["-p", "TRIGGER_BAD_JSON", "--agent", "reviewer", "--output-format", "json"], {
        claudeBin: fakeClaude,
      })
    ).rejects.toThrow(/non-JSON/);
  });

  it("rejects and kills the process on timeout", async () => {
    await expect(
      runClaudeHeadless(["-p", "TRIGGER_TIMEOUT", "--agent", "reviewer", "--output-format", "json"], {
        claudeBin: fakeClaude,
        timeoutMs: 100,
      })
    ).rejects.toThrow(/timed out/);
  });

  it("rejects when the binary can't be spawned at all", async () => {
    await expect(
      runClaudeHeadless(["-p", "hi"], { claudeBin: join(dir, "does-not-exist") })
    ).rejects.toThrow(/Failed to spawn/);
  });
});

describe("createClaudeHeadlessExecutor", () => {
  it("requires skillId", async () => {
    const executor = createClaudeHeadlessExecutor({ claudeBin: fakeClaude });
    await expect(executor({ message: userMessage("hi"), task: dummyTask })).rejects.toThrow(/skillId/);
  });

  it("returns the agent's reply as a text part", async () => {
    const executor = createClaudeHeadlessExecutor({ claudeBin: fakeClaude });
    const parts = await executor({ skillId: "coding-leader", message: userMessage("do the thing", "coding-leader"), task: dummyTask });
    expect(parts).toEqual([{ text: "[coding-leader] echo: do the thing" }]);
  });

  it("throws with the agent's error message when is_error is true", async () => {
    const executor = createClaudeHeadlessExecutor({ claudeBin: fakeClaude });
    await expect(
      executor({ skillId: "coding-leader", message: userMessage("TRIGGER_ERROR", "coding-leader"), task: dummyTask })
    ).rejects.toThrow(/denied: no permission/);
  });
});
