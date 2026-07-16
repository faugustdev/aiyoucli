/**
 * Analysis tools — unified dispatch by type.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { createAnalysisEngine } from "../../napi/index.js";

const engine = createAnalysisEngine();

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const analyzeTools: MCPTool[] = [
  {
    name: "analyze",
    description: "Code analysis. type=diff: classify git diff. type=commit: classify commit message. type=complexity: score code complexity.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["diff", "commit", "complexity"],
          description: "Analysis type",
        },
        diff: { type: "string", description: "Git diff content (for type=diff)" },
        message: { type: "string", description: "Commit message (for type=commit)" },
        source: { type: "string", description: "Source code (for type=complexity)" },
      },
      required: ["type"],
    },
    handler: async (input) => {
      const type = input.type as string;
      switch (type) {
        case "diff": {
          if (!input.diff) return text("Missing 'diff' parameter for type=diff");
          return json(engine.classifyDiff(input.diff as string));
        }
        case "commit": {
          if (!input.message) return text("Missing 'message' parameter for type=commit");
          return text(engine.classifyCommit(input.message as string));
        }
        case "complexity": {
          if (!input.source) return text("Missing 'source' parameter for type=complexity");
          const score = engine.complexityScore(input.source as string);
          return json({ score, level: score < 0.3 ? "low" : score < 0.6 ? "medium" : "high" });
        }
        default:
          return text(`Unknown type: ${type}. Valid: diff, commit, complexity`);
      }
    },
  },
];
