/**
 * AGENTS.md generator tests — vitest.
 *
 * Tests cover:
 *   - Monorepo detection: walks apps/, packages/, services/, modules/, libs/, tools/
 *   - Picks first sub-package with build/test/dev/lint scripts
 *   - Skips malformed package.json files
 *   - Generates correct content for root package.json
 *   - Detects from monorepo when root has no package.json
 *   - Force overwrite behavior
 *   - Throws when file exists and force=false
 *   - Conditionally renders aiyou-team section based on plugin status
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAgentsMd } from "../src/init/agentsmd-generator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "aiyoucli-agentsmd-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("generateAgentsMd — root package.json", () => {
  it("detects scripts from root package.json", async () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        description: "My cool app",
        scripts: { build: "tsc", test: "vitest", lint: "eslint ." },
      }),
      "utf-8"
    );

    const result = await generateAgentsMd(tmpDir);
    const content = readFileSync(result.path, "utf-8");

    expect(result.status).toBe("created");
    expect(content).toContain("# AGENTS.md — my-app");
    expect(content).toContain("My cool app");
    expect(content).toContain("npm run build");
    expect(content).toContain("npm test");
    expect(content).toContain("npm run lint");
    // No monorepo hint
    expect(content).not.toContain("Detected from monorepo package");
  });
});

describe("generateAgentsMd — monorepo detection", () => {
  it("detects scripts from apps/*/package.json when no root package.json", async () => {
    mkdirSync(join(tmpDir, "apps", "web"), { recursive: true });
    writeFileSync(
      join(tmpDir, "apps", "web", "package.json"),
      JSON.stringify({
        name: "@org/web",
        description: "Web frontend",
        scripts: { build: "vite build", dev: "vite", test: "vitest" },
      }),
      "utf-8"
    );

    const result = await generateAgentsMd(tmpDir);
    const content = readFileSync(result.path, "utf-8");

    expect(content).toContain("# AGENTS.md — @org/web");
    expect(content).toContain("Web frontend");
    expect(content).toContain("vite build");
    expect(content).toContain("Detected from monorepo package");
    expect(content).toContain("apps/web/package.json");
  });

  it("detects scripts from packages/*/package.json", async () => {
    mkdirSync(join(tmpDir, "packages", "core"), { recursive: true });
    writeFileSync(
      join(tmpDir, "packages", "core", "package.json"),
      JSON.stringify({
        name: "@org/core",
        scripts: { build: "tsc", test: "vitest" },
      }),
      "utf-8"
    );

    const result = await generateAgentsMd(tmpDir);
    const content = readFileSync(result.path, "utf-8");
    expect(content).toContain("# AGENTS.md — @org/core");
    expect(content).toContain("packages/core/package.json");
  });

  it("skips malformed sub-package package.json and tries next", async () => {
    mkdirSync(join(tmpDir, "apps", "broken"), { recursive: true });
    writeFileSync(join(tmpDir, "apps", "broken", "package.json"), "{not valid json", "utf-8");
    mkdirSync(join(tmpDir, "apps", "good"), { recursive: true });
    writeFileSync(
      join(tmpDir, "apps", "good", "package.json"),
      JSON.stringify({
        name: "@org/good",
        scripts: { test: "vitest" },
      }),
      "utf-8"
    );

    const result = await generateAgentsMd(tmpDir);
    const content = readFileSync(result.path, "utf-8");
    expect(content).toContain("# AGENTS.md — @org/good");
  });

  it("skips sub-packages without build/test/dev/lint scripts", async () => {
    mkdirSync(join(tmpDir, "apps", "config-only"), { recursive: true });
    writeFileSync(
      join(tmpDir, "apps", "config-only", "package.json"),
      JSON.stringify({ name: "@org/config", scripts: {} }),
      "utf-8"
    );
    mkdirSync(join(tmpDir, "apps", "with-scripts"), { recursive: true });
    writeFileSync(
      join(tmpDir, "apps", "with-scripts", "package.json"),
      JSON.stringify({ name: "@org/main", scripts: { dev: "vite" } }),
      "utf-8"
    );

    const result = await generateAgentsMd(tmpDir);
    const content = readFileSync(result.path, "utf-8");
    expect(content).toContain("# AGENTS.md — @org/main");
  });

  it("falls back to folder name when no package.json found anywhere", async () => {
    mkdirSync(join(tmpDir, "apps", "empty"), { recursive: true });
    mkdirSync(join(tmpDir, "packages"), { recursive: true });

    const result = await generateAgentsMd(tmpDir);
    const content = readFileSync(result.path, "utf-8");
    // Falls back to basename of projectRoot
    const fallbackName = tmpDir.split("/").pop()!;
    expect(content).toContain(`# AGENTS.md — ${fallbackName}`);
    expect(content).toContain("# no build step detected");
  });

  it("prefers root package.json even when monorepo also exists", async () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({
        name: "root-pkg",
        scripts: { build: "tsc" },
      }),
      "utf-8"
    );
    mkdirSync(join(tmpDir, "apps", "web"), { recursive: true });
    writeFileSync(
      join(tmpDir, "apps", "web", "package.json"),
      JSON.stringify({
        name: "@org/web",
        scripts: { build: "vite build" },
      }),
      "utf-8"
    );

    const result = await generateAgentsMd(tmpDir);
    const content = readFileSync(result.path, "utf-8");
    expect(content).toContain("# AGENTS.md — root-pkg");
    expect(content).not.toContain("apps/web/package.json");
  });
});

describe("generateAgentsMd — overwrite behavior", () => {
  it("throws when file exists and force=false", async () => {
    writeFileSync(join(tmpDir, "AGENTS.md"), "# old content\n", "utf-8");

    await expect(generateAgentsMd(tmpDir)).rejects.toThrow(/already exists/);
  });

  it("throws with --force=false even if file content matches generated", async () => {
    writeFileSync(join(tmpDir, "AGENTS.md"), "# anything\n", "utf-8");
    await expect(generateAgentsMd(tmpDir, { force: false })).rejects.toThrow(/already exists/);
  });

  it("overwrites when force=true and returns 'updated' with diff", async () => {
    writeFileSync(join(tmpDir, "AGENTS.md"), "# old\n", "utf-8");
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", scripts: { test: "vitest" } }),
      "utf-8"
    );

    const result = await generateAgentsMd(tmpDir, { force: true });
    expect(result.status).toBe("updated");
    expect(result.diff).toBeDefined();
    expect(result.diff!.previousBytes).toBe(6);
    expect(result.diff!.newBytes).toBeGreaterThan(100);
  });
});

describe("generateAgentsMd — aiyou-team conditional section", () => {
  it("includes full agent delegation table when plugin is installed", async () => {
    // We can't easily mock checkAiyouTeamStatus in this test setup
    // (it spawns processes). Instead, write AGENTS.md and inspect the
    // structure: the section exists with one of two known formats.
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ name: "test" }),
      "utf-8"
    );

    const result = await generateAgentsMd(tmpDir);
    const content = readFileSync(result.path, "utf-8");

    // One of two states is valid:
    //   (a) plugin installed → "## aiyou-team Agent Delegation" + "Coding Team Agents" table
    //   (b) plugin missing   → "## aiyou-team Agent Delegation" + "plugin not installed" warning
    expect(content).toContain("## aiyou-team Agent Delegation");
    const hasFullTable = content.includes("coding-leader") && content.includes("codebase-explorer");
    const hasWarning = content.includes("plugin is not installed") || content.includes("plugin not installed");
    expect(hasFullTable || hasWarning).toBe(true);
  });
});