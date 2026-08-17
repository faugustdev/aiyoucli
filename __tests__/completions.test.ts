/**
 * `aiyoucli completions` — vitest.
 * The command is pure string generation (no NAPI/MCP calls), so we invoke
 * its `action` directly and capture `console.log` (which `output.log` writes to).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { commands } from "../src/commands/index.js";
import type { CommandContext } from "../src/types.js";

const completionsCommand = commands.find((c) => c.name === "completions")!;

function makeCtx(shell?: string): CommandContext {
  return {
    args: shell ? [shell] : [],
    flags: { _: [] },
    config: {} as CommandContext["config"],
    cwd: process.cwd(),
    interactive: false,
  };
}

async function run(shell?: string): Promise<string> {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await completionsCommand.action!(makeCtx(shell));
    return logSpy.mock.calls.map((c) => String(c[0])).join("\n");
  } finally {
    logSpy.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aiyoucli completions", () => {
  it("defaults to bash", async () => {
    const out = await run();
    expect(out).toContain("# bash completion for aiyoucli");
    expect(out).toContain("complete -F _aiyoucli aiyoucli");
    expect(out).toContain("memory"); // a real command name shows up
  });

  it("generates zsh completions", async () => {
    const out = await run("zsh");
    expect(out).toContain("#compdef aiyoucli");
    expect(out).toContain("_describe 'command' commands");
  });

  it("generates fish completions", async () => {
    const out = await run("fish");
    expect(out).toContain("# fish completion for aiyoucli");
    expect(out).toContain("complete -c aiyoucli");
    expect(out).toContain('-a "memory"');
  });

  it("generates powershell completions", async () => {
    const out = await run("powershell");
    expect(out).toContain("Register-ArgumentCompleter -Native -CommandName aiyoucli");
    expect(out).toContain("'memory'");
  });

  it("treats pwsh as an alias for powershell", async () => {
    const out = await run("pwsh");
    expect(out).toContain("Register-ArgumentCompleter -Native -CommandName aiyoucli");
  });
});
