import type { MCPTool, MCPToolResult } from "../../types.js";
import { createRoutingEngine, type RoutingEngine } from "../../napi/index.js";

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}

function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}

let router: RoutingEngine | null = null;
function getRouter(): RoutingEngine {
  if (!router) router = createRoutingEngine();
  return router;
}

let proxyEngine: any = null;
function getProxyEngine(): any {
  if (!proxyEngine) {
    try {
      const mod = require("../../napi/proxy.js");
      proxyEngine = mod.getProxyEngine?.() ?? null;
    } catch {
      return null;
    }
  }
  return proxyEngine;
}

export const routeTools: MCPTool[] = [
  {
    name: "route",
    description:
      "Route a task to the optimal agent using various strategies: qlearn (Q-learning), model_tier (model selection), keyword (semantic keyword), hybrid (keyword+embedding), enhanced (auto hybrid)",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["qlearn", "model_tier", "keyword", "hybrid", "enhanced"],
          description:
            "Routing strategy: qlearn=Q-learning, model_tier=model selection, keyword=semantic keyword, hybrid=keyword+custom embedding, enhanced=auto hybrid",
        },
        task: {
          type: "string",
          description: "Task description to route",
        },
        embedding: {
          type: "array",
          items: { type: "number" },
          description: "Custom embedding scores (only for hybrid action)",
        },
      },
      required: ["action", "task"],
    },
    handler: async (input) => {
      const action = input.action as string;
      const task = input.task as string;

      switch (action) {
        case "qlearn": {
          const r = getRouter();
          return json(r.route(task));
        }
        case "model_tier": {
          const r = getRouter();
          const tier = r.selectModelTier(task);
          return json({ model: tier });
        }
        case "keyword": {
          const engine = getProxyEngine();
          if (!engine) return text("Semantic router not available");
          return json(engine.semanticRoute(task));
        }
        case "hybrid": {
          const engine = getProxyEngine();
          if (!engine) return text("Semantic router not available");
          const embedding = input.embedding as number[] | undefined;
          return json(engine.semanticRouteHybrid(task, embedding));
        }
        case "enhanced": {
          const engine = getProxyEngine();
          if (!engine) return text("Semantic router not available");
          return json(engine.semanticRouteEnhanced(task));
        }
        default:
          return text(`Unknown action: ${action}. Valid: qlearn, model_tier, keyword, hybrid, enhanced`);
      }
    },
  },
];
