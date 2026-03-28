/**
 * Agent tools — lifecycle management for AI agents with metrics tracking.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const STORE_DIR = join(process.cwd(), ".aiyoucli", "agents");
const STORE_FILE = join(STORE_DIR, "store.json");

interface AgentMetrics {
  tasksCompleted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastActiveAt: number | null;
}

interface Agent {
  id: string;
  type: string;
  name: string;
  status: "idle" | "busy" | "stopped";
  model: string;
  createdAt: number;
  metrics: AgentMetrics;
}

function emptyMetrics(): AgentMetrics {
  return {
    tasksCompleted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    lastActiveAt: null,
  };
}

function loadStore(): Agent[] {
  if (!existsSync(STORE_FILE)) return [];
  try {
    const agents = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Agent[];
    // Backfill metrics for agents created before metrics existed
    for (const agent of agents) {
      if (!agent.metrics) agent.metrics = emptyMetrics();
    }
    return agents;
  } catch { return []; }
}

function saveStore(agents: Agent[]): void {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(agents, null, 2));
}

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

const MODEL_DEFAULTS: Record<string, string> = {
  coder: "sonnet", researcher: "sonnet", tester: "haiku",
  reviewer: "sonnet", architect: "opus", security: "opus",
  debugger: "sonnet", documenter: "haiku",
};

export const agentTools: MCPTool[] = [
  {
    name: "agent_spawn",
    description: "Spawn a new AI agent with a given type and optional name",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Agent type: coder, researcher, tester, reviewer, architect, security, debugger, documenter" },
        name: { type: "string", description: "Optional agent name" },
        model: { type: "string", description: "Model override: haiku, sonnet, opus" },
      },
      required: ["type"],
    },
    handler: async (input) => {
      const agentType = (input.type as string) || "coder";
      const name = (input.name as string) || `${agentType}-${Date.now().toString(36)}`;
      const model = (input.model as string) || MODEL_DEFAULTS[agentType] || "sonnet";
      const id = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      const agent: Agent = {
        id, type: agentType, name, status: "idle", model, createdAt: Date.now(),
        metrics: emptyMetrics(),
      };
      const agents = loadStore();
      agents.push(agent);
      saveStore(agents);

      return json({ id, type: agentType, name, model, status: "idle" });
    },
  },
  {
    name: "agent_list",
    description: "List all active agents with their metrics",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const agents = loadStore().filter((a) => a.status !== "stopped");
      return json(agents);
    },
  },
  {
    name: "agent_status",
    description: "Get status and metrics of a specific agent",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Agent ID" } },
      required: ["id"],
    },
    handler: async (input) => {
      const agent = loadStore().find((a) => a.id === input.id);
      return agent ? json(agent) : text(`Agent not found: ${input.id}`);
    },
  },
  {
    name: "agent_stop",
    description: "Stop an agent by ID",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Agent ID" } },
      required: ["id"],
    },
    handler: async (input) => {
      const agents = loadStore();
      const agent = agents.find((a) => a.id === input.id);
      if (!agent) return text(`Agent not found: ${input.id}`);
      agent.status = "stopped";
      saveStore(agents);
      return text(`Stopped agent: ${agent.name} (${agent.id})`);
    },
  },
  {
    name: "agent_record",
    description: "Record a task outcome for an agent (updates metrics: success/fail count, duration)",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Agent ID" },
        success: { type: "boolean", description: "Whether the task succeeded" },
        duration_ms: { type: "number", description: "Task duration in milliseconds" },
      },
      required: ["id", "success"],
    },
    handler: async (input) => {
      const agents = loadStore();
      const agent = agents.find((a) => a.id === input.id);
      if (!agent) return text(`Agent not found: ${input.id}`);

      const success = input.success as boolean;
      const durationMs = (input.duration_ms as number) ?? 0;

      agent.metrics.tasksCompleted++;
      if (success) {
        agent.metrics.tasksSucceeded++;
      } else {
        agent.metrics.tasksFailed++;
      }
      agent.metrics.totalDurationMs += durationMs;
      agent.metrics.avgDurationMs = Math.round(
        agent.metrics.totalDurationMs / agent.metrics.tasksCompleted
      );
      agent.metrics.lastActiveAt = Date.now();

      saveStore(agents);

      const rate = agent.metrics.tasksCompleted > 0
        ? Math.round((agent.metrics.tasksSucceeded / agent.metrics.tasksCompleted) * 100)
        : 0;

      return json({
        agent: agent.name,
        tasksCompleted: agent.metrics.tasksCompleted,
        successRate: `${rate}%`,
        avgDurationMs: agent.metrics.avgDurationMs,
      });
    },
  },
  {
    name: "agent_metrics",
    description: "Get aggregated metrics across all agents",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const agents = loadStore().filter((a) => a.status !== "stopped");

      const summary = {
        totalAgents: agents.length,
        totalTasks: 0,
        totalSucceeded: 0,
        totalFailed: 0,
        overallSuccessRate: "0%",
        byType: {} as Record<string, {
          count: number;
          tasks: number;
          successRate: string;
          avgDurationMs: number;
        }>,
      };

      for (const agent of agents) {
        summary.totalTasks += agent.metrics.tasksCompleted;
        summary.totalSucceeded += agent.metrics.tasksSucceeded;
        summary.totalFailed += agent.metrics.tasksFailed;

        const entry = summary.byType[agent.type] ??= {
          count: 0, tasks: 0, successRate: "0%", avgDurationMs: 0,
        };
        entry.count++;
        entry.tasks += agent.metrics.tasksCompleted;
        entry.avgDurationMs += agent.metrics.avgDurationMs;
      }

      if (summary.totalTasks > 0) {
        summary.overallSuccessRate = `${Math.round((summary.totalSucceeded / summary.totalTasks) * 100)}%`;
      }

      for (const [, entry] of Object.entries(summary.byType)) {
        if (entry.count > 0) entry.avgDurationMs = Math.round(entry.avgDurationMs / entry.count);
        if (entry.tasks > 0) {
          const succeeded = agents
            .filter((a) => a.type === Object.keys(summary.byType).find((k) => summary.byType[k] === entry))
            .reduce((s, a) => s + a.metrics.tasksSucceeded, 0);
          entry.successRate = `${Math.round((succeeded / entry.tasks) * 100)}%`;
        }
      }

      return json(summary);
    },
  },
];
