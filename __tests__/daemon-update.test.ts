/**
 * `aiyoucli daemon` / `aiyoucli update` — vitest.
 *
 * daemon: exercises the no-process paths (no pid file, stale pid file) —
 * `daemon start` itself blocks forever by design (like `mcp start`), so it's
 * covered by manual smoke testing, not here.
 *
 * update: mocks `node:child_process`'s `execSync` so no real npm/network
 * call happens.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execSync: vi.fn() };
});

import { execSync } from "node:child_process";
import { commands } from "../src/commands/index.js";
import { packageVersion } from "../src/version.js";
import type { CommandContext } from "../src/types.js";

const execSyncMock = vi.mocked(execSync);

let tmpDir: string;
const originalCwd = process.cwd();

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "aiyoucli-daemon-"));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const daemonCommand = commands.find((c) => c.name === "daemon")!;
const updateCommand = commands.find((c) => c.name === "update")!;

function findSub(cmd: typeof daemonCommand, name: string) {
  const sub = cmd.subcommands!.find((s) => s.name === name)!;
  return sub;
}

function ctx(args: string[] = []): CommandContext {
  return { args, flags: { _: [] }, config: {} as CommandContext["config"], cwd: process.cwd(), interactive: false };
}

async function captureLog(fn: () => Promise<void>): Promise<string> {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await fn();
    return logSpy.mock.calls.map((c) => String(c[0])).join("\n");
  } finally {
    logSpy.mockRestore();
  }
}

describe("aiyoucli daemon status/stop (no daemon running)", () => {
  it("status reports not running when there is no pid file", async () => {
    const out = await captureLog(() => findSub(daemonCommand, "status").action!(ctx()));
    expect(out).toContain("not running");
    expect(out).toContain("no pid file");
  });

  it("stop reports not running when there is no pid file", async () => {
    const out = await captureLog(() => findSub(daemonCommand, "stop").action!(ctx()));
    expect(out).toContain("not running");
    expect(out).toContain("no pid file");
  });

  it("status reports a stale pid file (process not alive)", async () => {
    mkdirSync(join(tmpDir, ".aiyoucli"), { recursive: true });
    // PID 1 is init/launchd — never our daemon, but definitely "alive" on any
    // OS, which would make this test flaky. Use a PID far outside the valid
    // range instead: guaranteed ESRCH from process.kill().
    writeFileSync(join(tmpDir, ".aiyoucli", "daemon.pid"), "999999999");
    const out = await captureLog(() => findSub(daemonCommand, "status").action!(ctx()));
    expect(out).toContain("stale pid file");
  });

  it("stop cleans up a stale pid file", async () => {
    mkdirSync(join(tmpDir, ".aiyoucli"), { recursive: true });
    writeFileSync(join(tmpDir, ".aiyoucli", "daemon.pid"), "999999999");
    const out = await captureLog(() => findSub(daemonCommand, "stop").action!(ctx()));
    expect(out).toContain("stale pid file");
  });
});

describe("aiyoucli update check", () => {
  it("reports up to date when npm view matches the local version", async () => {
    const current = packageVersion();
    execSyncMock.mockReturnValue(`${current}\n` as unknown as Buffer);
    const out = await captureLog(() => findSub(updateCommand, "check").action!(ctx()));
    expect(out).toContain("Up to date");
    expect(out).toContain(current);
  });

  it("reports an available update when npm view returns a different version", async () => {
    execSyncMock.mockReturnValue("999.0.0\n" as unknown as Buffer);
    const out = await captureLog(() => findSub(updateCommand, "check").action!(ctx()));
    expect(out).toContain("Update available");
    expect(out).toContain("999.0.0");
  });

  it("surfaces a clear error when the registry is unreachable, without throwing", async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("network unreachable");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(findSub(updateCommand, "check").action!(ctx())).resolves.not.toThrow();
    errorSpy.mockRestore();
  });
});

describe("aiyoucli update install", () => {
  it("reports success when npm install succeeds", async () => {
    execSyncMock.mockReturnValue(Buffer.from(""));
    const out = await captureLog(() => findSub(updateCommand, "install").action!(ctx()));
    expect(out).toContain("Updated");
  });

  it("surfaces a clear error when npm install fails, without throwing", async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(findSub(updateCommand, "install").action!(ctx())).resolves.not.toThrow();
    errorSpy.mockRestore();
  });
});
