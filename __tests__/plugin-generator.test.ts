/**
 * plugin-generator.ts — vitest.
 *
 * Covers the Claude Code Plugin packaging (plan Fase 4): the manifest,
 * hooks.json (both the reused PreToolUse/PostToolUse from the standalone
 * path and the new SessionStart/UserPromptSubmit entries), .mcp.json, and
 * that per-agent model overrides flow through to `agents/*.md`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPluginFiles, generatePlugin } from "../src/init/plugin-generator.js";
import { AGENT_DEFS } from "../src/init/claude-agents.js";

describe("buildPluginFiles", () => {
  it("includes the manifest, hooks.json, mcp.json, and one .md per agent", () => {
    const files = buildPluginFiles();
    expect(files[".claude-plugin/plugin.json"]).toBeDefined();
    expect(files["hooks/hooks.json"]).toBeDefined();
    expect(files[".mcp.json"]).toBeDefined();
    for (const def of AGENT_DEFS) {
      expect(files[`agents/${def.name}.md`]).toBeDefined();
    }
    // Manifest + hooks + mcp + 8 agents.
    expect(Object.keys(files).length).toBe(3 + AGENT_DEFS.length);
  });

  it("manifest has a name, description, and version — no author asserted", () => {
    const manifest = JSON.parse(buildPluginFiles()[".claude-plugin/plugin.json"]!);
    expect(manifest.name).toBe("aiyou-team");
    expect(typeof manifest.description).toBe("string");
    expect(typeof manifest.version).toBe("string");
  });

  it("hooks.json carries SessionStart, UserPromptSubmit, PreToolUse, and PostToolUse", () => {
    const hooksJson = JSON.parse(buildPluginFiles()["hooks/hooks.json"]!);
    expect(hooksJson.hooks.SessionStart).toBeDefined();
    expect(hooksJson.hooks.UserPromptSubmit).toBeDefined();
    expect(hooksJson.hooks.PreToolUse).toBeDefined();
    expect(hooksJson.hooks.PostToolUse).toBeDefined();
  });

  it("SessionStart hook has a matcher (required per Claude Code's plugin hook schema)", () => {
    const hooksJson = JSON.parse(buildPluginFiles()["hooks/hooks.json"]!);
    expect(hooksJson.hooks.SessionStart[0].matcher).toBe("startup");
  });

  it("SessionStart and UserPromptSubmit both shell out to the aiyoucli CLI, not inline logic", () => {
    const hooksJson = JSON.parse(buildPluginFiles()["hooks/hooks.json"]!);
    const sessionStartCmd = hooksJson.hooks.SessionStart[0].hooks[0].command;
    expect(sessionStartCmd).toBe("aiyoucli hooks session-start");

    const userPromptCmd = hooksJson.hooks.UserPromptSubmit[0].hooks[0].command as string;
    expect(userPromptCmd).toContain("hooks");
    expect(userPromptCmd).toContain("user-prompt-submit");
    // UserPromptSubmit must never block/erase the prompt on failure.
    expect(userPromptCmd).toContain("process.exit(0)");
  });

  it(".mcp.json registers the aiyoucli-mcp server", () => {
    const mcpJson = JSON.parse(buildPluginFiles()[".mcp.json"]!);
    expect(mcpJson.mcpServers.aiyoucli.command).toBe("aiyoucli-mcp");
  });

  it("every generated agent .md has valid frontmatter with name/model", () => {
    const files = buildPluginFiles();
    for (const def of AGENT_DEFS) {
      const content = files[`agents/${def.name}.md`]!;
      expect(content).toMatch(/^---\nname: /);
      expect(content).toContain(`name: ${def.name}`);
      expect(content).toMatch(/model: \S+/);
    }
  });
});

describe("generatePlugin", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("writes every file to disk under outDir, creating directories as needed", () => {
    dir = mkdtempSync(join(tmpdir(), "aiyoucli-plugin-gen-"));
    const outDir = join(dir, ".aiyou-team-plugin");

    const result = generatePlugin({ outDir });

    expect(result.pluginDir).toBe(outDir);
    expect(existsSync(join(outDir, ".claude-plugin", "plugin.json"))).toBe(true);
    expect(existsSync(join(outDir, "hooks", "hooks.json"))).toBe(true);
    expect(existsSync(join(outDir, ".mcp.json"))).toBe(true);
    expect(existsSync(join(outDir, "agents", "coding-leader.md"))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(outDir, ".claude-plugin", "plugin.json"), "utf-8"));
    expect(manifest.name).toBe("aiyou-team");
  });

  it("reflects a project's agents.<name>.model override in the generated agent file", () => {
    dir = mkdtempSync(join(tmpdir(), "aiyoucli-plugin-gen-override-"));
    mkdirSync(join(dir, ".aiyoucli"), { recursive: true });
    writeFileSync(
      join(dir, ".aiyoucli", "config.json"),
      JSON.stringify({ agents: { "coding-leader": { model: "opus-4-8" } } }),
      "utf-8"
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const outDir = join(dir, ".aiyou-team-plugin");
      generatePlugin({ outDir });
      const content = readFileSync(join(outDir, "agents", "coding-leader.md"), "utf-8");
      expect(content).toContain("model: opus-4-8");
    } finally {
      process.chdir(cwd);
    }
  });

  it("overwrites on a second run rather than skipping (unlike the standalone .claude/ path)", () => {
    dir = mkdtempSync(join(tmpdir(), "aiyoucli-plugin-gen-overwrite-"));
    const outDir = join(dir, ".aiyou-team-plugin");
    const manifestPath = join(outDir, ".claude-plugin", "plugin.json");

    generatePlugin({ outDir });
    mkdirSync(join(outDir, ".claude-plugin"), { recursive: true });
    writeFileSync(manifestPath, "not json, should be replaced", "utf-8");

    generatePlugin({ outDir });
    expect(() => JSON.parse(readFileSync(manifestPath, "utf-8"))).not.toThrow();
  });
});
