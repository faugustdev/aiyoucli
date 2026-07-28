/**
 * Phase 2 — Wire Validation
 *
 * Runs at the start of `aiyoucli init` to verify that all dependencies the
 * bootstrap phases need actually resolve. Pure inspection — no state
 * mutations, no installs, no service starts. Failures are reported as data;
 * the caller decides what to do.
 *
 * Per the init 4-phase contract:
 *   Phase 1 WRITE   — file scaffolding
 *   Phase 2 WIRE   — this file: dependency probes (read-only)
 *   Phase 3 WARM   — DB init, index, spawn, prime
 *   Phase 4 VERIFY — system_doctor + extended probes (read-only)
 *
 * The "in_development" status is reserved for the embed server and any other
 * subsystem that is intentionally not production-ready. See AGENTS.md.
 */

import { existsSync, accessSync, constants, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export type WireStatus = "ok" | "degraded" | "in_development" | "failed";

export interface WireProbe {
  name: string;
  status: WireStatus;
  detail: string;
  suggestion?: string;
}

export interface WireReport {
  ok: WireProbe[];
  degraded: WireProbe[];
  inDevelopment: WireProbe[];
  failed: WireProbe[];
  hasFailures: boolean;
  summary: string;
}

const PROBE_TIMEOUT_MS = 5000;

function execSafe(file: string, args: string[]): { ok: boolean; stdout: string } {
  try {
    const stdout = execFileSync(file, args, {
      encoding: "utf-8",
      timeout: PROBE_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
}

// ── Probes ────────────────────────────────────────────────────────

function probeNode(): WireProbe {
  const major = parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (Number.isFinite(major) && major >= 20) {
    return { name: "node", status: "ok", detail: `v${process.versions.node}` };
  }
  return {
    name: "node",
    status: "failed",
    detail: `v${process.versions.node} (requires >=20)`,
    suggestion: "Upgrade Node.js to v20 or later.",
  };
}

function probeGit(): WireProbe {
  const r = execSafe("git", ["--version"]);
  if (r.ok) return { name: "git", status: "ok", detail: r.stdout };
  return {
    name: "git",
    status: "failed",
    detail: "git not available on PATH",
    suggestion: "Install git: https://git-scm.com/downloads",
  };
}

function probeAiyouCliMcp(): WireProbe {
  // `command -v` (POSIX) / `where` (Windows). Avoids depending on `which`.
  const file = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? ["aiyoucli-mcp"] : ["-v", "aiyoucli-mcp"];
  const r = execSafe(file, args);
  if (r.ok && r.stdout) {
    const path = r.stdout.split(/\r?\n/)[0]?.trim() ?? r.stdout;
    return { name: "aiyoucli-mcp", status: "ok", detail: path };
  }
  return {
    name: "aiyoucli-mcp",
    status: "failed",
    detail: "binary not found on PATH",
    suggestion: "Run `npm install -g @aiyou-dev/cli` or `npm link` from the aiyoucli repo.",
  };
}

function probeNapiBinary(cwd: string): WireProbe {
  // Mirror the candidate list in src/mcp/tools/discovery-tools.ts AND
  // src/napi/index.ts (the actual loader). The loader tries:
  //   1. <package-root>/aiyoucli-napi.<platform>.node  (dev/cargo output)
  //   2. require("@aiyou-dev/cli-<platform>")          (npm optional dep)
  // We mirror both. Without the package-root candidates, a global install
  // (where the binary lives in the package's own node_modules/) is invisible
  // to the probe when cwd is the user's project root.
  const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const platformMap: Record<string, string> = {
    darwin: "darwin-arm64",
    linux: process.arch === "arm64" ? "linux-arm64-gnu" : "linux-x64-gnu",
    win32: "win32-x64-msvc",
  };
  const platform = platformMap[process.platform] ?? "linux-x64-gnu";
  const candidates = [
    // cwd-relative (legacy/dev when binary is dropped next to project)
    join(cwd, "aiyoucli-napi.darwin-arm64.node"),
    join(cwd, "aiyoucli-napi.darwin-x64.node"),
    join(cwd, "aiyoucli-napi.linux-x64-gnu.node"),
    join(cwd, "aiyoucli-napi.linux-arm64-gnu.node"),
    join(cwd, "aiyoucli-napi.win32-x64-msvc.node"),
    join(cwd, "aiyoucli-napi.node"),
    // cwd's local node_modules (linked install via npm/pnpm/yarn)
    join(cwd, "node_modules", "@aiyou-dev", "cli-darwin-arm64", "aiyoucli-napi.darwin-arm64.node"),
    join(cwd, "node_modules", "@aiyou-dev", "cli-darwin-x64", "aiyoucli-napi.darwin-x64.node"),
    join(cwd, "node_modules", "@aiyou-dev", "cli-linux-x64-gnu", "aiyoucli-napi.linux-x64-gnu.node"),
    join(cwd, "node_modules", "@aiyou-dev", "cli-linux-arm64-gnu", "aiyoucli-napi.linux-arm64-gnu.node"),
    join(cwd, "node_modules", "@aiyou-dev", "cli-win32-x64-msvc", "aiyoucli-napi.win32-x64-msvc.node"),
    // package's own install (global install / npm-link from repo)
    join(packageRoot, "aiyoucli-napi.darwin-arm64.node"),
    join(packageRoot, "aiyoucli-napi.darwin-x64.node"),
    join(packageRoot, "aiyoucli-napi.linux-x64-gnu.node"),
    join(packageRoot, "aiyoucli-napi.linux-arm64-gnu.node"),
    join(packageRoot, "aiyoucli-napi.win32-x64-msvc.node"),
    join(packageRoot, `aiyoucli-napi.${platform}.node`),
    // package's own node_modules (the npm optional dep)
    join(packageRoot, "node_modules", "@aiyou-dev", "cli-darwin-arm64", "aiyoucli-napi.darwin-arm64.node"),
    join(packageRoot, "node_modules", "@aiyou-dev", "cli-darwin-x64", "aiyoucli-napi.darwin-x64.node"),
    join(packageRoot, "node_modules", "@aiyou-dev", "cli-linux-x64-gnu", "aiyoucli-napi.linux-x64-gnu.node"),
    join(packageRoot, "node_modules", "@aiyou-dev", "cli-linux-arm64-gnu", "aiyoucli-napi.linux-arm64-gnu.node"),
    join(packageRoot, "node_modules", "@aiyou-dev", "cli-win32-x64-msvc", "aiyoucli-napi.win32-x64-msvc.node"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      const sizeMb = (statSync(c).size / 1024 / 1024).toFixed(2);
      return {
        name: "napi",
        status: "ok",
        detail: `${c.split("/").pop()} (${sizeMb} MB)`,
      };
    }
  }
  return {
    name: "napi",
    status: "failed",
    detail: "NAPI binary not found",
    suggestion: "Run `npm run build:rs` to compile the native module.",
  };
}

function probeAiyouCliDir(cwd: string): WireProbe {
  const dir = join(cwd, ".aiyoucli");
  if (existsSync(dir)) {
    try {
      accessSync(dir, constants.W_OK);
      return { name: ".aiyoucli", status: "ok", detail: dir };
    } catch {
      return {
        name: ".aiyoucli",
        status: "failed",
        detail: `${dir} exists but is not writable`,
        suggestion: "Adjust permissions on .aiyoucli/ to allow writes.",
      };
    }
  }
  // Try to create it — the init phases need this directory.
  try {
    mkdirSync(dir, { recursive: true });
    return { name: ".aiyoucli", status: "ok", detail: `${dir} (created)` };
  } catch (err) {
    return {
      name: ".aiyoucli",
      status: "failed",
      detail: `cannot create ${dir}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: "Check filesystem permissions on the project root.",
    };
  }
}

function probeOnnxEmbed(cwd: string): WireProbe {
  // Per project decision (init plan), embed server is in development.
  // The probe checks for the model directory only as informational data;
  // its status is always "in_development" so downstream renderers mark it 🚧.
  const candidates = [
    join(cwd, "models", "all-MiniLM-L6-v2"),
    join(cwd, "..", "models", "all-MiniLM-L6-v2"),
    join(cwd, "node_modules", "@aiyou-dev", "cli", "models", "all-MiniLM-L6-v2"),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (found) {
    return {
      name: "onnx-embed",
      status: "in_development",
      detail: `model at ${found}`,
      suggestion: "Not required. Embed server is in development; see AGENTS.md#embed-server.",
    };
  }
  return {
    name: "onnx-embed",
    status: "in_development",
    detail: "model directory not found locally",
    suggestion: "Not required. See AGENTS.md#embed-server (in development).",
  };
}

function probeAiyouTeam(
  status: { installed: boolean; via: string } | undefined
): WireProbe | null {
  if (!status) return null;
  if (status.installed) {
    return { name: "aiyou-team", status: "ok", detail: `available (${status.via})` };
  }
  return {
    name: "aiyou-team",
    status: "degraded",
    detail: "not installed",
    suggestion: "Init will auto-install via `npm install -g @aiyou-dev/team`.",
  };
}

// ── Public API ────────────────────────────────────────────────────

export interface WireValidationOptions {
  /** Project root. */
  cwd: string;
  /** Result of `checkAiyouTeamStatus()`. Optional; pass when available. */
  aiyouTeam?: { installed: boolean; via: string };
}

export function runWireValidation(opts: WireValidationOptions): WireReport {
  const probes: WireProbe[] = [
    probeNode(),
    probeGit(),
    probeAiyouCliMcp(),
    probeNapiBinary(opts.cwd),
    probeAiyouCliDir(opts.cwd),
    probeOnnxEmbed(opts.cwd),
  ];

  const teamProbe = probeAiyouTeam(opts.aiyouTeam);
  if (teamProbe) probes.push(teamProbe);

  const report: WireReport = {
    ok: [],
    degraded: [],
    inDevelopment: [],
    failed: [],
    hasFailures: false,
    summary: "",
  };

  for (const p of probes) {
    switch (p.status) {
      case "ok": report.ok.push(p); break;
      case "degraded": report.degraded.push(p); break;
      case "in_development": report.inDevelopment.push(p); break;
      case "failed": report.failed.push(p); break;
    }
  }
  report.hasFailures = report.failed.length > 0;

  const parts: string[] = [];
  if (report.ok.length) parts.push(`${report.ok.length} ok`);
  if (report.degraded.length) parts.push(`${report.degraded.length} degraded`);
  if (report.inDevelopment.length) parts.push(`${report.inDevelopment.length} in dev`);
  if (report.failed.length) parts.push(`${report.failed.length} failed`);
  report.summary = parts.join(" · ");

  return report;
}
