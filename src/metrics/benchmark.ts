/**
 * Benchmark framework — measures and compares CLI performance.
 *
 * Runs standardized benchmarks for:
 * - Startup latency
 * - MCP tool call latency
 * - Vector operations throughput
 * - Routing accuracy
 * - Memory footprint
 *
 * Outputs JSON reports for comparison (aiyoucli vs claude-flow vs others).
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ── Types ────────────────────────────────────────────────────

export interface BenchmarkResult {
  name: string;
  category: string;
  iterations: number;
  warmupIterations: number;
  timings: TimingStats;
  memory: MemoryDelta;
  metadata?: Record<string, unknown>;
}

export interface TimingStats {
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
  opsPerSec: number;
}

export interface MemoryDelta {
  heapBefore: number;
  heapAfter: number;
  heapDeltaMB: number;
  rssBefore: number;
  rssAfter: number;
  rssDeltaMB: number;
}

export interface BenchmarkReport {
  system: string;
  version: string;
  timestamp: string;
  platform: string;
  nodeVersion: string;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
}

export interface BenchmarkSummary {
  totalBenchmarks: number;
  totalDurationMs: number;
  categories: Record<string, { count: number; avgMs: number }>;
}

export interface ComparisonReport {
  timestamp: string;
  systems: string[];
  comparisons: ComparisonEntry[];
}

export interface ComparisonEntry {
  benchmark: string;
  category: string;
  results: Record<string, { avgMs: number; p95Ms: number; opsPerSec: number }>;
  winner: string;
  speedup: string;
}

// ── Benchmark runner ─────────────────────────────────────────

export interface BenchmarkOptions {
  iterations?: number;
  warmup?: number;
  gcBetween?: boolean;
}

const DEFAULTS: Required<BenchmarkOptions> = {
  iterations: 100,
  warmup: 10,
  gcBetween: false,
};

export async function runBenchmark(
  name: string,
  category: string,
  fn: () => void | Promise<void>,
  options?: BenchmarkOptions
): Promise<BenchmarkResult> {
  const opts = { ...DEFAULTS, ...options };

  // Warmup
  for (let i = 0; i < opts.warmup; i++) {
    await fn();
  }

  if (opts.gcBetween && global.gc) global.gc();

  const memBefore = process.memoryUsage();
  const durations: number[] = [];

  for (let i = 0; i < opts.iterations; i++) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }

  const memAfter = process.memoryUsage();

  return {
    name,
    category,
    iterations: opts.iterations,
    warmupIterations: opts.warmup,
    timings: computeTimingStats(durations),
    memory: {
      heapBefore: round2(memBefore.heapUsed / 1024 / 1024),
      heapAfter: round2(memAfter.heapUsed / 1024 / 1024),
      heapDeltaMB: round2((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024),
      rssBefore: round2(memBefore.rss / 1024 / 1024),
      rssAfter: round2(memAfter.rss / 1024 / 1024),
      rssDeltaMB: round2((memAfter.rss - memBefore.rss) / 1024 / 1024),
    },
  };
}

// ── Benchmark suite ──────────────────────────────────────────

export class BenchmarkSuite {
  private benchmarks: Array<{
    name: string;
    category: string;
    fn: () => void | Promise<void>;
    options?: BenchmarkOptions;
  }> = [];
  private system: string;
  private version: string;

  constructor(system: string, version: string) {
    this.system = system;
    this.version = version;
  }

  add(
    name: string,
    category: string,
    fn: () => void | Promise<void>,
    options?: BenchmarkOptions
  ): void {
    this.benchmarks.push({ name, category, fn, options });
  }

  async run(): Promise<BenchmarkReport> {
    const startTime = performance.now();
    const results: BenchmarkResult[] = [];

    for (const bench of this.benchmarks) {
      results.push(await runBenchmark(bench.name, bench.category, bench.fn, bench.options));
    }

    const totalDurationMs = round2(performance.now() - startTime);

    const categories: BenchmarkSummary["categories"] = {};
    for (const r of results) {
      const cat = categories[r.category] ??= { count: 0, avgMs: 0 };
      cat.count++;
      cat.avgMs += r.timings.avgMs;
    }
    for (const cat of Object.values(categories)) {
      cat.avgMs = round2(cat.avgMs / cat.count);
    }

    return {
      system: this.system,
      version: this.version,
      timestamp: new Date().toISOString(),
      platform: `${process.platform}-${process.arch}`,
      nodeVersion: process.version,
      results,
      summary: {
        totalBenchmarks: results.length,
        totalDurationMs,
        categories,
      },
    };
  }

  async runAndSave(projectRoot: string): Promise<{ report: BenchmarkReport; filepath: string }> {
    const report = await this.run();
    const dir = join(projectRoot, ".aiyoucli", "benchmarks");
    await mkdir(dir, { recursive: true });

    const filename = `${this.system}-${Date.now()}.json`;
    const filepath = join(dir, filename);
    await writeFile(filepath, JSON.stringify(report, null, 2));

    return { report, filepath };
  }
}

// ── Comparison ───────────────────────────────────────────────

export function compareReports(
  reports: BenchmarkReport[]
): ComparisonReport {
  const systems = reports.map((r) => r.system);

  // Group benchmarks by name across systems
  const benchmarkNames = new Set(reports.flatMap((r) => r.results.map((b) => b.name)));

  const comparisons: ComparisonEntry[] = [];

  for (const benchName of benchmarkNames) {
    const results: ComparisonEntry["results"] = {};
    let category = "";

    for (const report of reports) {
      const bench = report.results.find((b) => b.name === benchName);
      if (bench) {
        category = bench.category;
        results[report.system] = {
          avgMs: bench.timings.avgMs,
          p95Ms: bench.timings.p95Ms,
          opsPerSec: bench.timings.opsPerSec,
        };
      }
    }

    const entries = Object.entries(results);
    if (entries.length < 2) {
      comparisons.push({ benchmark: benchName, category, results, winner: entries[0]?.[0] ?? "N/A", speedup: "N/A" });
      continue;
    }

    // Winner = lowest avgMs
    entries.sort((a, b) => a[1].avgMs - b[1].avgMs);
    const winner = entries[0][0];
    const loser = entries[entries.length - 1];
    const speedup = loser[1].avgMs > 0
      ? `${round2(loser[1].avgMs / entries[0][1].avgMs)}x`
      : "N/A";

    comparisons.push({ benchmark: benchName, category, results, winner, speedup });
  }

  return {
    timestamp: new Date().toISOString(),
    systems,
    comparisons,
  };
}

// ── Format ───────────────────────────────────────────────────

export function formatReport(report: BenchmarkReport): string {
  const lines: string[] = [
    `Benchmark Report: ${report.system} v${report.version}`,
    `Platform: ${report.platform} | Node: ${report.nodeVersion}`,
    `Date: ${report.timestamp}`,
    "",
    "| Benchmark | Category | Avg (ms) | P95 (ms) | Ops/s | Heap Δ (MB) |",
    "|-----------|----------|----------|----------|-------|-------------|",
  ];

  for (const r of report.results) {
    lines.push(
      `| ${r.name} | ${r.category} | ${r.timings.avgMs} | ${r.timings.p95Ms} | ${r.timings.opsPerSec} | ${r.memory.heapDeltaMB} |`
    );
  }

  lines.push("");
  lines.push(`Total: ${report.summary.totalBenchmarks} benchmarks in ${report.summary.totalDurationMs}ms`);
  return lines.join("\n");
}

export function formatComparison(comparison: ComparisonReport): string {
  const lines: string[] = [
    `Comparison: ${comparison.systems.join(" vs ")}`,
    `Date: ${comparison.timestamp}`,
    "",
    `| Benchmark | Category | ${comparison.systems.map((s) => `${s} (ms)`).join(" | ")} | Winner | Speedup |`,
    `|-----------|----------|${comparison.systems.map(() => "----------|").join(" ")} --------|---------|`,
  ];

  for (const c of comparison.comparisons) {
    const vals = comparison.systems.map(
      (s) => c.results[s]?.avgMs.toString() ?? "N/A"
    );
    lines.push(
      `| ${c.benchmark} | ${c.category} | ${vals.join(" | ")} | ${c.winner} | ${c.speedup} |`
    );
  }

  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────

function computeTimingStats(durations: number[]): TimingStats {
  const sorted = [...durations].sort((a, b) => a - b);
  const len = sorted.length;
  const totalMs = round2(sorted.reduce((s, d) => s + d, 0));
  const avgMs = round2(totalMs / len);
  const minMs = round2(sorted[0]);
  const maxMs = round2(sorted[len - 1]);
  const p50Ms = round2(sorted[Math.floor(len * 0.5)]);
  const p95Ms = round2(sorted[Math.floor(len * 0.95)]);
  const p99Ms = round2(sorted[Math.floor(len * 0.99)]);

  const variance = sorted.reduce((s, d) => s + (d - avgMs) ** 2, 0) / len;
  const stdDevMs = round2(Math.sqrt(variance));
  const rawAvg = totalMs / len;
  const opsPerSec = rawAvg > 0 ? Math.round(1000 / rawAvg) : Infinity;

  return { totalMs, avgMs, minMs, maxMs, p50Ms, p95Ms, p99Ms, stdDevMs, opsPerSec };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
