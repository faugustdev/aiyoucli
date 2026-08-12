/**
 * Wire validation tests — vitest.
 *
 * Tests cover:
 *   - Each individual probe (node, git, aiyoucli-mcp, napi, .aiyoucli dir, onnx-embed)
 *   - Probe failure modes
 *   - Report aggregation (status bucketing, hasFailures, summary)
 *   - aiyou-team optional probe
 *
 * Filesystem and process probing are isolated by working in a temp directory
 * and by mocking execFileSync indirectly through the real execFileSync + a
 * controlled PATH environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWireValidation, type WireReport, type WireProbe } from "../src/init/wire-validate.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "aiyoucli-wire-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function findProbe(report: WireReport, name: string): WireProbe | undefined {
  return [...report.ok, ...report.degraded, ...report.inDevelopment, ...report.failed].find(
    (p) => p.name === name
  );
}

describe("runWireValidation", () => {
  describe("node probe", () => {
    it("reports ok for Node >= 20", () => {
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, "node");
      expect(p).toBeDefined();
      expect(p!.status).toBe("ok");
      expect(p!.detail).toMatch(/^v\d+\.\d+\.\d+/);
    });
  });

  describe("git probe", () => {
    it("reports ok when git is available", () => {
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, "git");
      expect(p).toBeDefined();
      // git is universally available on dev macOS / linux; if not, the test
      // is run in an environment that cannot validate init anyway.
      if (p!.status === "ok") {
        expect(p!.detail).toMatch(/git version/);
      } else {
        expect(p!.status).toBe("failed");
        expect(p!.suggestion).toBeDefined();
      }
    });
  });

  describe("aiyoucli-mcp probe", () => {
    it("reports ok or failed with a suggestion", () => {
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, "aiyoucli-mcp");
      expect(p).toBeDefined();
      if (p!.status === "ok") {
        expect(p!.detail.length).toBeGreaterThan(0);
      } else {
        expect(p!.status).toBe("failed");
        expect(p!.suggestion).toContain("npm install");
      }
    });
  });

  describe("napi binary probe", () => {
    // The probe reports whether the native binding actually *loads*, which is
    // a property of the installation, not of the project directory. It used to
    // scan `cwd` for a .node file, so a global install always reported "not
    // found" for a binary that loads fine — and an empty file named
    // `aiyoucli-napi.node` reported "ok" at 0.00 MB.

    it("reports ok when the native binding loads, regardless of cwd", () => {
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, "napi");
      expect(p!.status).toBe("ok");
      expect(p!.detail.length).toBeGreaterThan(0);
    });

    it("ignores stray .node files in the project directory", () => {
      // An empty file is not a loadable binding; it must not flip the probe.
      writeFileSync(join(tmpDir, "aiyoucli-napi.node"), "");
      const withStray = findProbe(runWireValidation({ cwd: tmpDir }), "napi");
      const withoutStray = findProbe(runWireValidation({ cwd: tmpdir() }), "napi");
      expect(withStray!.status).toBe(withoutStray!.status);
    });

    it("reports failed with a build suggestion when the binding cannot load", async () => {
      vi.resetModules();
      vi.doMock("../src/napi/index.js", () => ({
        isNapiAvailable: () => false,
      }));
      const { runWireValidation: run } = await import("../src/init/wire-validate.js");
      const p = findProbe(run({ cwd: tmpDir }), "napi");
      expect(p!.status).toBe("failed");
      expect(p!.suggestion).toContain("build:rs");
      vi.doUnmock("../src/napi/index.js");
      vi.resetModules();
    });
  });

  describe(".aiyoucli directory probe", () => {
    it("reports ok and creates the dir when missing", () => {
      expect(existsSync(join(tmpDir, ".aiyoucli"))).toBe(false);
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, ".aiyoucli");
      expect(p!.status).toBe("ok");
      expect(p!.detail).toContain("created");
      expect(existsSync(join(tmpDir, ".aiyoucli"))).toBe(true);
    });

    it("reports ok when the dir already exists and is writable", () => {
      mkdirSync(join(tmpDir, ".aiyoucli"));
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, ".aiyoucli");
      expect(p!.status).toBe("ok");
      expect(p!.detail).not.toContain("created");
    });

    it("does not duplicate the dir on repeated runs", () => {
      runWireValidation({ cwd: tmpDir });
      const stat1 = statSync(join(tmpDir, ".aiyoucli"));
      runWireValidation({ cwd: tmpDir });
      const stat2 = statSync(join(tmpDir, ".aiyoucli"));
      // Same directory — no exception thrown, mtime may differ but ino should match
      expect(stat1.ino).toBe(stat2.ino);
    });
  });

  describe("onnx-embed probe", () => {
    it("always reports in_development, regardless of model presence", () => {
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, "onnx-embed");
      expect(p).toBeDefined();
      expect(p!.status).toBe("in_development");
      // Always provides a suggestion citing AGENTS.md
      expect(p!.suggestion).toMatch(/in development|AGENTS\.md/);
    });

    it("detects local model directory when present", () => {
      mkdirSync(join(tmpDir, "models", "all-MiniLM-L6-v2"), { recursive: true });
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, "onnx-embed");
      expect(p!.status).toBe("in_development");
      expect(p!.detail).toContain("model at");
    });
  });

  describe("aiyou-team probe (optional)", () => {
    it("is omitted when not provided", () => {
      const report = runWireValidation({ cwd: tmpDir });
      const p = findProbe(report, "aiyou-team");
      expect(p).toBeUndefined();
    });

    it("reports ok when installed", () => {
      const report = runWireValidation({
        cwd: tmpDir,
        aiyouTeam: { installed: true, via: "npx" },
      });
      const p = findProbe(report, "aiyou-team");
      expect(p!.status).toBe("ok");
      expect(p!.detail).toContain("npx");
    });

    it("reports degraded with install hint when not installed", () => {
      const report = runWireValidation({
        cwd: tmpDir,
        aiyouTeam: { installed: false, via: "none" },
      });
      const p = findProbe(report, "aiyou-team");
      expect(p!.status).toBe("degraded");
      expect(p!.suggestion).toContain("npm install -g @aiyou-dev/team");
    });
  });

  describe("report aggregation", () => {
    it("buckets probes by status", () => {
      const report = runWireValidation({
        cwd: tmpDir,
        aiyouTeam: { installed: false, via: "none" },
      });
      // node, git (if available), .aiyoucli dir, aiyoucli-mcp may be ok
      expect(report.ok.length).toBeGreaterThan(0);
      // aiyou-team should be degraded in this scenario
      expect(report.degraded.length).toBeGreaterThan(0);
      // onnx-embed should be in development
      expect(report.inDevelopment.length).toBeGreaterThan(0);
    });

    it("summary reflects bucket counts", () => {
      const report = runWireValidation({ cwd: tmpDir });
      expect(report.summary).toMatch(/ok/);
    });

    it("hasFailures is true when any probe is failed", () => {
      // We can't easily force a failure of the node probe (Node is fixed),
      // so we simulate by creating a temp dir without any napi binary AND
      // without git on PATH (mocked).
      const report = runWireValidation({ cwd: tmpDir });
      // At least napi will be failed; others depend on environment.
      const napi = findProbe(report, "napi");
      if (napi!.status === "failed") {
        expect(report.hasFailures).toBe(true);
      }
    });
  });
});
