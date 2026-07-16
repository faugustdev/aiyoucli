import type { MCPTool, MCPToolResult } from "../../types.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderStatusline } from "../../statusline/generator.js";

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}

function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function getStatus(): MCPToolResult {
  const cwd = process.cwd();
  const hasConfig = existsSync(join(cwd, ".aiyoucli", "config.json"));
  const hasAgents = existsSync(join(cwd, ".aiyoucli", "agents", "store.json"));
  const hasSwarm = existsSync(join(cwd, ".aiyoucli", "swarm", "state.json"));

  return json({
    version: "1.0.2",
    cwd,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    initialized: hasConfig,
    agents: hasAgents,
    swarm: hasSwarm,
    uptime: Math.round(process.uptime()),
  });
}

function getCoordination(): MCPToolResult {
  const base = join(process.cwd(), ".aiyoucli");

  const swarm = loadJson<any>(join(base, "swarm", "state.json"));
  const agents = loadJson<any[]>(join(base, "agents", "store.json")) || [];
  const tasks = loadJson<any[]>(join(base, "tasks", "store.json")) || [];

  return json({
    swarm: swarm ? { id: swarm.id, topology: swarm.topology, status: swarm.status } : null,
    agents: {
      total: agents.length,
      active: agents.filter((a: any) => a.status !== "stopped").length,
    },
    tasks: {
      total: tasks.length,
      pending: tasks.filter((t: any) => t.status === "pending").length,
      in_progress: tasks.filter((t: any) => t.status === "in_progress").length,
      completed: tasks.filter((t: any) => t.status === "completed").length,
    },
  });
}

function getStatusline(format: string): MCPToolResult {
  const result = renderStatusline(process.cwd(), {
    json: format === "json",
    compact: format === "compact",
  });
  return text(result);
}

function getSwarmStatus(): MCPToolResult {
  const state = loadJson<any>(join(process.cwd(), ".aiyoucli", "swarm", "state.json"));
  if (!state) return text("No active swarm. Run swarm_init first.");
  return json(state);
}

export const statusTools: MCPTool[] = [
  {
    name: "status",
    description:
      "Get system status. scope=system: basic system info. scope=coordination: swarm+agents+tasks. scope=statusline: rich dashboard. scope=swarm: swarm only.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["system", "coordination", "statusline", "swarm"],
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
        case "coordination": return getCoordination();
        case "statusline": return getStatusline(format);
        case "swarm": return getSwarmStatus();
        default: return text(`Unknown scope: ${scope}. Valid: system, coordination, statusline, swarm`);
      }
    },
  },
];
