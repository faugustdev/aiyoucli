/**
 * AST tools — unified dispatch by mode (multi-language AST analysis via NAPI).
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { createProxyEngine, type ProxyEngineHandle } from "../../napi/proxy.js";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

let proxyEngine: ProxyEngineHandle | null = null;

function getEngine(): ProxyEngineHandle | null {
  if (!proxyEngine) {
    try {
      proxyEngine = createProxyEngine();
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
        language: {
          type: "string",
          description:
            "Language hint (for mode=analyze) — used to synthesize a path when 'path' is omitted",
        },
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
        path: {
          type: "string",
          description: "File path — drives parser selection (mode=analyze) or language detection (mode=detect)",
        },
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
            // Rust is analyzeCode(path, source) and derives the language from
            // the path. Passing (source, language) fed the whole file body in
            // as the path, so every analysis ran against an unknown language.
            const path = (input.path as string | undefined)
              ?? (input.language ? `source.${input.language as string}` : undefined);
            if (!path) {
              return text("Missing 'path' (or 'language') for mode=analyze — it determines the parser");
            }
            return json(engine.analyzeCode(path, input.source as string));
          }
          case "batch": {
            if (!input.files) return text("Missing 'files' for mode=batch");
            // Rust takes Vec<Vec<String>> — [path, source] pairs, not objects.
            const files = input.files as Array<{ path: string; source: string }>;
            const pairs = files.map(
              (f) => [f.path, f.source] as [string, string]
            );
            return json(engine.analyzeCodeBatch(pairs));
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
