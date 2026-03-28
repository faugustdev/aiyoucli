/**
 * Benchmark framework tests — vitest.
 */

import { describe, it, expect } from "vitest";
import {
  runBenchmark,
  BenchmarkSuite,
  compareReports,
  formatReport,
  formatComparison,
} from "../src/metrics/benchmark.js";
import type { BenchmarkReport } from "../src/metrics/benchmark.js";

describe("runBenchmark", () => {
  it("runs a sync benchmark", async () => {
    let counter = 0;
    const result = await runBenchmark("sync-test", "test", () => {
      counter++;
    }, { iterations: 50, warmup: 5 });

    expect(counter).toBe(55); // 50 + 5 warmup
    expect(result.name).toBe("sync-test");
    expect(result.category).toBe("test");
    expect(result.iterations).toBe(50);
    expect(result.warmupIterations).toBe(5);
    expect(result.timings.avgMs).toBeGreaterThanOrEqual(0);
    expect(result.timings.opsPerSec).toBeGreaterThan(0);
  });

  it("runs an async benchmark", async () => {
    const result = await runBenchmark("async-test", "test", async () => {
      await new Promise((r) => setTimeout(r, 1));
    }, { iterations: 5, warmup: 1 });

    expect(result.timings.avgMs).toBeGreaterThanOrEqual(1);
  });

  it("computes timing stats", async () => {
    const result = await runBenchmark("stats-test", "test", () => {
      // noop
    }, { iterations: 100, warmup: 5 });

    expect(result.timings.minMs).toBeLessThanOrEqual(result.timings.avgMs);
    expect(result.timings.avgMs).toBeLessThanOrEqual(result.timings.maxMs);
    expect(result.timings.p50Ms).toBeLessThanOrEqual(result.timings.p95Ms);
    expect(result.timings.p95Ms).toBeLessThanOrEqual(result.timings.p99Ms);
    expect(result.timings.stdDevMs).toBeGreaterThanOrEqual(0);
  });

  it("captures memory delta", async () => {
    const result = await runBenchmark("mem-test", "test", () => {
      // noop
    }, { iterations: 10, warmup: 2 });

    expect(result.memory.heapBefore).toBeGreaterThan(0);
    expect(result.memory.heapAfter).toBeGreaterThan(0);
    expect(typeof result.memory.heapDeltaMB).toBe("number");
  });
});

describe("BenchmarkSuite", () => {
  it("runs multiple benchmarks and produces a report", async () => {
    const suite = new BenchmarkSuite("test-system", "1.0.0");

    suite.add("fast-op", "compute", () => {
      Math.sqrt(42);
    }, { iterations: 20, warmup: 2 });

    suite.add("array-op", "compute", () => {
      Array.from({ length: 100 }, (_, i) => i * 2);
    }, { iterations: 20, warmup: 2 });

    const report = await suite.run();

    expect(report.system).toBe("test-system");
    expect(report.version).toBe("1.0.0");
    expect(report.results).toHaveLength(2);
    expect(report.summary.totalBenchmarks).toBe(2);
    expect(report.summary.totalDurationMs).toBeGreaterThan(0);
    expect(report.summary.categories["compute"]).toBeDefined();
    expect(report.summary.categories["compute"].count).toBe(2);
  });

  it("saves report to disk", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const tmpDir = await mkdtemp(join(tmpdir(), "bench-test-"));
    const suite = new BenchmarkSuite("save-test", "0.1.0");
    suite.add("noop", "test", () => {}, { iterations: 5, warmup: 1 });

    const { report, filepath } = await suite.runAndSave(tmpDir);
    expect(filepath).toContain("save-test-");

    const loaded = JSON.parse(await readFile(filepath, "utf-8"));
    expect(loaded.system).toBe("save-test");
    expect(loaded.results).toHaveLength(1);

    await rm(tmpDir, { recursive: true });
  });
});

