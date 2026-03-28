/**
 * Coordination tools — swarm coordination status.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const coordinationTools: MCPTool[] = [
  {
    name: "coordination_status",
    description: "Get coordination status — swarm state, active agents, tasks",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const cwd = process.cwd();
      const base = join(cwd, ".aiyoucli");

      const loadJson = (path: string) => {
        if (!existsSync(path)) return null;
        try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
      };

      const swarm = loadJson(join(base, "swarm", "state.json"));
      const agents = loadJson(join(base, "agents", "store.json")) || [];
      const tasks = loadJson(join(base, "tasks", "store.json")) || [];

      return json({
        swarm: swarm ? { id: swarm.id, topology: swarm.topology, status: swarm.status } : null,
        agents: {
          total: agents.length,
          active: agents.filter((a: { status: string }) => a.status !== "stopped").length,
        },
        tasks: {
          total: tasks.length,
          pending: tasks.filter((t: { status: string }) => t.status === "pending").length,
          in_progress: tasks.filter((t: { status: string }) => t.status === "in_progress").length,
          completed: tasks.filter((t: { status: string }) => t.status === "completed").length,
        },
      });
    },
  },
];
