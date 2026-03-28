/**
 * Metrics collector tests — vitest.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { metrics } from "../src/metrics/collector.js";

beforeEach(() => {
  metrics.reset();
});

describe("MetricsCollector", () => {
  describe("token tracking", () => {
    it("starts with zero tokens", () => {
      const t = metrics.getTokens();
      expect(t.inputTokens).toBe(0);
      expect(t.outputTokens).toBe(0);
      expect(t.cacheReadTokens).toBe(0);
      expect(t.cacheWriteTokens).toBe(0);
    });

    it("accumulates token usage", () => {
      metrics.recordTokens({ inputTokens: 100, outputTokens: 50 });
      metrics.recordTokens({ inputTokens: 200, outputTokens: 100 });

      const t = metrics.getTokens();
      expect(t.inputTokens).toBe(300);
      expect(t.outputTokens).toBe(150);
    });

    it("tracks cache tokens separately", () => {
      metrics.recordTokens({ cacheReadTokens: 500, cacheWriteTokens: 200 });
      const t = metrics.getTokens();
      expect(t.cacheReadTokens).toBe(500);
      expect(t.cacheWriteTokens).toBe(200);
    });
  });

  describe("cost calculation", () => {
    it("calculates opus cost", () => {
      metrics.recordTokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
      const cost = metrics.calculateCost("opus");
      expect(cost.inputCost).toBe(15.0);
      expect(cost.outputCost).toBe(75.0);
      expect(cost.totalCost).toBe(90.0);
      expect(cost.currency).toBe("USD");
    });

    it("calculates sonnet cost", () => {
      metrics.recordTokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
      const cost = metrics.calculateCost("sonnet");
      expect(cost.inputCost).toBe(3.0);
      expect(cost.outputCost).toBe(15.0);
      expect(cost.totalCost).toBe(18.0);
    });

    it("calculates haiku cost", () => {
      metrics.recordTokens({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
      const cost = metrics.calculateCost("haiku");
      expect(cost.inputCost).toBe(0.25);
      expect(cost.outputCost).toBe(1.25);
      expect(cost.totalCost).toBe(1.5);
    });

    it("infers tier from model id", () => {
      metrics.setModel("claude-opus-4-6");
      metrics.recordTokens({ inputTokens: 1_000_000 });
      const cost = metrics.calculateCost();
      expect(cost.inputCost).toBe(15.0);
    });

    it("defaults to sonnet pricing for unknown models", () => {
      metrics.setModel("unknown-model");
      metrics.recordTokens({ inputTokens: 1_000_000 });
      const cost = metrics.calculateCost();
      expect(cost.inputCost).toBe(3.0);
    });
  });

  describe("tool call tracking", () => {
    it("records tool calls via startToolCall", () => {
      const end = metrics.startToolCall("memory_search");
      end(true);

      const summary = metrics.getToolCallSummary();
      expect(summary.total).toBe(1);
      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.byTool["memory_search"]).toBeDefined();
      expect(summary.byTool["memory_search"].count).toBe(1);
    });

    it("tracks failures", () => {
      const end = metrics.startToolCall("bad_tool");
      end(false, "CIRCUIT_OPEN");

      const summary = metrics.getToolCallSummary();
      expect(summary.failed).toBe(1);
      expect(summary.byTool["bad_tool"].errors).toBe(1);
    });

    it("computes per-tool averages", () => {
      for (let i = 0; i < 5; i++) {
        const end = metrics.startToolCall("fast_tool");
        end(true);
      }

      const summary = metrics.getToolCallSummary();
      expect(summary.byTool["fast_tool"].count).toBe(5);
      expect(summary.byTool["fast_tool"].avgMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("latency metrics", () => {
    it("returns zeros when no calls recorded", () => {
      const lat = metrics.getLatencyMetrics();
      expect(lat.avgToolCallMs).toBe(0);
      expect(lat.p50Ms).toBe(0);
      expect(lat.p95Ms).toBe(0);
      expect(lat.maxMs).toBe(0);
    });

    it("computes percentiles from recorded calls", () => {
      for (let i = 0; i < 100; i++) {
        const end = metrics.startToolCall("perf_tool");
        end(true);
      }

      const lat = metrics.getLatencyMetrics();
      expect(lat.avgToolCallMs).toBeGreaterThanOrEqual(0);
      expect(lat.p50Ms).toBeGreaterThanOrEqual(0);
      expect(lat.p95Ms).toBeGreaterThanOrEqual(lat.p50Ms);
      expect(lat.maxMs).toBeGreaterThanOrEqual(lat.p95Ms);
    });
  });

  describe("memory metrics", () => {
    it("returns current process memory", () => {
      const mem = metrics.getMemoryMetrics();
      expect(mem.heapUsedMB).toBeGreaterThan(0);
      expect(mem.heapTotalMB).toBeGreaterThan(0);
      expect(mem.rssMB).toBeGreaterThan(0);
      expect(mem.externalMB).toBeGreaterThanOrEqual(0);
    });
  });

  describe("snapshot", () => {
    it("returns complete session metrics", () => {
      metrics.setModel("claude-sonnet-4-6");
      metrics.setSessionId("test-session-1");
      metrics.recordTokens({ inputTokens: 500, outputTokens: 200 });

      const end = metrics.startToolCall("test_tool");
      end(true);

      const snap = metrics.snapshot();
      expect(snap.sessionId).toBe("test-session-1");
      expect(snap.modelId).toBe("claude-sonnet-4-6");
      expect(snap.tokens.inputTokens).toBe(500);
      expect(snap.tokens.outputTokens).toBe(200);
      expect(snap.cost.totalCost).toBeGreaterThan(0);
      expect(snap.toolCalls.total).toBe(1);
      expect(snap.memory.rssMB).toBeGreaterThan(0);
      expect(snap.latency).toBeDefined();
    });
  });

  describe("persistence", () => {
    it("saves and loads metrics", async () => {
      const { mkdtemp, rm } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");
      const { MetricsCollector } = await import("../src/metrics/collector.js").then(
        (m) => ({ MetricsCollector: m.metrics.constructor })
      );

      const tmpDir = await mkdtemp(join(tmpdir(), "aiyoucli-test-"));
      metrics.setProjectRoot(tmpDir);
      metrics.setSessionId("persist-test");
      metrics.recordTokens({ inputTokens: 1000 });

      const filepath = await metrics.save();
      expect(filepath).toContain("persist-test.json");

      const { default: loaded } = await import("node:fs/promises").then(async (fs) => ({
        default: JSON.parse(await fs.readFile(filepath, "utf-8")),
      }));
      expect(loaded.tokens.inputTokens).toBe(1000);
      expect(loaded.sessionId).toBe("persist-test");

      await rm(tmpDir, { recursive: true });
    });
  });

  describe("reset", () => {
    it("clears all accumulated state", () => {
      metrics.recordTokens({ inputTokens: 999 });
      const end = metrics.startToolCall("x");
      end(true);

      metrics.reset();

      expect(metrics.getTokens().inputTokens).toBe(0);
      expect(metrics.getToolCallSummary().total).toBe(0);
    });
  });
});
