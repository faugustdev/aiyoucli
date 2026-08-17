/**
 * Settings generator tests — vitest.
 *
 * Tests cover:
 *   - .mcp.json merge: preserves existing servers (e.g. supabase) when adding aiyoucli
 *   - opencode.json merge: preserves user's $schema, providers, models
 *   - Deep merge of nested objects (settings.json)
 *   - Idempotency: running twice does not duplicate entries
 *   - Force overwrite replaces the entire file
 *   - Skipped status when no changes are needed
 *   - Created status when file does not exist
 *   - Common files (statusline, agents.dsi.toon) get "updated" status
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSettings, type FileWriteResult } from "../src/init/settings-generator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "aiyoucli-settings-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function findResult(results: FileWriteResult[], relativePath: string): FileWriteResult {
  const abs = join(tmpDir, relativePath);
  const r = results.find((x) => x.path === abs);
  if (!r) throw new Error(`No result for ${relativePath}. Got: ${results.map((x) => x.path).join(", ")}`);
  return r;
}

describe("generateSettings — MCP disabled by default", () => {
  it("does not write .mcp.json when withMcp is omitted", async () => {
    const results = await generateSettings(tmpDir, ["claude"]);
    expect(results.some((r) => r.path.endsWith(".mcp.json"))).toBe(false);
    expect(existsSync(join(tmpDir, ".mcp.json"))).toBe(false);
  });

  it("writes opencode.json with mcp.aiyoucli.enabled=false when withMcp is omitted", async () => {
    await generateSettings(tmpDir, ["opencode"]);
    const content = JSON.parse(readFileSync(join(tmpDir, "opencode.json"), "utf-8"));
    expect(content.mcp.aiyoucli.enabled).toBe(false);
  });
});

describe("generateSettings — .mcp.json merge (--with-mcp)", () => {
  it("creates .mcp.json with aiyoucli server when file does not exist", async () => {
    const results = await generateSettings(tmpDir, ["claude"], false, true);
    const result = findResult(results, ".mcp.json");

    expect(result.status).toBe("created");
    const content = JSON.parse(readFileSync(join(tmpDir, ".mcp.json"), "utf-8"));
    expect(content.mcpServers.aiyoucli).toBeDefined();
    expect(content.mcpServers.aiyoucli.command).toBe("aiyoucli-mcp");
  });

  it("merges aiyoucli into existing .mcp.json that has supabase", async () => {
    const mcpPath = join(tmpDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          supabase: {
            type: "http",
            url: "https://mcp.supabase.com/mcp?project_ref=abc",
          },
        },
      }, null, 2) + "\n",
      "utf-8"
    );

    const results = await generateSettings(tmpDir, ["claude"], false, true);
    const result = findResult(results, ".mcp.json");

    expect(result.status).toBe("merged");
    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(content.mcpServers.supabase).toBeDefined();
    expect(content.mcpServers.supabase.url).toBe("https://mcp.supabase.com/mcp?project_ref=abc");
    expect(content.mcpServers.aiyoucli).toBeDefined();
    expect(content.mcpServers.aiyoucli.command).toBe("aiyoucli-mcp");
  });

  it("is idempotent — second run returns skipped (no duplicate servers)", async () => {
    await generateSettings(tmpDir, ["claude"], false, true);
    const secondRun = await generateSettings(tmpDir, ["claude"], false, true);
    const result = findResult(secondRun, ".mcp.json");

    expect(result.status).toBe("skipped");
    const content = JSON.parse(readFileSync(join(tmpDir, ".mcp.json"), "utf-8"));
    expect(Object.keys(content.mcpServers)).toHaveLength(1);
    expect(content.mcpServers.aiyoucli).toBeDefined();
  });

  it("preserves unknown fields at top level", async () => {
    const mcpPath = join(tmpDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {},
        customField: { foo: "bar" },
        experimental: ["flag-a", "flag-b"],
      }, null, 2) + "\n",
      "utf-8"
    );

    await generateSettings(tmpDir, ["claude"], false, true);
    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(content.customField).toEqual({ foo: "bar" });
    expect(content.experimental).toEqual(["flag-a", "flag-b"]);
  });

  it("force=true overwrites the entire file", async () => {
    const mcpPath = join(tmpDir, ".mcp.json");
    writeFileSync(
      mcpPath,
      JSON.stringify({ mcpServers: { supabase: { type: "http", url: "x" } } }),
      "utf-8"
    );

    const results = await generateSettings(tmpDir, ["claude"], true, true);
    const result = findResult(results, ".mcp.json");
    expect(result.status).toBe("updated");

    const content = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(content.mcpServers.supabase).toBeUndefined();
    expect(content.mcpServers.aiyoucli).toBeDefined();
  });
});

describe("generateSettings — opencode.json merge", () => {
  it("merges aiyoucli MCP and aiyou-team plugin into existing opencode.json", async () => {
    const ocPath = join(tmpDir, "opencode.json");
    writeFileSync(
      ocPath,
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        provider: {
          "llama.cpp": {
            npm: "@ai-sdk/openai-compatible",
            name: "Local llama.cpp",
            options: { baseURL: "http://localhost:8000/v1", apiKey: "sk-local" },
            models: {},
          },
        },
        model: "llama.cpp/qwen2.5-coder",
      }, null, 2) + "\n",
      "utf-8"
    );

    const results = await generateSettings(tmpDir, ["opencode"]);
    const result = findResult(results, "opencode.json");
    expect(result.status).toBe("merged");

    const content = JSON.parse(readFileSync(ocPath, "utf-8"));
    // User's customizations preserved
    expect(content.provider["llama.cpp"].options.baseURL).toBe("http://localhost:8000/v1");
    expect(content.model).toBe("llama.cpp/qwen2.5-coder");
    expect(content.$schema).toBe("https://opencode.ai/config.json");
    // aiyoucli additions merged
    expect(content.mcp.aiyoucli).toBeDefined();
    expect(content.mcp.aiyoucli.command).toEqual(["aiyoucli-mcp"]);
    expect(content.plugin).toContain("aiyou-team");
    expect(content.instructions).toContain("AGENTS.md");
  });

  it("deduplicates plugin[] when aiyou-team already present", async () => {
    const ocPath = join(tmpDir, "opencode.json");
    writeFileSync(
      ocPath,
      JSON.stringify({
        plugin: ["other-plugin", "aiyou-team"],
      }, null, 2) + "\n",
      "utf-8"
    );

    await generateSettings(tmpDir, ["opencode"]);
    const content = JSON.parse(readFileSync(ocPath, "utf-8"));
    expect(content.plugin).toEqual(["other-plugin", "aiyou-team"]);
    expect(content.plugin.filter((p: string) => p === "aiyou-team")).toHaveLength(1);
  });
});

describe("generateSettings — .claude/settings.json merge", () => {
  it("preserves existing settings and adds statusLine", async () => {
    const settingsPath = join(tmpDir, ".claude", "settings.json");
    mkdirSync(join(tmpDir, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        permissions: { allow: ["Bash(npm:*)"] },
        customHook: { command: "custom-cmd" },
      }, null, 2) + "\n",
      "utf-8"
    );

    await generateSettings(tmpDir, ["claude"]);
    const content = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(content.permissions.allow).toEqual(["Bash(npm:*)"]);
    expect(content.customHook.command).toBe("custom-cmd");
    expect(content.statusLine.command).toBe("aiyoucli statusline --compact");
  });
});

describe("generateSettings — .claude/settings.json hooks (--with-hooks)", () => {
  it("does NOT emit hooks block when withHooks is omitted (default off)", async () => {
    await generateSettings(tmpDir, ["claude"]);
    const content = JSON.parse(readFileSync(join(tmpDir, ".claude", "settings.json"), "utf-8"));
    expect(content.hooks).toBeUndefined();
  });

  it("emits PreToolUse/PostToolUse hooks when withHooks=true", async () => {
    await generateSettings(tmpDir, ["claude"], false, false, true);
    const content = JSON.parse(readFileSync(join(tmpDir, ".claude", "settings.json"), "utf-8"));
    expect(content.hooks.PreToolUse).toHaveLength(1);
    expect(content.hooks.PreToolUse[0].matcher).toBe("Edit|Write|MultiEdit");
    // The inline node -e script shell-outs to `aiyoucli hooks pre-task` — the
    // substring `"pre-task"` appears literally in the args array, and
    // `"aiyoucli"` appears literally in the spawnSync call. Both must be there.
    const preCmd = content.hooks.PreToolUse[0].hooks[0].command;
    expect(preCmd).toContain("pre-task");
    expect(preCmd).toContain("aiyoucli");
    expect(preCmd).not.toContain("AIYOUCLI_AUTO_AGENT"); // only in post
    expect(content.hooks.PreToolUse[0].hooks[0].timeout).toBe(15);
    expect(content.hooks.PostToolUse[0].matcher).toBe("Edit|Write|MultiEdit");
    const postCmd = content.hooks.PostToolUse[0].hooks[0].command;
    expect(postCmd).toContain("post-task");
    expect(postCmd).toContain("aiyoucli");
    expect(postCmd).toContain("AIYOUCLI_AUTO_AGENT");
    expect(content.hooks.PostToolUse[0].hooks[0].timeout).toBe(15);
    // statusLine preserved alongside the new hooks block
    expect(content.statusLine.command).toBe("aiyoucli statusline --compact");
  });

  it("merges hooks with existing user-written PreToolUse (no clobber)", async () => {
    const settingsPath = join(tmpDir, ".claude", "settings.json");
    mkdirSync(join(tmpDir, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "*", hooks: [{ type: "command", command: "user-formatter.sh", timeout: 10 }] },
          ],
        },
      }, null, 2) + "\n",
      "utf-8"
    );

    await generateSettings(tmpDir, ["claude"], false, false, true);
    const content = JSON.parse(readFileSync(settingsPath, "utf-8"));
    // User's formatter hook preserved AND aiyoucli entry appended
    expect(content.hooks.PreToolUse.some((h: { hooks: { command: string }[] }) =>
      h.hooks[0].command.includes("user-formatter")
    )).toBe(true);
    expect(content.hooks.PreToolUse.some((h: { hooks: { command: string }[] }) =>
      h.hooks[0].command.includes("pre-task") &&
      h.hooks[0].command.includes("aiyoucli")
    )).toBe(true);
    expect(content.hooks.PostToolUse).toHaveLength(1);
  });

  it("is idempotent — re-running withHooks=true does not duplicate hooks", async () => {
    await generateSettings(tmpDir, ["claude"], false, false, true);
    await generateSettings(tmpDir, ["claude"], false, false, true);
    const content = JSON.parse(readFileSync(join(tmpDir, ".claude", "settings.json"), "utf-8"));
    // deepMerge dedups by JSON.stringify — exactly one PreToolUse entry from us
    expect(content.hooks.PreToolUse.filter((h: { hooks: { command: string }[] }) =>
      h.hooks[0].command.includes("pre-task") &&
      h.hooks[0].command.includes("aiyoucli")
    )).toHaveLength(1);
    expect(content.hooks.PostToolUse).toHaveLength(1);
  });
});

describe("generateSettings — docs (CLAUDE.md / OPENCODE.md / GEMINI.md)", () => {
  it("does not overwrite existing CLAUDE.md (preserves user content)", async () => {
    const claudePath = join(tmpDir, "CLAUDE.md");
    writeFileSync(claudePath, "# My custom CLAUDE.md\n\nDon't touch me!\n", "utf-8");

    const results = await generateSettings(tmpDir, ["claude"]);
    const result = findResult(results, "CLAUDE.md");
    expect(result.status).toBe("skipped");

    const content = readFileSync(claudePath, "utf-8");
    expect(content).toBe("# My custom CLAUDE.md\n\nDon't touch me!\n");
  });

  it("creates CLAUDE.md when it doesn't exist", async () => {
    const results = await generateSettings(tmpDir, ["claude"]);
    const result = findResult(results, "CLAUDE.md");
    expect(result.status).toBe("created");
    expect(existsSync(join(tmpDir, "CLAUDE.md"))).toBe(true);
  });
});

describe("generateSettings — common files", () => {
  it("always marks statusline.cjs as updated", async () => {
    const results = await generateSettings(tmpDir, ["opencode"]);
    const statusline = results.find((r) => r.path.endsWith("statusline.cjs"));
    expect(statusline).toBeDefined();
    expect(statusline!.status).toBe("updated");
  });

  it("marks agents.dsi.toon as updated when AGENTS.md exists", async () => {
    writeFileSync(join(tmpDir, "AGENTS.md"), "# Test agents\n\nBuild, test, lint\n", "utf-8");

    const results = await generateSettings(tmpDir, ["opencode"]);
    const toon = results.find((r) => r.path.endsWith("agents.dsi.toon"));
    expect(toon).toBeDefined();
    expect(toon!.status).toBe("updated");
  });
});

describe("generateSettings — opencode target only", () => {
  it("only generates opencode files when --tool opencode", async () => {
    const results = await generateSettings(tmpDir, ["opencode"]);

    const paths = results.map((r) => r.path);
    expect(paths.some((p) => p.endsWith("opencode.json"))).toBe(true);
    expect(paths.some((p) => p.endsWith("OPENCODE.md"))).toBe(true);
    // No claude files
    expect(paths.some((p) => p.endsWith(".mcp.json"))).toBe(false);
    expect(paths.some((p) => p.endsWith("CLAUDE.md"))).toBe(false);
    expect(paths.some((p) => p.endsWith("settings.json"))).toBe(false);
  });
});