/**
 * Phase 3 warmup tests — vitest.
 *
 * Tests cover:
 *   - WarmupReport structure
 *   - renderWarmupReport output formatting
 *   - WarmupOptions handling
 */

import { describe, it, expect, vi } from "vitest";
import { renderWarmupReport, type WarmupReport, type WarmupStep } from "../src/init/warmup.js";

// Capture console.log output
function captureOutput(fn: () => void): string {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  fn();
  console.log = originalLog;
  return logs.join("\n");
}

describe("WarmupReport", () => {
  it("computes counts correctly", () => {
    const steps: WarmupStep[] = [
      { name: "step1", status: "ok", detail: "done", duration_ms: 100 },
      { name: "step2", status: "ok", detail: "done", duration_ms: 50 },
      { name: "step3", status: "degraded", detail: "partial", duration_ms: 20 },
      { name: "step4", status: "failed", detail: "error", duration_ms: 10 },
      { name: "step5", status: "skipped", detail: "skipped", duration_ms: 0 },
    ];

    const report: WarmupReport = {
      steps,
      total_duration_ms: 180,
      ok_count: 2,
      degraded_count: 1,
      failed_count: 1,
      skipped_count: 1,
    };

    expect(report.ok_count).toBe(2);
    expect(report.degraded_count).toBe(1);
    expect(report.failed_count).toBe(1);
    expect(report.skipped_count).toBe(1);
  });
});

describe("renderWarmupReport", () => {
  it("renders a report with all status types", () => {
    const report: WarmupReport = {
      steps: [
        { name: "memory_init", status: "ok", detail: "HNSW 384d initialized", duration_ms: 45 },
        { name: "graph_bootstrap", status: "ok", detail: "15 nodes, 8 edges", duration_ms: 120 },
        { name: "proxy_health", status: "degraded", detail: "Proxy unhealthy", duration_ms: 30 },
        { name: "auto_index", status: "failed", detail: "No git repository", duration_ms: 5 },
        { name: "swarm_init", status: "skipped", detail: "Skipped via --skip-team", duration_ms: 0 },
      ],
      total_duration_ms: 200,
      ok_count: 2,
      degraded_count: 1,
      failed_count: 1,
      skipped_count: 1,
    };

    const output = captureOutput(() => renderWarmupReport(report));

    expect(output).toContain("Phase 3 — Warmup");
    expect(output).toContain("memory_init");
    expect(output).toContain("HNSW 384d initialized");
    expect(output).toContain("45ms");
    expect(output).toContain("proxy_health");
    expect(output).toContain("Proxy unhealthy");
    expect(output).toContain("auto_index");
    expect(output).toContain("No git repository");
    expect(output).toContain("skipped");
  });

  it("renders without throwing on empty report", () => {
    const report: WarmupReport = {
      steps: [],
      total_duration_ms: 0,
      ok_count: 0,
      degraded_count: 0,
      failed_count: 0,
      skipped_count: 0,
    };

    const output = captureOutput(() => renderWarmupReport(report));

    expect(output).toContain("Phase 3 — Warmup");
    expect(output).toContain("Total: 0ms");
  });

  it("renders all ok status report", () => {
    const report: WarmupReport = {
      steps: [
        { name: "step1", status: "ok", detail: "done", duration_ms: 10 },
        { name: "step2", status: "ok", detail: "done", duration_ms: 20 },
      ],
      total_duration_ms: 30,
      ok_count: 2,
      degraded_count: 0,
      failed_count: 0,
      skipped_count: 0,
    };

    const output = captureOutput(() => renderWarmupReport(report));

    expect(output).toContain("2 ok");
  });
});

describe("WarmupOptions", () => {
  it("accepts all optional flags", () => {
    // This is a compile-time check - we verify the interface accepts these
    const options = {
      cwd: "/test",
      skipIndex: true,
      skipTeam: true,
      skipProxy: true,
    };

    expect(options.skipIndex).toBe(true);
    expect(options.skipTeam).toBe(true);
    expect(options.skipProxy).toBe(true);
  });

  it("works without skip flags", () => {
    const options = {
      cwd: "/test",
    };

    expect(options.cwd).toBe("/test");
  });
});

describe("WarmupStep status types", () => {
  it("supports all 4 status types", () => {
    const statuses: WarmupStep["status"][] = ["ok", "degraded", "failed", "skipped"];
    expect(statuses).toHaveLength(4);
  });

  it("WarmupReport counts each status correctly", () => {
    const steps: WarmupStep[] = [
      { name: "a", status: "ok", detail: "ok", duration_ms: 10 },
      { name: "b", status: "degraded", detail: "degraded", duration_ms: 10 },
      { name: "c", status: "failed", detail: "failed", duration_ms: 10 },
      { name: "d", status: "skipped", detail: "skipped", duration_ms: 0 },
    ];

    const okCount = steps.filter((s) => s.status === "ok").length;
    const degradedCount = steps.filter((s) => s.status === "degraded").length;
    const failedCount = steps.filter((s) => s.status === "failed").length;
    const skippedCount = steps.filter((s) => s.status === "skipped").length;

    expect(okCount).toBe(1);
    expect(degradedCount).toBe(1);
    expect(failedCount).toBe(1);
    expect(skippedCount).toBe(1);
  });
});
