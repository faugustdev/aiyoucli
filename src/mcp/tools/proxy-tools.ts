/**
 * Proxy tools — gateway, compression, shield, embedding via aiyoucli-napi NAPI.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let proxyEngine: any = null;

function getProxyEngine() {
  if (!proxyEngine) {
    try {
      proxyEngine = createProxyEngine();
    } catch {
      return null;
    }
  }
  return proxyEngine;
}

function createProxyEngine() {
  // Lazy-load NAPI proxy bindings
  const mod = require("../../napi/proxy.js");
  return mod.createProxyEngine();
}

export const proxyTools: MCPTool[] = [
  {
    name: "proxy_health",
    description: "Check proxy engine health status",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const engine = getProxyEngine();
      if (!engine) return text("proxy engine not available");
      try {
        const health = engine.healthCheck();
        return json(health);
      } catch {
        return text("Proxy health check failed");
      }
    },
  },
  {
    name: "proxy_chat",
    description: "Send a chat completion request through the proxy gateway",
    inputSchema: {
      type: "object",
      properties: {
        messages: { type: "array", description: "Chat messages [{role, content}]" },
        model: { type: "string", description: "Model override" },
        max_tokens: { type: "number", description: "Max tokens" },
      },
      required: ["messages"],
    },
    handler: async (input) => {
      const engine = getProxyEngine();
      if (!engine) return text("proxy engine not available");
      try {
        const result = engine.chatCompletion(
          input.messages as Array<{ role: string; content: string }>,
          input.model as string | undefined,
        );
        return json(result);
      } catch (err) {
        return text(`Proxy chat error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "proxy_compress",
    description: "Compress text using the proxy compression engine",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to compress" },
        target_ratio: { type: "number", description: "Target compression ratio (0.0-1.0)" },
      },
      required: ["text"],
    },
    handler: async (input) => {
      const engine = getProxyEngine();
      if (!engine) return text("proxy engine not available");
      try {
        const messages = [{ role: "user", content: input.text as string }];
        const result = engine.compressMessages(messages);
        return json(result);
      } catch (err) {
        return text(`Proxy compress error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "proxy_shield_check",
    description: "Check content through the security shield",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Content to scan" },
      },
      required: ["content"],
    },
    handler: async (input) => {
      const engine = getProxyEngine();
      if (!engine) return text("proxy engine not available");
      try {
        const result = engine.shieldCheck(input.content as string);
        return json(result);
      } catch (err) {
        return text(`Proxy shield error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "proxy_estimate_cost",
    description: "Estimate token cost for a request",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Model name" },
        input_tokens: { type: "number", description: "Input token count" },
        output_tokens: { type: "number", description: "Output token count" },
      },
      required: ["model", "input_tokens", "output_tokens"],
    },
    handler: async (input) => {
      const engine = getProxyEngine();
      if (!engine) return text("proxy engine not available");
      try {
        return json(engine.estimatedCost(
          input.model as string,
          input.input_tokens as number,
          input.output_tokens as number,
        ));
      } catch (err) {
        return text(`Estimate cost error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "proxy_analyze_text",
    description: "Analyze text for structure, sentiment, and key topics",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
      },
      required: ["text"],
    },
    handler: async (input) => {
      const engine = getProxyEngine();
      if (!engine) return text("proxy engine not available");
      try {
        return json(engine.analyzeText(input.text as string));
      } catch (err) {
        return text(`Analyze error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "proxy_segment",
    description: "Segment text into logical chunks for processing",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to segment" },
        max_chunk_size: { type: "number", description: "Max chunk size in tokens" },
      },
      required: ["text"],
    },
    handler: async (input) => {
      const engine = getProxyEngine();
      if (!engine) return text("proxy engine not available");
      try {
        return json(engine.segmentByChunks(input.text as string, (input.max_chunk_size as number) ?? 500));
      } catch (err) {
        return text(`Segment error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
];
