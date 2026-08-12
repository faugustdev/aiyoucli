import type { MCPTool, MCPToolResult } from "../../types.js";
import {
  createRoutingEngine,
  createSonaEngine,
  type RoutingEngine,
  type SonaHandle,
} from "../../napi/index.js";
import { createProxyEngine, type ProxyEngineHandle } from "../../napi/proxy.js";
import { getDB } from "./memory-tools.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}
function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}

let sonaHandle: SonaHandle | null = null;
function getSona(): SonaHandle {
  if (!sonaHandle) sonaHandle = createSonaEngine();
  return sonaHandle;
}

let router: RoutingEngine | null = null;
async function getRouter(): Promise<RoutingEngine> {
  if (!router) {
    router = createRoutingEngine();
    const qPath = join(process.cwd(), ".aiyoucli", "q-table.json");
    if (existsSync(qPath)) {
      try { router.importQTable(await readFile(qPath, "utf-8")); } catch {}
    }
  }
  return router;
}

let proxyEngine: ProxyEngineHandle | null = null;
function getProxyEngine(): ProxyEngineHandle | null {
  if (!proxyEngine) {
    try {
      proxyEngine = createProxyEngine();
    } catch {
      return null;
    }
  }
  return proxyEngine;
}

export const statsTools: MCPTool[] = [
  {
    name: "stats",
    description: "Get statistics for a subsystem. scope: memory, routing, neural, semantic, cache, full",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["memory", "routing", "neural", "semantic", "cache", "full"],
          description: "Which subsystem stats to retrieve (default: full)",
        },
        model_tier: { type: "string", description: "Model tier for full stats (opus/sonnet/haiku)" },
      },
    },
    handler: async (input) => {
      const scope = (input.scope as string) || "full";
      const { metrics } = await import("../../metrics/collector.js");
      switch (scope) {
        // The real persisted store from memory-tools, not a throwaway
        // in-memory handle — otherwise `stats --scope memory` always
        // reported an empty DB regardless of what was indexed.
        case "memory": return json(getDB().stats());
        case "routing": return json((await getRouter()).stats());
        case "neural": return json(getSona().stats());
        case "semantic": {
          const engine = getProxyEngine();
          if (!engine) return text("Semantic router not available");
          return json(engine.semanticStats());
        }
        case "cache": {
          const engine = getProxyEngine();
          if (!engine) return text("Proxy engine not available");
          return json(engine.cacheStats());
        }
        case "full": return json(metrics.snapshot(input.model_tier as string));
        default: return text(`Unknown scope: ${scope}`);
      }
    },
  },
  {
    name: "metrics",
    description: "Metrics operations. action: record_tokens, cost, memory, latency, tools_summary, save, reset",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["record_tokens", "cost", "memory", "latency", "tools_summary", "save", "reset"],
          description: "Metrics action to perform",
        },
        input_tokens: { type: "number", description: "Input tokens (for record_tokens)" },
        output_tokens: { type: "number", description: "Output tokens (for record_tokens)" },
        cache_read_tokens: { type: "number", description: "Cache read tokens (for record_tokens)" },
        cache_write_tokens: { type: "number", description: "Cache write tokens (for record_tokens)" },
        model_tier: { type: "string", description: "Model tier for cost calculation (opus/sonnet/haiku)" },
      },
      required: ["action"],
    },
    handler: async (input) => {
      const action = input.action as string;
      const { metrics } = await import("../../metrics/collector.js");
      switch (action) {
        case "record_tokens":
          metrics.recordTokens({
            inputTokens: (input.input_tokens as number) ?? 0,
            outputTokens: (input.output_tokens as number) ?? 0,
            cacheReadTokens: (input.cache_read_tokens as number) ?? 0,
            cacheWriteTokens: (input.cache_write_tokens as number) ?? 0,
          });
          return json(metrics.getTokens());
        case "cost":
          return json(metrics.calculateCost(input.model_tier as string));
        case "memory":
          return json(metrics.getMemoryMetrics());
        case "latency":
          return json(metrics.getLatencyMetrics());
        case "tools_summary":
          return json(metrics.getToolCallSummary());
        case "save":
          const filepath = await metrics.save();
          return text(`Metrics saved to ${filepath}`);
        case "reset":
          metrics.reset();
          return text("Metrics reset");
        default:
          return text(`Unknown action: ${action}`);
      }
    },
  },
];
