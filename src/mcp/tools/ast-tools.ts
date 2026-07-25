/**
 * AST tools — unified dispatch by mode (multi-language AST analysis via NAPI).
 */

import type { MCPTool, MCPToolResult } from "../../types.js";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let proxyEngine: any = null;

function getEngine(): any {
  if (!proxyEngine) {
    try {
      const mod = require("../../napi/proxy.js");
      proxyEngine = mod.createProxyEngine();
    } catch { return null; }
  }
  return proxyEngine;
}

export const astTools: MCPTool[] = [
  {
    name: "ast",
    description: "Multi-language AST analysis. mode=analyze: single source. mode=batch: multiple files. mode=detect: detect language by extension.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["analyze", "batch", "detect"],
          description: "AST operation mode",
        },
        source: { type: "string", description: "Source code content (for mode=analyze)" },
        language: { type: "string", description: "Language hint (for mode=analyze)" },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              source: { type: "string" },
            },
          },
          description: "Array of {path, source} objects (for mode=batch)",
        },
        path: { type: "string", description: "File path or extension (for mode=detect)" },
      },
      required: ["mode"],
    },
    handler: async (input) => {
      const mode = input.mode as string;
      const engine = getEngine();
      if (!engine) return text("AST analyzer not available");

      try {
        switch (mode) {
          case "analyze": {
            if (!input.source) return text("Missing 'source' for mode=analyze");
            return json(engine.analyzeCode(input.source as string, input.language as string | undefined));
          }
          case "batch": {
            if (!input.files) return text("Missing 'files' for mode=batch");
            return json(engine.analyzeCodeBatch(input.files as Array<{ path: string; source: string }>));
          }
          case "detect": {
            if (!input.path) return text("Missing 'path' for mode=detect");
            return json(engine.detectLanguage(input.path as string));
          }
          default:
            return text(`Unknown mode: ${mode}. Valid: analyze, batch, detect`);
        }
      } catch (err) {
        return text(`AST error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
];
