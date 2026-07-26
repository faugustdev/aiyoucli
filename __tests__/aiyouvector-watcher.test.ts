/**
 * aiyouvector-watcher tests — Pillar A.4.
 *
 * Mocks `node:child_process` so the test does not require an actual
 * `aiyouvector` binary on PATH. Each case replicates the live CLI's
 * spawn args (e.g. `["--version"]`, `["daemon", "watch", cwd]`,
 * `["daemon", "start"]`) so the mock is structurally identical to
 * production.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the binary name so we can flip it for the "not installed" case.
const originalPath = process.env.PATH;

type SpawnResult = {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
};

let spawnCalls: Array<{ cmd: string; args: string[] }> = [];
let spawnResults: SpawnResult[] = []; // popped in order

vi.mock("node:child_process", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:child_process");
  return {
    ...actual,
    spawnSync: (cmd: string, args: readonly string[]) => {
      spawnCalls.push({ cmd, args: [...args] });
      const next = spawnResults.shift();
      if (!next) {
        return { status: 1, stdout: "", stderr: "no mock result" };
      }
      return next;
    },
  };
});

import { tryWatchProject } from "../src/init/aiyouvector-watcher.js";

beforeEach(() => {
  spawnCalls = [];
  spawnResults = [];
  // Ensure the binary is "findable" — the mock ignores PATH, but we
  // don't want surprises from a real `aiyouvector` on the developer box.
  process.env.PATH = "/nonexistent-for-test";
});

afterEach(() => {
  process.env.PATH = originalPath;
});

describe("aiyouvector-watcher", () => {
  it("returns ok=true with watcherInstalled=false when aiyouvector is not on PATH", () => {
    spawnResults.push({ status: null, error: new Error("ENOENT") });
    const r = tryWatchProject("/tmp/proj");
    expect(r.watcherInstalled).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/not installed/i);
    expect(spawnCalls).toEqual([{ cmd: "aiyouvector", args: ["--version"] }]);
  });

  it("returns ok=true when watch succeeds on first try", () => {
    spawnResults.push({ status: 0, stdout: "aiyouvector 0.1.0" }); // --version
    spawnResults.push({ status: 0, stdout: "watching /tmp/proj" }); // daemon watch
    const r = tryWatchProject("/tmp/proj");
    expect(r.watcherInstalled).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("watching /tmp/proj");
    expect(spawnCalls.map((c) => c.args)).toEqual([
      ["--version"],
      ["daemon", "watch", "/tmp/proj"],
    ]);
  });

  it("retries with daemon start when watch fails with 'no socket'", () => {
    spawnResults.push({ status: 0, stdout: "aiyouvector 0.1.0" }); // --version
    spawnResults.push({
      status: 1,
      stderr: "connection refused: no socket at /tmp/aiyouvector.sock",
    }); // daemon watch
    spawnResults.push({ status: 0, stdout: "Daemon started (PID 1234)" }); // daemon start
    spawnResults.push({ status: 0, stdout: "watching /tmp/proj" }); // daemon watch (retry)
    const r = tryWatchProject("/tmp/proj");
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("daemon started");
    expect(spawnCalls.map((c) => c.args)).toEqual([
      ["--version"],
      ["daemon", "watch", "/tmp/proj"],
      ["daemon", "start"],
      ["daemon", "watch", "/tmp/proj"],
    ]);
  });

  it("returns ok=false when watch fails for a non-daemon reason", () => {
    spawnResults.push({ status: 0, stdout: "aiyouvector 0.1.0" }); // --version
    spawnResults.push({
      status: 2,
      stderr: "invalid path: /nonexistent",
    }); // daemon watch
    const r = tryWatchProject("/tmp/proj");
    expect(r.watcherInstalled).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("invalid path");
    expect(spawnCalls.map((c) => c.args)).toEqual([
      ["--version"],
      ["daemon", "watch", "/tmp/proj"],
    ]);
  });

  it("returns ok=false when daemon start itself fails after watch error", () => {
    spawnResults.push({ status: 0, stdout: "aiyouvector 0.1.0" }); // --version
    spawnResults.push({
      status: 1,
      stderr: "no socket",
    }); // daemon watch
    spawnResults.push({
      status: 1,
      stderr: "fork failed: Resource temporarily unavailable",
    }); // daemon start
    const r = tryWatchProject("/tmp/proj");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("daemon watch failed");
    expect(r.detail).toContain("daemon start failed");
  });
});
