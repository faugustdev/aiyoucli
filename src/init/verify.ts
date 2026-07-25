/**
 * Phase 4 — Verify
 *
 * Runs at the end of `aiyoucli init`. Aggregates health signals from the
 * MCP tool surface (system_doctor, capabilities, status, stats, memory_count)
 * into a single report that the CLI renders as a table.
 *
 * Read-only: every tool called is informational. No state mutations.
 *
 * The "in_development" status is reserved for the embed server and any
 * other subsystem that is intentionally not production-ready.
 */

import { output, color } from "../output.js";
import type { WireReport } from "./wire-validate.js";

export type VerifyStatus = "ok" | "degraded" | "in_development" | "failed";

export interface VerifyRow {
  name: string;
  status: VerifyStatus;
  detail: string;
  suggestion?: string;
}

export interface VerifyReport {
  rows: VerifyRow[];
  clean: boolean;
  hasFailures: boolean;
  summary: string;
}

/**
 * Minimal contract the probes need from the MCP layer. Decoupled from the
 * concrete `callTool` so tests can inject a stub.
 */
export type ToolCaller = (
  name: string,
  input: Record<string, unknown>
) => Promise<{ ok: boolean; text: string; isError?: boolean }>;

function parseJsonOrText(text: string): { ok: boolean; data: unknown; raw: string } {
  try {
    return { ok: true, data: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, data: undefined, raw: text };
  }
}

function okIfText(
  r: { ok: boolean; text: string; isError?: boolean } | undefined
): { ok: boolean; text: string; parsed: unknown } {
  if (!r) return { ok: false, text: "", parsed: undefined };
  if (r.isError) return { ok: false, text: r.text, parsed: undefined };
  const parsed = parseJsonOrText(r.text);
  return { ok: true, text: r.text, parsed: parsed.data };
}

// ── Individual probes ────────────────────────────────────────────

async function probeSystemDoctor(c: ToolCaller): Promise<VerifyRow> {
  const r = okIfText(await c("system_doctor", {}));
  if (!r.ok) {
    return {
      name: "Doctor",
      status: "failed",
      detail: r.text || "system_doctor returned an error",
      suggestion: "Run `aiyoucli doctor` for details.",
    };
  }
  const data = r.parsed as { healthy?: boolean; checks?: Array<{ status: string }> } | undefined;
  const passed = data?.checks?.filter((x) => x.status === "ok" || x.status === "pass").length ?? 0;
  const total = data?.checks?.length ?? 0;
  if (data?.healthy === true) {
    return { name: "Doctor", status: "ok", detail: `${passed}/${total} checks passed` };
  }
  return {
    name: "Doctor",
    status: "degraded",
    detail: `${passed}/${total} checks passed`,
    suggestion: "Run `aiyoucli doctor` for the full report.",
  };
}

async function probeCapabilities(c: ToolCaller): Promise<VerifyRow[]> {
  const r = okIfText(await c("capabilities", {}));
  if (!r.ok) {
    return [
      {
        name: "NAPI",
        status: "degraded",
        detail: r.text || "capabilities tool unavailable",
        suggestion: "Check NAPI binary at project root.",
      },
    ];
  }
  const data = r.parsed as {
    napi?: { available?: boolean; features?: string[] };
    aiyou_team?: { available?: boolean; version?: string | null; via?: string };
    embed_server?: { running?: boolean; port?: number };
  } | undefined;

  const rows: VerifyRow[] = [];

  // NAPI
  if (data?.napi?.available) {
    const featureCount = data.napi.features?.length ?? 0;
    rows.push({
      name: "NAPI",
      status: "ok",
      detail: `${featureCount} features available`,
    });
  } else {
    rows.push({
      name: "NAPI",
      status: "failed",
      detail: "NAPI binary unavailable",
      suggestion: "Run `npm run build:rs`.",
    });
  }

  // aiyou-team
  if (data?.aiyou_team?.available) {
    rows.push({
      name: "aiyou-team",
      status: "ok",
      detail: `v${data.aiyou_team.version ?? "?"} via ${data.aiyou_team.via ?? "?"}`,
    });
  } else {
    rows.push({
      name: "aiyou-team",
      status: "degraded",
      detail: "not detected",
      suggestion: "Run `aiyoucli setup` to install.",
    });
  }

  // Embed server — always in_development per project decision.
  rows.push({
    name: "Embed Server",
    status: "in_development",
    detail: data?.embed_server?.running
      ? `running on :${data.embed_server.port ?? 8001} (not yet used by init)`
      : "not running (in development — see AGENTS.md)",
    suggestion: "Manual start only. Not required for init to succeed.",
  });

  return rows;
}

