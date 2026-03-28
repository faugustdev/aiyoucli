/**
 * Swarm tools — multi-agent coordination.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const STATE_DIR = join(process.cwd(), ".aiyoucli", "swarm");
const STATE_FILE = join(STATE_DIR, "state.json");

interface SwarmState {
  id: string;
  topology: string;
  maxAgents: number;
  strategy: string;
  status: "active" | "stopped";
  agents: string[];
  createdAt: number;
}

function loadState(): SwarmState | null {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, "utf-8")); } catch { return null; }
}

function saveState(state: SwarmState): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const swarmTools: MCPTool[] = [
  {
    name: "swarm_init",
    description: "Initialize a multi-agent swarm with a topology",
    inputSchema: {
      type: "object",
      properties: {
        topology: { type: "string", description: "hierarchical, mesh, ring, star, hybrid" },
        maxAgents: { type: "number", description: "Maximum agents (default: 8)" },
        strategy: { type: "string", description: "specialized, balanced, adaptive" },
      },
    },
    handler: async (input) => {
      const state: SwarmState = {
        id: `swarm-${Date.now().toString(36)}`,
        topology: (input.topology as string) || "hierarchical",
        maxAgents: (input.maxAgents as number) || 8,
        strategy: (input.strategy as string) || "specialized",
        status: "active",
        agents: [],
        createdAt: Date.now(),
      };
      saveState(state);
      return json({ id: state.id, topology: state.topology, maxAgents: state.maxAgents, strategy: state.strategy, status: "active" });
    },
  },
  {
    name: "swarm_status",
    description: "Get current swarm status",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const state = loadState();
      if (!state) return text("No active swarm. Run swarm_init first.");
      return json(state);
    },
  },
  {
    name: "swarm_stop",
    description: "Stop the active swarm",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const state = loadState();
      if (!state) return text("No active swarm.");
      state.status = "stopped";
      saveState(state);
      return text(`Swarm ${state.id} stopped.`);
    },
  },
];
