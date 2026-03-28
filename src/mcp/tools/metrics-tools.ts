/**
 * MCP tools for metrics — token usage, cost, latency, memory.
 */

import type { MCPTool } from "../../types.js";
import { metrics } from "../../metrics/collector.js";

export const metricsTools: MCPTool[] = [
  {
    name: "metrics_snapshot",
    description:
      "Get a full metrics snapshot: tokens, cost, tool call stats, memory usage, latency percentiles.",
    inputSchema: {
      type: "object",
      properties: {
        model_tier: {
          type: "string",
          description:
            'Model tier for cost calculation (opus/sonnet/haiku). Auto-detected if omitted.',
        },
      },
    },
    handler: async (input) => {
      const tier = input.model_tier as string | undefined;
      const snap = metrics.snapshot(tier);
      return {
        content: [{ type: "text", text: JSON.stringify(snap, null, 2) }],
      };
    },
  },
  {
    name: "metrics_record_tokens",
    description: "Record token usage from an LLM response.",
    inputSchema: {
      type: "object",
      properties: {
        input_tokens: { type: "number", description: "Input tokens consumed" },
        output_tokens: { type: "number", description: "Output tokens generated" },
        cache_read_tokens: { type: "number", description: "Tokens read from cache" },
        cache_write_tokens: { type: "number", description: "Tokens written to cache" },
      },
    },
    handler: async (input) => {
      metrics.recordTokens({
        inputTokens: (input.input_tokens as number) ?? 0,
        outputTokens: (input.output_tokens as number) ?? 0,
        cacheReadTokens: (input.cache_read_tokens as number) ?? 0,
        cacheWriteTokens: (input.cache_write_tokens as number) ?? 0,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(metrics.getTokens()) }],
      };
    },
  },
  {
    name: "metrics_cost",
    description:
      "Calculate estimated cost based on recorded token usage. Returns input/output/total in USD.",
    inputSchema: {
      type: "object",
      properties: {
        model_tier: {
          type: "string",
          description: "Model tier (opus/sonnet/haiku). Auto-detected if omitted.",
        },
      },
    },
    handler: async (input) => {
      const tier = input.model_tier as string | undefined;
      const cost = metrics.calculateCost(tier);
      return {
        content: [{ type: "text", text: JSON.stringify(cost, null, 2) }],
      };
    },
  },
  {
    name: "metrics_memory",
    description: "Get current process memory usage (heap, RSS, external).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const mem = metrics.getMemoryMetrics();
      return {
        content: [{ type: "text", text: JSON.stringify(mem, null, 2) }],
      };
    },
  },
  {
    name: "metrics_latency",
    description: "Get tool call latency stats (avg, p50, p95, p99, max).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const lat = metrics.getLatencyMetrics();
      return {
        content: [{ type: "text", text: JSON.stringify(lat, null, 2) }],
      };
    },
  },
  {
    name: "metrics_tools_summary",
    description:
      "Get per-tool call statistics: count, avg latency, error rate.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const summary = metrics.getToolCallSummary();
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  },
  {
    name: "metrics_save",
    description: "Persist current session metrics to .aiyoucli/metrics/.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const filepath = await metrics.save();
      return {
        content: [{ type: "text", text: `Metrics saved to ${filepath}` }],
      };
    },
  },
  {
    name: "metrics_reset",
    description: "Reset all accumulated metrics for a fresh session.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      metrics.reset();
      return {
        content: [{ type: "text", text: "Metrics reset" }],
      };
    },
  },
];
