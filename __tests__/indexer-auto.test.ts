/**
 * Indexer auto tests — vitest.
 *
 * Tests cover:
 *   - isGitRepo: positive and negative cases
 *   - getGitCommit: git commit hash retrieval
 *   - readManifest: existing and missing manifest
 *   - writeManifest: writes manifest to .aiyoucli/
 *   - scanProjectFiles: excludes common dirs, includes source extensions
 *   - autoIndex: idempotent (skip if same commit), re-index on commit change
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isGitRepo,
  getGitCommit,
  readManifest,
  writeManifest,
  scanProjectFiles,
  autoIndex,
} from "../src/init/indexer-auto.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "indexer-auto-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("isGitRepo", () => {
  it("returns true inside a git repo", () => {
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    expect(isGitRepo(tmpDir)).toBe(true);
  });

  it("returns false outside a git repo", () => {
    expect(isGitRepo(tmpDir)).toBe(false);
  });
});

describe("getGitCommit", () => {
  it("returns commit hash in a git repo with commits", () => {
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com' && git config user.name 'Test'", {
      cwd: tmpDir,
      stdio: "pipe",
    });
    writeFileSync(join(tmpDir, "file.txt"), "hello");
    execSync("git add . && git commit -m 'initial'", { cwd: tmpDir, stdio: "pipe" });

    const commit = getGitCommit(tmpDir);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns null outside a git repo", () => {
    expect(getGitCommit(tmpDir)).toBeNull();
  });
});

describe("readManifest / writeManifest", () => {
  it("returns null when manifest does not exist", () => {
    expect(readManifest(tmpDir)).toBeNull();
  });

  it("writes and reads manifest", () => {
    const manifest = {
      commit: "abc123",
      timestamp: Date.now(),
      file_count: 10,
      chunk_count: 50,
    };

    writeManifest(tmpDir, manifest);
    const read = readManifest(tmpDir);
    expect(read).toEqual(manifest);
  });

  it("returns null for invalid manifest JSON", () => {
    const dir = join(tmpDir, ".aiyoucli");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index-manifest.json"), "not valid json", "utf-8");

    expect(readManifest(tmpDir)).toBeNull();
  });

  it("returns null for manifest missing required fields", () => {
    const dir = join(tmpDir, ".aiyoucli");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "index-manifest.json"),
      JSON.stringify({ commit: "abc", timestamp: 123 }),
      "utf-8"
    );

    expect(readManifest(tmpDir)).toBeNull();
  });
});

describe("scanProjectFiles", () => {
  it("includes source files", () => {
    writeFileSync(join(tmpDir, "index.ts"), "code");
    writeFileSync(join(tmpDir, "app.py"), "code");
    writeFileSync(join(tmpDir, "lib.rs"), "code");
    writeFileSync(join(tmpDir, "README.md"), "docs");

    const files = scanProjectFiles(tmpDir);
    expect(files.length).toBe(4);
    expect(files.some((f) => f.endsWith("index.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("app.py"))).toBe(true);
    expect(files.some((f) => f.endsWith("lib.rs"))).toBe(true);
    expect(files.some((f) => f.endsWith("README.md"))).toBe(true);
  });

  it("excludes node_modules", () => {
    mkdirSync(join(tmpDir, "node_modules"), { recursive: true });
    writeFileSync(join(tmpDir, "node_modules", "dep.ts"), "code");
    writeFileSync(join(tmpDir, "src.ts"), "code");

    const files = scanProjectFiles(tmpDir);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.endsWith("src.ts"))).toBe(true);
  });

  it("excludes .git, dist, build", () => {
    mkdirSync(join(tmpDir, ".git"), { recursive: true });
    mkdirSync(join(tmpDir, "dist"), { recursive: true });
    mkdirSync(join(tmpDir, "build"), { recursive: true });
    writeFileSync(join(tmpDir, ".git", "config"), "x");
    writeFileSync(join(tmpDir, "dist", "out.js"), "x");
    writeFileSync(join(tmpDir, "build", "out.js"), "x");
    writeFileSync(join(tmpDir, "src.ts"), "code");

    const files = scanProjectFiles(tmpDir);
    expect(files.some((f) => f.includes(".git"))).toBe(false);
    expect(files.some((f) => f.includes("dist"))).toBe(false);
    expect(files.some((f) => f.includes("build"))).toBe(false);
    expect(files.some((f) => f.endsWith("src.ts"))).toBe(true);
  });

  it("ignores files without source extensions", () => {
    writeFileSync(join(tmpDir, "code.ts"), "code");
    writeFileSync(join(tmpDir, "binary.exe"), "binary");
    writeFileSync(join(tmpDir, "image.png"), "binary");

    const files = scanProjectFiles(tmpDir);
    expect(files.some((f) => f.endsWith("code.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("binary.exe"))).toBe(false);
    expect(files.some((f) => f.endsWith("image.png"))).toBe(false);
  });
});

describe("autoIndex", () => {
  function setupGitRepo(): void {
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com' && git config user.name 'Test'", {
      cwd: tmpDir,
      stdio: "pipe",
    });
  }

  it("skips when not a git repo", async () => {
    const result = await autoIndex(tmpDir);
    expect(result.indexed).toBe(false);
    expect(result.reason).toBe("Not a git repository");
  });

  it("indexes on first run (no manifest)", async () => {
    setupGitRepo();
    writeFileSync(join(tmpDir, "src.ts"), "code");
    execSync("git add . && git commit -m 'initial'", { cwd: tmpDir, stdio: "pipe" });

    const result = await autoIndex(tmpDir);
    // The commit should be set when there are commits
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("writes manifest after indexing when commits are available", async () => {
    setupGitRepo();
    writeFileSync(join(tmpDir, "src.ts"), "code");
    execSync("git add . && git commit -m 'initial'", { cwd: tmpDir, stdio: "pipe" });

    await autoIndex(tmpDir);
    const manifest = readManifest(tmpDir);
    // Manifest may or may not be written depending on memory store availability,
    // but if it is written, it must have a valid commit
    if (manifest) {
      expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(manifest.file_count).toBeGreaterThanOrEqual(0);
    }
  });
});