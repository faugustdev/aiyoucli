/**
 * agy-headless executor — vitest.
 *
 * Doesn't shell out to the real `agy` binary (needs an authenticated session
 * and real API spend). Points `agyBin` at a throwaway executable script that
 * mimics `agy -p ... --output-format json`'s contract: read the prompt from
 * argv, print a single JSON object with `status`/`response` to stdout —
 * that's the only contract confirmed against the real binary (see
 * agy-headless.ts's header for what was verified live).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAgyHeadlessExecutor, runAgyHeadless } from "../src/services/a2a/executors/agy-headless.js";
import type { Message, Task } from "../src/services/a2a/types.js";

let dir: string;
let fakeAgy: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "aiyoucli-orchestrate-fake-agy-"));
  fakeAgy = join(dir, "fake-agy.mjs");
  writeFileSync(
    fakeAgy,
    `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const modelIdx = args.indexOf("--model");
const prompt = args[args.indexOf("-p") + 1] ?? "";
const model = modelIdx === -1 ? "" : (args[modelIdx + 1] ?? "");
if (prompt.includes("TRIGGER_ERROR")) {
  process.stdout.write(JSON.stringify({ status: "ERROR", response: "denied: no permission", error: "denied: no permission" }));
  process.exit(0);
}
if (prompt.includes("TRIGGER_BAD_JSON")) {
  process.stdout.write("not json");
} else if (prompt.includes("TRIGGER_FLAKY:")) {
  // Mimics the real "stream was interrupted" flakiness: fails the first 2
  // calls (keyed by a counter file whose path is embedded in the prompt),
  // succeeds from the 3rd on — matches maxRetries' default of 2 extra tries.
  const counterPath = prompt.split("TRIGGER_FLAKY:")[1].split(/\\s/)[0];
  const count = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf-8")) : 0;
  writeFileSync(counterPath, String(count + 1));
  if (count < 2) {
    process.stdout.write(JSON.stringify({ status: "ERROR", error: "The stream was interrupted. Please continue the task you were working on.", response: "" }));
  } else {
    process.stdout.write(JSON.stringify({ status: "SUCCESS", response: "recovered after retry" }));
  }
} else {
  process.stdout.write(JSON.stringify({ status: "SUCCESS", response: \`[model=\${model}] echo: \${prompt}\` }));
}
`,
    "utf-8"
  );
  chmodSync(fakeAgy, 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function userMessage(text: string, skillId?: string): Message {
  return { messageId: "m1", role: "ROLE_USER", parts: [{ text }], metadata: skillId ? { skillId } : undefined };
}

const dummyTask: Task = { id: "t1", contextId: "c1", status: { state: "TASK_STATE_WORKING" } };

describe("runAgyHeadless", () => {
  it("parses the fake binary's JSON stdout", async () => {
    const result = await runAgyHeadless(["-p", "hello", "--output-format", "json"], { agyBin: fakeAgy });
    expect(result.status).toBe("SUCCESS");
    expect(result.response).toContain("echo: hello");
  });

  it("rejects on non-JSON stdout", async () => {
    await expect(
      runAgyHeadless(["-p", "TRIGGER_BAD_JSON", "--output-format", "json"], { agyBin: fakeAgy })
    ).rejects.toThrow(/non-JSON/);
  });

  it("rejects when the binary can't be spawned", async () => {
    await expect(runAgyHeadless(["-p", "hi"], { agyBin: join(dir, "does-not-exist") })).rejects.toThrow(
      /Failed to spawn/
    );
  });
});

describe("createAgyHeadlessExecutor", () => {
  it("requires skillId", async () => {
    const executor = createAgyHeadlessExecutor({ agyBin: fakeAgy });
    await expect(executor({ message: userMessage("hi"), task: dummyTask })).rejects.toThrow(/skillId/);
  });

  it("rejects an agent not in the roster", async () => {
    const executor = createAgyHeadlessExecutor({ agyBin: fakeAgy });
    await expect(
      executor({ skillId: "not-a-real-agent", message: userMessage("hi", "not-a-real-agent"), task: dummyTask })
    ).rejects.toThrow(/Unknown agent/);
  });

  it("prepends the agent's persona prompt body to the task text", async () => {
    const executor = createAgyHeadlessExecutor({ agyBin: fakeAgy });
    const parts = await executor({
      skillId: "codebase-explorer",
      message: userMessage("find the config loader", "codebase-explorer"),
      task: dummyTask,
    });
    expect(parts[0]!.text).toContain("codebase-explorer");
    expect(parts[0]!.text).toContain("find the config loader");
  });

  it("passes --model through when configured", async () => {
    const executor = createAgyHeadlessExecutor({ agyBin: fakeAgy, model: "gemini-3.7-flash-low" });
    const parts = await executor({
      skillId: "reviewer",
      message: userMessage("review this", "reviewer"),
      task: dummyTask,
    });
    expect(parts[0]!.text).toContain("model=gemini-3.7-flash-low");
  });

  it("omits --model when not configured", async () => {
    const executor = createAgyHeadlessExecutor({ agyBin: fakeAgy });
    const parts = await executor({
      skillId: "reviewer",
      message: userMessage("review this", "reviewer"),
      task: dummyTask,
    });
    expect(parts[0]!.text).toContain("model=]");
  });

  it("throws with the agent's error message when status is not SUCCESS (no retries, to fail fast)", async () => {
    const executor = createAgyHeadlessExecutor({ agyBin: fakeAgy, maxRetries: 0 });
    await expect(
      executor({ skillId: "reviewer", message: userMessage("TRIGGER_ERROR", "reviewer"), task: dummyTask })
    ).rejects.toThrow(/denied: no permission/);
  });

  it("retries a transient ERROR status and succeeds once the underlying call recovers", async () => {
    const counterPath = join(dir, `flaky-${Math.random()}.count`);
    const executor = createAgyHeadlessExecutor({ agyBin: fakeAgy });
    const parts = await executor({
      skillId: "reviewer",
      message: userMessage(`TRIGGER_FLAKY:${counterPath} please review this`, "reviewer"),
      task: dummyTask,
    });
    expect(parts).toEqual([{ text: "recovered after retry" }]);
    expect(readFileSync(counterPath, "utf-8")).toBe("3"); // failed twice, succeeded on the 3rd (default maxRetries: 2)
  });

  it("gives up after maxRetries and throws the last attempt's error", async () => {
    const counterPath = join(dir, `flaky-${Math.random()}.count`);
    const executor = createAgyHeadlessExecutor({ agyBin: fakeAgy, maxRetries: 1 }); // only 2 attempts total, never reaches the 3rd (success) call
    await expect(
      executor({
        skillId: "reviewer",
        message: userMessage(`TRIGGER_FLAKY:${counterPath} please review this`, "reviewer"),
        task: dummyTask,
      })
    ).rejects.toThrow(/stream was interrupted/);
  });
});