async function probeMemory(c: ToolCaller): Promise<VerifyRow> {
  const r = okIfText(await c("memory_count", {}));
  if (!r.ok) {
    return {
      name: "Memory",
      status: "failed",
      detail: r.text || "memory_count failed",
      suggestion: "Phase 3 will call memory_init. If this persists, check NAPI.",
    };
  }
  // Output format: "Vectors: 1247" or similar
  const match = r.text.match(/(\d+)/);
  const count = match ? parseInt(match[1] ?? "0", 10) : 0;
  return {
    name: "Memory",
    status: count > 0 ? "ok" : "degraded",
    detail: count > 0 ? `HNSW 8d · ${count} vectors` : "empty (Phase 3 will init)",
    suggestion: count > 0 ? undefined : "Run `aiyoucli init` to initialize.",
  };
}

// ── Public API ────────────────────────────────────────────────────

export interface VerifyOptions {
  cwd: string;
  callTool: ToolCaller;
  /** Per-tool timeout. Default 5s. */
  timeoutMs?: number;
}

export async function runVerification(opts: VerifyOptions): Promise<VerifyReport> {
  const results = await Promise.allSettled([
    probeSystemDoctor(opts.callTool),
    probeCapabilities(opts.callTool),
    probeMemory(opts.callTool),
  ]);

  const rows: VerifyRow[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      const v = r.value;
      rows.push(...(Array.isArray(v) ? v : [v]));
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      rows.push({
        name: "Unknown",
        status: "failed",
        detail: `probe crashed: ${reason}`,
      });
    }
  }

  const hasFailures = rows.some((r) => r.status === "failed");
  const clean =
    !hasFailures &&
    rows.every((r) => r.status === "ok" || r.status === "in_development");

  const parts: string[] = [];
  const okCount = rows.filter((r) => r.status === "ok").length;
  const devCount = rows.filter((r) => r.status === "in_development").length;
  const degCount = rows.filter((r) => r.status === "degraded").length;
  const failCount = rows.filter((r) => r.status === "failed").length;
  if (okCount) parts.push(`${okCount} ok`);
  if (devCount) parts.push(`${devCount} in dev`);
  if (degCount) parts.push(`${degCount} degraded`);
  if (failCount) parts.push(`${failCount} failed`);

  return {
    rows,
    clean,
    hasFailures,
    summary: parts.join(" · "),
  };
}

// ── Renderer ──────────────────────────────────────────────────────

const ICONS: Record<VerifyStatus, string> = {
  ok: color.green("✓"),
  degraded: color.yellow("⚠"),
  in_development: color.gray("🚧"),
  failed: color.red("✗"),
};

export function renderVerifyReport(report: VerifyReport): void {
  if (output.isQuiet()) return;

  const rows: string[][] = report.rows.map((r) => [
    `${ICONS[r.status]}  ${r.name}`,
    r.detail,
  ]);

  output.log("");
  output.log(color.bold("Bootstrap verification"));
  output.table(["Subsystem", "Status"], rows, { padding: 2 });

  // Surface suggestions for non-ok rows
  const suggestions = report.rows.filter(
    (r) => r.suggestion && r.status !== "ok"
  );
  if (suggestions.length > 0) {
    output.log("");
    output.log(color.dim("Suggestions:"));
    for (const s of suggestions) {
      output.log(`  ${color.gray("·")} ${color.bold(s.name)}: ${s.suggestion}`);
    }
  }
}

export function renderWireReport(wire: WireReport): void {
  if (output.isQuiet()) return;

  const rows: string[][] = [];

  for (const p of wire.failed) {
    rows.push([`${ICONS.failed}  ${p.name}`, p.detail]);
  }
  for (const p of wire.degraded) {
    rows.push([`${ICONS.degraded}  ${p.name}`, p.detail]);
  }
  for (const p of wire.inDevelopment) {
    rows.push([`${ICONS.in_development}  ${p.name}`, p.detail]);
  }
  for (const p of wire.ok) {
    rows.push([`${ICONS.ok}  ${p.name}`, p.detail]);
  }

  output.log("");
  output.log(color.bold("Environment probe"));
  output.table(["Probe", "Result"], rows, { padding: 2 });

  const suggestions = [
    ...wire.failed,
    ...wire.degraded,
  ].filter((p) => p.suggestion);
  if (suggestions.length > 0) {
    output.log("");
    output.log(color.dim("Suggestions:"));
    for (const s of suggestions) {
      output.log(`  ${color.gray("·")} ${color.bold(s.name)}: ${s.suggestion}`);
    }
  }
}

export function renderInitSummary(wire: WireReport, verify: VerifyReport): void {
  // Note: renderWireReport is called separately by the init action so
  // failures can be surfaced before the team-install step. This function
  // only renders the verify report + final status.
  renderVerifyReport(verify);
  output.log("");
  if (verify.clean) {
    output.success(`Bootstrap complete — ${verify.summary}`);
  } else if (verify.hasFailures) {
    output.warn(
      `Bootstrap finished with failures — ${verify.summary}. ` +
        `Some features will not work until resolved.`
    );
  } else {
    output.warn(`Bootstrap finished with warnings — ${verify.summary}.`);
  }
  // Reference wire to satisfy noUnusedParameters
  void wire;
}
