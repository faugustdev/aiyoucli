/**
 * Neural tools — SONA learning engine via NAPI.
 *
 * Note: SONA state is in-memory only — it accumulates within a single process.
 * In MCP mode (persistent server), observations build up across tool calls.
 * In CLI mode (one process per command), each invocation starts fresh.
 * Use `neural observe` + `neural learn` in the same MCP session for full learning cycles.
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
    description: "Submit an observation to the SONA learning engine (accumulates in MCP session, resets per CLI invocation)",
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
      const stats = getSona().stats();
      return text(`Observation recorded (buffered: ${stats.trajectories_buffered}, total: ${stats.signals_processed})`);
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
    description: "Get SONA engine statistics (resets per CLI invocation, accumulates in MCP session)",
    inputSchema: { type: "object", properties: {} },
    handler: async () => json(getSona().stats()),
  },
];
