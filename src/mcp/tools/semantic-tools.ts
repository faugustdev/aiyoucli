/**
 * Semantic tools — semantic routing via aiyoucli-napi NAPI.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let proxyEngine: any = null;

function createProxyEngine() {
  try {
    const mod = require("../../napi/proxy.js");
    return mod.getProxyEngine?.() ?? null;
  } catch {
    return null;
  }
}

function getEngine() {
  if (!proxyEngine) proxyEngine = createProxyEngine();
  return proxyEngine;
}

export const semanticTools: MCPTool[] = [
  {
    name: "semantic_route",
    description: "Route a task to the optimal agent type using keyword matching",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task description to route" },
      },
      required: ["task"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Semantic router not available");
      try {
        return json(engine.semanticRoute(input.task as string));
      } catch (err) {
        return text(`Semantic route error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "semantic_route_hybrid",
    description: "Route a task with custom embedding scores (keyword + embedding hybrid)",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task description" },
        embedding: { type: "array", items: { type: "number" }, description: "Pre-computed embedding" },
      },
      required: ["task"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Semantic router not available");
      try {
        return json(engine.semanticRouteHybrid(
          input.task as string,
          input.embedding as number[] | undefined,
        ));
      } catch (err) {
        return text(`Semantic route hybrid error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "semantic_route_enhanced",
    description: "Auto hybrid route — combines keyword matching with gateway embeddings",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task description" },
      },
      required: ["task"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Semantic router not available");
      try {
        return json(engine.semanticRouteEnhanced(input.task as string));
      } catch (err) {
        return text(`Semantic route enhanced error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "semantic_embed",
    description: "Get keyword embedding vector for a text (8-dim)",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to embed" },
      },
      required: ["text"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Semantic router not available");
      try {
        return json(engine.semanticEmbed(input.text as string));
      } catch (err) {
        return text(`Semantic embed error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "semantic_stats",
    description: "Get semantic router configuration and agent statistics",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const engine = getEngine();
      if (!engine) return text("Semantic router not available");
      try {
        return json(engine.semanticStats());
      } catch (err) {
        return text(`Semantic stats error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
];
