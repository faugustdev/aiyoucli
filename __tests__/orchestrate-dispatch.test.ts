/**
 * orchestrate/dispatch.ts — vitest.
 *
 * Mocks all three executors (createClaudeHeadlessExecutor/
 * createOpenCodeHeadlessExecutor/createAgyHeadlessExecutor) and
 * spawnOpenCodeServe — this file tests dispatch.ts's own logic (runtime/
 * model resolution precedence, agent validation, result shaping, batch
 * concurrency/cleanup), not the executors themselves (those have their own
 * test files with fake binaries).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const claudeExecutor = vi.fn(async ({ skillId, message }: any) => [
  { text: `claude:${skillId}:${message.parts[0].text}` },
]);
const opencodeExecutor = vi.fn(async ({ skillId, message }: any) => [
  { text: `opencode:${skillId}:${message.parts[0].text}` },
]);
const agyExecutor = vi.fn(async ({ skillId, message }: any) => [
  { text: `agy:${skillId}:${message.parts[0].text}` },
]);

const createClaudeHeadlessExecutor = vi.fn(() => claudeExecutor);
const createOpenCodeHeadlessExecutor = vi.fn(() => opencodeExecutor);
const createAgyHeadlessExecutor = vi.fn(() => agyExecutor);
const spawnOpenCodeServe = vi.fn(async () => ({ url: "http://127.0.0.1:9999", stop: vi.fn(async () => {}) }));

vi.mock("../src/services/a2a/executors/claude-headless.js", () => ({ createClaudeHeadlessExecutor }));
vi.mock("../src/services/a2a/executors/opencode-headless.js", () => ({ createOpenCodeHeadlessExecutor }));
vi.mock("../src/services/a2a/executors/agy-headless.js", () => ({ createAgyHeadlessExecutor }));
vi.mock("../src/services/a2a/opencode-process.js", () => ({ spawnOpenCodeServe }));

const { resolveRuntimeAndModel, dispatchTask, runOrchestrationPlan } = await import("../src/orchestrate/dispatch.js");

let dir: string;
let cwd: string;

beforeEach(() => {
  cwd = process.cwd();
  claudeExecutor.mockClear();
  opencodeExecutor.mockClear();
  agyExecutor.mockClear();
  createClaudeHeadlessExecutor.mockClear();
  createOpenCodeHeadlessExecutor.mockClear();
  createAgyHeadlessExecutor.mockClear();
  spawnOpenCodeServe.mockClear();
});

afterEach(() => {
  process.chdir(cwd);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function useProjectConfig(agents: Record<string, unknown>) {
  dir = mkdtempSync(join(tmpdir(), "aiyoucli-orchestrate-dispatch-"));
  mkdirSync(join(dir, ".aiyoucli"), { recursive: true });
  writeFileSync(join(dir, ".aiyoucli", "config.json"), JSON.stringify({ agents }), "utf-8");
  process.chdir(dir);
}

describe("resolveRuntimeAndModel", () => {
  it("falls back to DEFAULT_ORCHESTRATION when there's no config override", () => {
    process.chdir(tmpdir()); // no .aiyoucli/config.json here
    expect(resolveRuntimeAndModel("reviewer")).toEqual({ runtime: "agy", model: "gemini-3.7-flash-low" });
    expect(resolveRuntimeAndModel("coding-leader")).toEqual({ runtime: "opencode", model: undefined });
  });

  it("falls back to claude with no forced model for an agent with no default entry", () => {
    process.chdir(tmpdir());
    // coordination-leader has no DEFAULT_ORCHESTRATION entry by design
    expect(resolveRuntimeAndModel("coordination-leader")).toEqual({ runtime: "claude", model: undefined });
  });

  it("a config runtime override wins over the default", () => {
    useProjectConfig({ reviewer: { runtime: "opencode" } });
    expect(resolveRuntimeAndModel("reviewer").runtime).toBe("opencode");
  });

  it("a config model override wins over the default's model", () => {
    useProjectConfig({ reviewer: { model: "gemini-3.1-pro-high" } });
    const resolved = resolveRuntimeAndModel("reviewer");
    expect(resolved.runtime).toBe("agy"); // runtime still from default, only model overridden
    expect(resolved.model).toBe("gemini-3.1-pro-high");
  });
});

describe("dispatchTask", () => {
  it("never rejects — returns a failed result for coordination-leader", async () => {
    const result = await dispatchTask({ agent: "coordination-leader", task: "do something" });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/not dispatchable/);
  });

  it("never rejects — returns a failed result for an unknown agent", async () => {
    const result = await dispatchTask({ agent: "not-a-real-agent", task: "x" });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Unknown agent/);
  });

  it("dispatches an agy-routed agent to createAgyHeadlessExecutor with the resolved model", async () => {
    process.chdir(tmpdir());
    const result = await dispatchTask({ agent: "reviewer", task: "review the diff" });
    expect(result.status).toBe("completed");
    expect(result.runtime).toBe("agy");
    expect(result.model).toBe("gemini-3.7-flash-low");
    expect(result.output).toBe("agy:reviewer:review the diff");
    expect(createAgyHeadlessExecutor).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.7-flash-low" }));
  });

  it("dispatches an opencode-routed agent, given a serverUrl", async () => {
    process.chdir(tmpdir());
    const result = await dispatchTask(
      { agent: "coding-leader", task: "implement X" },
      { opencodeServerUrl: "http://127.0.0.1:4096" }
    );
    expect(result.status).toBe("completed");
    expect(result.runtime).toBe("opencode");
    expect(result.output).toBe("opencode:coding-leader:implement X");
    expect(createOpenCodeHeadlessExecutor).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrl: "http://127.0.0.1:4096" })
    );
  });

  it("fails cleanly when opencode is resolved but no serverUrl was given", async () => {
    process.chdir(tmpdir());
    const result = await dispatchTask({ agent: "coding-leader", task: "implement X" });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/opencodeServerUrl/);
    expect(createOpenCodeHeadlessExecutor).not.toHaveBeenCalled();
  });

  it("dispatches to createClaudeHeadlessExecutor when a config override sets runtime: claude", async () => {
    useProjectConfig({ reviewer: { runtime: "claude" } }); // overrides reviewer's agy default
    const result = await dispatchTask({ agent: "reviewer", task: "review it" });
    expect(result.status).toBe("completed");
    expect(result.runtime).toBe("claude");
    expect(result.output).toBe("claude:reviewer:review it");
    expect(createClaudeHeadlessExecutor).toHaveBeenCalled();
  });

  it("wraps an executor throw as a failed result, not a rejection", async () => {
    process.chdir(tmpdir());
    agyExecutor.mockRejectedValueOnce(new Error("boom"));
    const result = await dispatchTask({ agent: "reviewer", task: "x" });
    expect(result.status).toBe("failed");
    expect(result.error).toBe("boom");
  });
});

describe("runOrchestrationPlan", () => {
  it("spawns a shared opencode serve once when any task needs it, and tears it down", async () => {
    process.chdir(tmpdir());
    const stop = vi.fn(async () => {});
    spawnOpenCodeServe.mockResolvedValueOnce({ url: "http://127.0.0.1:5000", stop });

    const results = await runOrchestrationPlan([
      { agent: "reviewer", task: "a" }, // agy
      { agent: "coding-leader", task: "b" }, // opencode
      { agent: "codebase-explorer", task: "c" }, // agy
    ]);

    expect(spawnOpenCodeServe).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "completed")).toBe(true);
    const opencodeCall = createOpenCodeHeadlessExecutor.mock.calls.at(-1)![0];
    expect(opencodeCall.serverUrl).toBe("http://127.0.0.1:5000");
  });

  it("never spawns opencode serve when no task needs it", async () => {
    process.chdir(tmpdir());
    await runOrchestrationPlan([{ agent: "reviewer", task: "a" }]);
    expect(spawnOpenCodeServe).not.toHaveBeenCalled();
  });

  it("tears down the shared opencode serve even if a task fails", async () => {
    process.chdir(tmpdir());
    const stop = vi.fn(async () => {});
    spawnOpenCodeServe.mockResolvedValueOnce({ url: "http://127.0.0.1:5001", stop });
    opencodeExecutor.mockRejectedValueOnce(new Error("crashed"));

    const results = await runOrchestrationPlan([{ agent: "coding-leader", task: "a" }]);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(results[0]!.status).toBe("failed");
  });
});
