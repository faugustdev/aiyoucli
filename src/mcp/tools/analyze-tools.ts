/**
 * Analysis tools — diff classification, complexity scoring via NAPI.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { createAnalysisEngine } from "../../napi/index.js";

const engine = createAnalysisEngine();

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const analyzeTools: MCPTool[] = [
  {
    name: "analyze_diff",
    description: "Classify a git diff — returns file-level classification, impact, risk factors",
    inputSchema: {
      type: "object",
      properties: {
        diff: { type: "string", description: "Git diff content (from `git diff`)" },
      },
      required: ["diff"],
    },
    handler: async (input) => json(engine.classifyDiff(input.diff as string)),
  },
  {
    name: "analyze_commit",
    description: "Classify a commit message (conventional commit detection)",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" },
      },
      required: ["message"],
    },
    handler: async (input) => text(engine.classifyCommit(input.message as string)),
  },
  {
    name: "analyze_complexity",
    description: "Score code complexity (0.0 = simple, 1.0 = very complex)",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source code content" },
      },
      required: ["source"],
    },
    handler: async (input) => {
      const score = engine.complexityScore(input.source as string);
      return json({ score, level: score < 0.3 ? "low" : score < 0.6 ? "medium" : "high" });
    },
  },
];