describe("compareReports", () => {
  it("compares two system reports", () => {
    const reportA: BenchmarkReport = {
      system: "aiyoucli",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      platform: "darwin-arm64",
      nodeVersion: "v20.0.0",
      results: [
        {
          name: "vector_insert",
          category: "vector",
          iterations: 100,
          warmupIterations: 10,
          timings: { totalMs: 100, avgMs: 1.0, minMs: 0.5, maxMs: 2.0, p50Ms: 0.9, p95Ms: 1.5, p99Ms: 1.8, stdDevMs: 0.3, opsPerSec: 1000 },
          memory: { heapBefore: 50, heapAfter: 52, heapDeltaMB: 2, rssBefore: 80, rssAfter: 82, rssDeltaMB: 2 },
        },
      ],
      summary: { totalBenchmarks: 1, totalDurationMs: 100, categories: { vector: { count: 1, avgMs: 1.0 } } },
    };

    const reportB: BenchmarkReport = {
      system: "claude-flow",
      version: "3.0.0",
      timestamp: new Date().toISOString(),
      platform: "darwin-arm64",
      nodeVersion: "v20.0.0",
      results: [
        {
          name: "vector_insert",
          category: "vector",
          iterations: 100,
          warmupIterations: 10,
          timings: { totalMs: 500, avgMs: 5.0, minMs: 3.0, maxMs: 10.0, p50Ms: 4.5, p95Ms: 8.0, p99Ms: 9.0, stdDevMs: 1.5, opsPerSec: 200 },
          memory: { heapBefore: 100, heapAfter: 110, heapDeltaMB: 10, rssBefore: 150, rssAfter: 160, rssDeltaMB: 10 },
        },
      ],
      summary: { totalBenchmarks: 1, totalDurationMs: 500, categories: { vector: { count: 1, avgMs: 5.0 } } },
    };

    const comparison = compareReports([reportA, reportB]);

    expect(comparison.systems).toEqual(["aiyoucli", "claude-flow"]);
    expect(comparison.comparisons).toHaveLength(1);
    expect(comparison.comparisons[0].winner).toBe("aiyoucli");
    expect(comparison.comparisons[0].speedup).toBe("5x");
  });
});

describe("formatReport", () => {
  it("produces a markdown table", () => {
    const report: BenchmarkReport = {
      system: "aiyoucli",
      version: "0.1.0",
      timestamp: "2026-03-27T00:00:00.000Z",
      platform: "darwin-arm64",
      nodeVersion: "v20.0.0",
      results: [
        {
          name: "test_bench",
          category: "test",
          iterations: 10,
          warmupIterations: 2,
          timings: { totalMs: 10, avgMs: 1.0, minMs: 0.5, maxMs: 2.0, p50Ms: 0.9, p95Ms: 1.5, p99Ms: 1.8, stdDevMs: 0.3, opsPerSec: 1000 },
          memory: { heapBefore: 50, heapAfter: 51, heapDeltaMB: 1, rssBefore: 80, rssAfter: 81, rssDeltaMB: 1 },
        },
      ],
      summary: { totalBenchmarks: 1, totalDurationMs: 10, categories: { test: { count: 1, avgMs: 1.0 } } },
    };

    const output = formatReport(report);
    expect(output).toContain("aiyoucli");
    expect(output).toContain("test_bench");
    expect(output).toContain("1000"); // opsPerSec
  });
});

describe("formatComparison", () => {
  it("produces a comparison table", () => {
    const comparison = {
      timestamp: "2026-03-27T00:00:00.000Z",
      systems: ["aiyoucli", "claude-flow"],
      comparisons: [
        {
          benchmark: "vector_insert",
          category: "vector",
          results: {
            aiyoucli: { avgMs: 1.0, p95Ms: 1.5, opsPerSec: 1000 },
            "claude-flow": { avgMs: 5.0, p95Ms: 8.0, opsPerSec: 200 },
          },
          winner: "aiyoucli",
          speedup: "5x",
        },
      ],
    };

    const output = formatComparison(comparison);
    expect(output).toContain("aiyoucli vs claude-flow");
    expect(output).toContain("5x");
  });
});
