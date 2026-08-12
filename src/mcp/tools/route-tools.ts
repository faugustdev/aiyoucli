import type { MCPTool, MCPToolResult } from "../../types.js";
import { createRoutingEngine, type RoutingEngine } from "../../napi/index.js";
import { createProxyEngine, type ProxyEngineHandle } from "../../napi/proxy.js";

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
        embedding_scores: {
          type: "object",
          description:
            "Route name -> score map, e.g. {\"security\": 0.8, \"testing\": 0.2} (only for hybrid action)",
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
          // Rust reads this as a JSON object (route name -> score) via
          // `as_object()`; an array silently deserializes to an empty map,
          // which turned hybrid routing into plain keyword routing.
          const scores = input.embedding_scores;
          if (scores === undefined || scores === null) {
            return text("Missing 'embedding_scores' for action=hybrid");
          }
          if (typeof scores !== "object" || Array.isArray(scores)) {
            return text(
              "'embedding_scores' must be an object mapping route name to score, e.g. {\"security\": 0.8}"
            );
          }
          return json(
            engine.semanticRouteHybrid(task, scores as Record<string, number>)
          );
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
