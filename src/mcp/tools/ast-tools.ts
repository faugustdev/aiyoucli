/**
 * AST tools — multi-language AST analysis via aiyoucli-napi NAPI.
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

export const astTools: MCPTool[] = [
  {
    name: "ast_analyze",
    description: "Analyze source code AST — extracts functions, classes, imports for JS/TS/Python/Rust/Go/Java",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source code content" },
        language: { type: "string", description: "Language hint (auto-detected if omitted)" },
      },
      required: ["source"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("AST analyzer not available");
      try {
        return json(engine.analyzeCode(input.source as string, input.language as string | undefined));
      } catch (err) {
        return text(`AST analyze error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "ast_analyze_batch",
    description: "Batch-analyze multiple source files",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              source: { type: "string" },
            },
          },
          description: "Array of {path, source} objects",
        },
      },
      required: ["files"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("AST analyzer not available");
      try {
        return json(engine.analyzeCodeBatch(input.files as Array<{ path: string; source: string }>));
      } catch (err) {
        return text(`AST batch error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "ast_detect_language",
    description: "Detect programming language by file extension",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path or extension" },
      },
      required: ["path"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("AST analyzer not available");
      try {
        return json(engine.detectLanguage(input.path as string));
      } catch (err) {
        return text(`AST detect error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
];
