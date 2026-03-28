/**
 * Metrics collector — tracks token usage, cost, latency, memory, and tool calls.
 *
 * Singleton that accumulates metrics in-memory per session.
 * Can be persisted to .aiyoucli/metrics/ for cross-session analysis.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ── Pricing (USD per 1M tokens, as of 2025) ─────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "opus": { input: 15.0, output: 75.0 },
  "sonnet": { input: 3.0, output: 15.0 },
  "haiku": { input: 0.25, output: 1.25 },
};

// ── Types ────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ToolCallMetric {
  toolName: string;
  startedAt: number;
  durationMs: number;
  success: boolean;
  errorCode?: string;
}

export interface SessionMetrics {
  sessionId: string;
  startedAt: number;
  modelId: string;
  tokens: TokenUsage;
  cost: CostBreakdown;
  toolCalls: ToolCallSummary;
  memory: MemoryMetrics;
  latency: LatencyMetrics;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: "USD";
}

export interface ToolCallSummary {
  total: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number;
  p95DurationMs: number;
  byTool: Record<string, { count: number; avgMs: number; errors: number }>;
}

export interface MemoryMetrics {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
}

export interface LatencyMetrics {
  avgToolCallMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

// ── Collector ────────────────────────────────────────────────

class MetricsCollector {
  private sessionId: string;
  private startedAt: number;
  private modelId = "unknown";
  private tokens: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  private toolCalls: ToolCallMetric[] = [];
  private projectRoot = process.cwd();

  constructor() {
    this.sessionId = `metrics-${Date.now()}`;
    this.startedAt = Date.now();
  }

  setModel(modelId: string): void {
    this.modelId = modelId;
  }

  setProjectRoot(root: string): void {
    this.projectRoot = root;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
  }

  // ── Token tracking ──────────────────────────────────────

  recordTokens(usage: Partial<TokenUsage>): void {
    if (usage.inputTokens) this.tokens.inputTokens += usage.inputTokens;
    if (usage.outputTokens) this.tokens.outputTokens += usage.outputTokens;
    if (usage.cacheReadTokens) this.tokens.cacheReadTokens += usage.cacheReadTokens;
    if (usage.cacheWriteTokens) this.tokens.cacheWriteTokens += usage.cacheWriteTokens;
  }

  getTokens(): TokenUsage {
    return { ...this.tokens };
  }

  // ── Tool call tracking ──────────────────────────────────

  startToolCall(toolName: string): (success?: boolean, errorCode?: string) => void {
    const startedAt = performance.now();
    return (success = true, errorCode?: string) => {
      this.toolCalls.push({
        toolName,
        startedAt,
        durationMs: performance.now() - startedAt,
        success,
        errorCode,
      });
    };
  }

  recordToolCall(metric: ToolCallMetric): void {
    this.toolCalls.push(metric);
  }

  // ── Cost calculation ────────────────────────────────────

  calculateCost(modelTier?: string): CostBreakdown {
    const tier = modelTier ?? this.inferTier();
    const pricing = MODEL_PRICING[tier] ?? MODEL_PRICING["sonnet"];

    const inputCost = (this.tokens.inputTokens / 1_000_000) * pricing.input;
    const outputCost = (this.tokens.outputTokens / 1_000_000) * pricing.output;

    return {
      inputCost: round6(inputCost),
      outputCost: round6(outputCost),
      totalCost: round6(inputCost + outputCost),
      currency: "USD",
    };
  }

  // ── Memory snapshot ─────────────────────────────────────

  getMemoryMetrics(): MemoryMetrics {
    const mem = process.memoryUsage();
    return {
      heapUsedMB: round2(mem.heapUsed / 1024 / 1024),
      heapTotalMB: round2(mem.heapTotal / 1024 / 1024),
      rssMB: round2(mem.rss / 1024 / 1024),
      externalMB: round2(mem.external / 1024 / 1024),
    };
  }

  // ── Latency stats ───────────────────────────────────────

  getLatencyMetrics(): LatencyMetrics {
    if (this.toolCalls.length === 0) {
      return { avgToolCallMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
    }

    const durations = this.toolCalls.map((c) => c.durationMs).sort((a, b) => a - b);
    const len = durations.length;

    return {
      avgToolCallMs: round2(durations.reduce((s, d) => s + d, 0) / len),
      p50Ms: round2(durations[Math.floor(len * 0.5)]),
      p95Ms: round2(durations[Math.floor(len * 0.95)]),
      p99Ms: round2(durations[Math.floor(len * 0.99)]),
      maxMs: round2(durations[len - 1]),
    };
  }

  // ── Tool call summary ───────────────────────────────────

  getToolCallSummary(): ToolCallSummary {
    const total = this.toolCalls.length;
    const succeeded = this.toolCalls.filter((c) => c.success).length;
    const failed = total - succeeded;

    const byTool: ToolCallSummary["byTool"] = {};
    for (const call of this.toolCalls) {
      const entry = byTool[call.toolName] ??= { count: 0, avgMs: 0, errors: 0 };
      entry.count++;
      entry.avgMs += call.durationMs;
      if (!call.success) entry.errors++;
    }
    for (const entry of Object.values(byTool)) {
      entry.avgMs = round2(entry.avgMs / entry.count);
    }

    const durations = this.toolCalls.map((c) => c.durationMs).sort((a, b) => a - b);
    const avgDurationMs = total > 0 ? round2(durations.reduce((s, d) => s + d, 0) / total) : 0;
    const p95DurationMs = total > 0 ? round2(durations[Math.floor(total * 0.95)]) : 0;

    return { total, succeeded, failed, avgDurationMs, p95DurationMs, byTool };
  }

  // ── Full snapshot ───────────────────────────────────────

  snapshot(modelTier?: string): SessionMetrics {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      modelId: this.modelId,
      tokens: this.getTokens(),
      cost: this.calculateCost(modelTier),
      toolCalls: this.getToolCallSummary(),
      memory: this.getMemoryMetrics(),
      latency: this.getLatencyMetrics(),
    };
  }

  // ── Persistence ─────────────────────────────────────────

  async save(): Promise<string> {
    const dir = join(this.projectRoot, ".aiyoucli", "metrics");
    await mkdir(dir, { recursive: true });

    const filename = `${this.sessionId}.json`;
    const filepath = join(dir, filename);
    await writeFile(filepath, JSON.stringify(this.snapshot(), null, 2));
    return filepath;
  }

  static async load(filepath: string): Promise<SessionMetrics> {
    const data = await readFile(filepath, "utf-8");
    return JSON.parse(data) as SessionMetrics;
  }

  // ── Reset ───────────────────────────────────────────────

  reset(): void {
    this.tokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    this.toolCalls = [];
    this.startedAt = Date.now();
    this.sessionId = `metrics-${Date.now()}`;
  }

  // ── Internals ───────────────────────────────────────────

  private inferTier(): string {
    const id = this.modelId.toLowerCase();
    if (id.includes("opus")) return "opus";
    if (id.includes("haiku")) return "haiku";
    return "sonnet";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Singleton metrics collector */
export const metrics = new MetricsCollector();
