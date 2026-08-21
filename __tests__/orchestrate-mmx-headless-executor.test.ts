/**
 * mmx-headless executor — vitest.
 *
 * Doesn't shell out to the real `mmx` binary (not authenticated in any CI
 * environment, and its exact JSON response shape was never confirmed live —
 * see mmx-headless.ts's header "VERIFICATION GAP" note). Points `mmxBin` at
 * a throwaway executable script that mimics the *documented* contract from
 * `mmx text chat --help`. If the real shape turns out different, these
 * tests (and the `extractResponseText` fallbacks they exercise) need
 * revisiting alongside the executor.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMmxHeadlessExecutor, runMmxHeadless } from "../src/services/a2a/executors/mmx-headless.js";
import type { Message, Task } from "../src/services/a2a/types.js";

let dir: string;
let fakeMmx: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "aiyoucli-orchestrate-fake-mmx-"));
  fakeMmx = join(dir, "fake-mmx.mjs");
  writeFileSync(
    fakeMmx,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const message = args[args.indexOf("--message") + 1] ?? "";
const system = args[args.indexOf("--system") + 1] ?? "";
const modelIdx = args.indexOf("--model");
const model = modelIdx === -1 ? "" : (args[modelIdx + 1] ?? "");

if (message.includes("TRIGGER_NO_CREDS")) {
  console.log(JSON.stringify({ error: { code: 3, message: "No credentials found.", hint: "Log in: mmx auth login" } }));
  process.exit(3);
}
if (message.includes("TRIGGER_BAD_JSON")) {
  process.stdout.write("not json");
  process.exit(1);
}
if (message.includes("TRIGGER_CHOICES_SHAPE")) {
  // Alternate plausible shape (OpenAI-style) — extractResponseText must fall back to this.
  console.log(JSON.stringify({ choices: [{ message: { content: \`choices-shape:\${message}\` } }] }));
  process.exit(0);
}
console.log(JSON.stringify({ response: \`[system=\${system.length}chars,model=\${model}] echo: \${message}\` }));
`,
    "utf-8"
  );
  chmodSync(fakeMmx, 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function userMessage(text: string, skillId?: string): Message {
  return { messageId: "m1", role: "ROLE_USER", parts: [{ text }], metadata: skillId ? { skillId } : undefined };
}

const dummyTask: Task = { id: "t1", contextId: "c1", status: { state: "TASK_STATE_WORKING" } };

describe("runMmxHeadless", () => {
  it("parses the fake binary's JSON stdout", async () => {
    const result = await runMmxHeadless(["text", "chat", "--message", "hello", "--output", "json"], { mmxBin: fakeMmx });
    expect(result.response).toContain("echo: hello");
  });

  it("parses JSON from stdout even on a non-zero exit (mmx's structured error case)", async () => {
    const result = await runMmxHeadless(["text", "chat", "--message", "TRIGGER_NO_CREDS", "--output", "json"], {
      mmxBin: fakeMmx,
    });
    expect(result.error?.code).toBe(3);
    expect(result.error?.message).toContain("No credentials");
  });

  it("rejects on non-JSON stdout with a non-zero exit", async () => {
    await expect(
      runMmxHeadless(["text", "chat", "--message", "TRIGGER_BAD_JSON", "--output", "json"], { mmxBin: fakeMmx })
    ).rejects.toThrow(/exited 1/);
  });

  it("rejects when the binary can't be spawned", async () => {
    await expect(runMmxHeadless(["text", "chat"], { mmxBin: join(dir, "does-not-exist") })).rejects.toThrow(
      /Failed to spawn/
    );
  });
});

describe("createMmxHeadlessExecutor", () => {
  it("requires skillId", async () => {
    const executor = createMmxHeadlessExecutor({ mmxBin: fakeMmx });
    await expect(executor({ message: userMessage("hi"), task: dummyTask })).rejects.toThrow(/skillId/);
  });

  it("rejects an agent not in the roster", async () => {
    const executor = createMmxHeadlessExecutor({ mmxBin: fakeMmx });
    await expect(
      executor({ skillId: "not-a-real-agent", message: userMessage("hi", "not-a-real-agent"), task: dummyTask })
    ).rejects.toThrow(/Unknown agent/);
  });

  it("passes the persona as --system (a real system-role message, unlike agy's manual prepend)", async () => {
    const executor = createMmxHeadlessExecutor({ mmxBin: fakeMmx });
    const parts = await executor({
      skillId: "principal-advisor",
      message: userMessage("should we use X or Y", "principal-advisor"),
      task: dummyTask,
    });
    // system= is the persona's promptBody length in chars — just confirm it's non-trivial, i.e. a real persona was passed, not empty.
    expect(parts[0]!.text).toMatch(/system=\d{3,}chars/);
    expect(parts[0]!.text).toContain("echo: should we use X or Y");
  });

  it("throws a clear error surfacing mmx's structured error, including the hint", async () => {
    const executor = createMmxHeadlessExecutor({ mmxBin: fakeMmx });
    await expect(
      executor({ skillId: "principal-advisor", message: userMessage("TRIGGER_NO_CREDS", "principal-advisor"), task: dummyTask })
    ).rejects.toThrow(/No credentials found.*mmx auth login/);
  });

  it("falls back to the choices[0].message.content shape if `response` is absent", async () => {
    const executor = createMmxHeadlessExecutor({ mmxBin: fakeMmx });
    const parts = await executor({
      skillId: "principal-advisor",
      message: userMessage("TRIGGER_CHOICES_SHAPE", "principal-advisor"),
      task: dummyTask,
    });
    expect(parts[0]!.text).toContain("choices-shape:TRIGGER_CHOICES_SHAPE");
  });

  it("passes --model through when configured", async () => {
    const executor = createMmxHeadlessExecutor({ mmxBin: fakeMmx, model: "MiniMax-M3" });
    const parts = await executor({
      skillId: "principal-advisor",
      message: userMessage("hi", "principal-advisor"),
      task: dummyTask,
    });
    expect(parts[0]!.text).toContain("model=MiniMax-M3");
  });
});
