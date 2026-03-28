/**
 * Neural tools — SONA learning engine via NAPI.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { createSonaEngine, type SonaHandle } from "../../napi/index.js";

let sona: SonaHandle | null = null;
function getSona(): SonaHandle {
  if (!sona) sona = createSonaEngine();
  return sona;
}

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const neuralTools: MCPTool[] = [
  {
    name: "neural_observe",
    description: "Submit an observation to the SONA learning engine",
    inputSchema: {
      type: "object",
      properties: {
        embedding: { type: "array", items: { type: "number" }, description: "Observation embedding vector" },
        quality: { type: "number", description: "Quality score 0.0-1.0" },
        kind: { type: "string", description: "Observation kind: commit, test, edit" },
      },
      required: ["embedding", "quality"],
    },
    handler: async (input) => {
      getSona().submitObservation(
        input.embedding as number[],
        input.quality as number,
        input.kind as string | undefined,
      );
      return text("Observation recorded");
    },
  },
  {
    name: "neural_transform",
    description: "Transform an embedding through learned LoRA weights",
    inputSchema: {
      type: "object",
      properties: {
        embedding: { type: "array", items: { type: "number" }, description: "Input embedding" },
      },
      required: ["embedding"],
    },
    handler: async (input) => {
      const result = getSona().transformEmbedding(input.embedding as number[]);
      return json(result);
    },
  },
  {
    name: "neural_learn",
    description: "Force background learning (Loop B) on buffered observations",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const processed = getSona().forceLearn();
      return text(`Processed ${processed} trajectories`);
    },
  },
  {
    name: "neural_stats",
    description: "Get SONA engine statistics",
    inputSchema: { type: "object", properties: {} },
    handler: async () => json(getSona().stats()),
  },
];
