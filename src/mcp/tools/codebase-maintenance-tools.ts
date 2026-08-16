/**
 * Codebase maintenance — verify/observe. Secondary (MCP-protocol)
 * exposure; see codebase-project-tools.ts's header comment.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { verifyState, observePipeline } from "../../napi/codebase.js";

function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}
function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}

export const codebaseMaintenanceTools: MCPTool[] = [
  {
    name: "codebase_maintenance",
    description:
      "Codebase installation maintenance. mode=verify: check the on-disk manifest against " +
      "actual files. mode=observe: run an observer/SONA/profile learning pass over a repo " +
      "without re-indexing it.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["verify", "observe"] },
        init: { type: "boolean", description: "Generate the manifest from current disk state (mode=verify)" },
        strict: { type: "boolean", description: "Also fail on untracked files (mode=verify)" },
        repo_path: { type: "string", description: "Path to the repository (mode=observe)" },
      },
      required: ["mode"],
    },
    handler: async (input) => {
      const mode = input.mode as string;
      try {
        switch (mode) {
          case "verify":
            return json(verifyState(input.init as boolean | undefined, input.strict as boolean | undefined));
          case "observe": {
            if (!input.repo_path) return text("Missing 'repo_path' for mode=observe");
            return json(observePipeline(input.repo_path as string));
          }
          default:
            return text(`Unknown mode: ${mode}. Valid: verify, observe`);
        }
      } catch (err) {
        return text(`codebase_maintenance error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
];
