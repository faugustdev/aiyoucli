import type { MCPTool, MCPToolResult } from "../../types.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderStatusline } from "../../statusline/generator.js";

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}

function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}

function getStatus(): MCPToolResult {
  const cwd = process.cwd();
  const hasConfig = existsSync(join(cwd, ".aiyoucli", "config.json"));

  return json({
    version: "1.0.2",
    cwd,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    initialized: hasConfig,
    uptime: Math.round(process.uptime()),
  });
}

function getStatusline(format: string): MCPToolResult {
  const result = renderStatusline(process.cwd(), {
    json: format === "json",
    compact: format === "compact",
  });
  return text(result);
}

export const statusTools: MCPTool[] = [
  {
    name: "status",
    description:
      "Get system status. scope=system: basic system info. scope=statusline: rich dashboard.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["system", "statusline"],
          description: "Status scope (default: system)",
        },
        format: {
          type: "string",
          enum: ["json", "text", "compact"],
          description: "Output format (only for statusline scope, default: json)",
        },
      },
    },
    handler: async (input) => {
      const scope = (input.scope as string) || "system";
      const format = (input.format as string) || "json";

      switch (scope) {
        case "system": return getStatus();
        case "statusline": return getStatusline(format);
        default: return text(`Unknown scope: ${scope}. Valid: system, statusline`);
      }
    },
  },
];
