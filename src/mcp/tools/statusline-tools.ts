/**
 * Statusline MCP tool — returns status dashboard data.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { renderStatusline } from "../../statusline/generator.js";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }

export const statuslineTools: MCPTool[] = [
  {
    name: "statusline",
    description: "Get rich status dashboard — swarm, agents, memory, git, tasks",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", description: "Output format: text, json, compact (default: json)" },
      },
    },
    handler: async (input) => {
      const format = (input.format as string) || "json";
      const result = renderStatusline(process.cwd(), {
        json: format === "json",
        compact: format === "compact",
      });
      return text(result);
    },
  },
];
