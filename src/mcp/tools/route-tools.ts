import type { MCPTool, MCPToolResult } from "../../types.js";
import { createRoutingEngine, type RoutingEngine } from "../../napi/index.js";
import { createProxyEngine, type ProxyEngineHandle } from "../../napi/proxy.js";
import { graphRouteHint } from "./graph-route-hint.js";
import { ROSTER_TO_SKILL, SKILL_TO_ROSTER } from "./agent-roster.js";

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

/**
 * Convert a graph-derived per-agent hint (roster names, e.g.
 * "coding-executor") into a route-name -> score map keyed by the
 * `AGENT_TYPES` skill vocabulary the Rust routers use (e.g. "coder"),
 * summing scores when multiple roster agents collapse onto one skill.
 */
function graphHintToSkillScores(task: string): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const { agent, score } of graphRouteHint(task)) {
    const skill = ROSTER_TO_SKILL[agent];
    if (!skill) continue;
    scores[skill] = (scores[skill] ?? 0) + score;
  }
  return scores;
}

export const routeTools: MCPTool[] = [
  {
    name: "route",
    description:
      "Route a task to the optimal agent using various strategies: qlearn (Q-learning), model_tier (model selection), keyword (semantic keyword), hybrid (keyword+embedding, falls back to the knowledge-graph hint when embedding_scores is omitted), enhanced (auto hybrid), graph (pure knowledge-graph neighborhood hint, no Q-table)",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["qlearn", "model_tier", "keyword", "hybrid", "enhanced", "graph"],
          description:
            "Routing strategy: qlearn=Q-learning, model_tier=model selection, keyword=semantic keyword, hybrid=keyword+custom embedding (or graph hint if embedding_scores omitted), enhanced=auto hybrid, graph=pure knowledge-graph hint",
        },
        task: {
          type: "string",
          description: "Task description to route",
        },
        embedding_scores: {
          type: "object",
          description:
            "Route name -> score map, e.g. {\"security\": 0.8, \"testing\": 0.2} (only for hybrid action). " +
            "If omitted, hybrid derives this map from the knowledge graph instead (see action=graph).",
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
          let embeddingScores: Record<string, number>;
          if (
            scores === undefined ||
            scores === null ||
            (typeof scores === "object" && !Array.isArray(scores) && Object.keys(scores).length === 0)
          ) {
            // No explicit scores — fall back to the graph-derived hint.
            embeddingScores = graphHintToSkillScores(task);
          } else if (typeof scores !== "object" || Array.isArray(scores)) {
            return text(
              "'embedding_scores' must be an object mapping route name to score, e.g. {\"security\": 0.8}"
            );
          } else {
            embeddingScores = scores as Record<string, number>;
          }
          const result = engine.semanticRouteHybrid(task, embeddingScores);
          return json({ ...result, roster_agent: SKILL_TO_ROSTER[result.route] ?? null });
        }
        case "enhanced": {
          const engine = getProxyEngine();
          if (!engine) return text("Semantic router not available");
          return json(engine.semanticRouteEnhanced(task));
        }
        case "graph": {
          const hints = graphRouteHint(task);
          return json({ task, hints });
        }
        default:
          return text(`Unknown action: ${action}. Valid: qlearn, model_tier, keyword, hybrid, enhanced, graph`);
      }
    },
  },
];
