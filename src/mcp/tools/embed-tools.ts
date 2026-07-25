import type { MCPTool, MCPToolResult } from "../../types.js";

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}
function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}

function getProxyEngine(): any {
  try {
    const mod = require("../../napi/proxy.js");
    return mod.createProxyEngine();
  } catch { return null; }
}

export const embedTools: MCPTool[] = [
  {
    name: "embed",
    description: "Get text embedding. type=onnx: 384-dim ONNX model. type=keyword: 8-dim keyword embedding.",
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
      if (!engine) return text("Embed engine not available");

      switch (type) {
        case "onnx":
          return json(engine.embedText(text_));
        case "keyword":
          return json(engine.semanticEmbed(text_));
        default:
          return text(`Unknown type: ${type}. Valid: onnx, keyword`);
      }
    },
  },
];
