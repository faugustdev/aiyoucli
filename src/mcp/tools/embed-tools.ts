import type { MCPTool, MCPToolResult } from "../../types.js";
import { createProxyEngine, type ProxyEngineHandle } from "../../napi/proxy.js";

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}
function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}
/**
 * Error results must carry `isError`. Callers such as indexer-embed's
 * `embedChunk` branch on it; without the flag a failure is indistinguishable
 * from a valid payload and gets swallowed by a JSON.parse catch.
 */
function errorResult(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }], isError: true };
}

let proxyEngine: ProxyEngineHandle | null = null;
let proxyLoadError: string | null = null;

function getProxyEngine(): ProxyEngineHandle | null {
  if (proxyEngine) return proxyEngine;
  if (proxyLoadError) return null;
  try {
    proxyEngine = createProxyEngine();
    return proxyEngine;
  } catch (err) {
    proxyLoadError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

export const embedTools: MCPTool[] = [
  {
    name: "embed",
    description:
      "Get a text embedding as a JSON array of numbers. type=onnx: ONNX model (needs the local embed server). type=keyword: dependency-free keyword/hashing embedding.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["onnx", "keyword"],
          description: "Embedding type (default: onnx)",
        },
        text: { type: "string", description: "Text to embed" },
      },
      required: ["text"],
    },
    handler: async (input) => {
      const type = (input.type as string) || "onnx";
      const text_ = input.text as string;
      const engine = getProxyEngine();
      if (!engine) {
        return errorResult(
          `Embed engine not available: ${proxyLoadError ?? "unknown reason"}`
        );
      }

      switch (type) {
        case "onnx": {
          // embedText returns { embedding?, dimensions?, error? } — the ONNX
          // path needs the local embed server, so surface its error instead
          // of returning an object the caller will fail to parse as a vector.
          const result = engine.embedText(text_);
          if (result.error) return errorResult(`ONNX embed failed: ${result.error}`);
          if (!result.embedding) return errorResult("ONNX embed returned no embedding");
          return json(result.embedding);
        }
        case "keyword":
          return json(engine.semanticEmbed(text_));
        default:
          return errorResult(`Unknown type: ${type}. Valid: onnx, keyword`);
      }
    },
  },
];
