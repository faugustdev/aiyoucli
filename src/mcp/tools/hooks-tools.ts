/**
 * Hooks tools — lifecycle hooks for pre/post task, routing, workers.
 * Q-table persisted to .aiyoucli/q-table.json between sessions.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { MCPTool, MCPToolResult } from "../../types.js";
import { createRoutingEngine, type RoutingEngine } from "../../napi/index.js";

const Q_TABLE_DIR = join(process.cwd(), ".aiyoucli");
const Q_TABLE_PATH = join(Q_TABLE_DIR, "q-table.json");

let router: RoutingEngine | null = null;

async function getRouter(): Promise<RoutingEngine> {
  if (!router) {
    router = createRoutingEngine();
    // Load persisted Q-table if it exists
    if (existsSync(Q_TABLE_PATH)) {
      try {
        const data = await readFile(Q_TABLE_PATH, "utf-8");
        router.importQTable(data);
      } catch {
        // Corrupted file — start fresh
      }
    }
  }
  return router;
}

async function persistQTable(): Promise<void> {
  if (!router) return;
  try {
    await mkdir(Q_TABLE_DIR, { recursive: true });
    const data = router.exportQTable();
    await writeFile(Q_TABLE_PATH, data);
  } catch {
    // Non-critical — best effort persistence
  }
}

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const hooksTools: MCPTool[] = [
  {
    name: "hooks_pre_task",
    description: "Pre-task hook — get routing recommendation before starting work",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Task description" },
      },
      required: ["description"],
    },
    handler: async (input) => {
      const r = await getRouter();
      const result = r.route(input.description as string);
      return json({
        recommended_agent: result.route,
        model_tier: result.model_tier,
        confidence: result.confidence,
        alternatives: result.alternatives,
      });
    },
  },
  {
    name: "hooks_post_task",
    description: "Post-task hook — record outcome for learning, persists Q-table to disk",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Task description" },
        agent: { type: "string", description: "Agent type that was used" },
        success: { type: "boolean", description: "Whether the task succeeded" },
      },
      required: ["description", "agent", "success"],
    },
    handler: async (input) => {
      const r = await getRouter();
      const reward = (input.success as boolean) ? 1.0 : -0.5;
      r.recordReward(
        input.description as string,
        input.agent as string,
        reward,
      );
      await persistQTable();
      return text(`Recorded ${(input.success as boolean) ? "success" : "failure"} for ${input.agent} (Q-table saved)`);
    },
  },
  {
    name: "hooks_route",
    description: "Route a task to the optimal agent type",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task description" },
      },
      required: ["task"],
    },
    handler: async (input) => {
      const r = await getRouter();
      return json(r.route(input.task as string));
    },
  },
  {
    name: "hooks_model_route",
    description: "Select optimal model tier (haiku/sonnet/opus) for a task",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task description" },
      },
      required: ["task"],
    },
    handler: async (input) => {
      const r = await getRouter();
      const tier = r.selectModelTier(input.task as string);
      return json({ model: tier });
    },
  },
  {
    name: "hooks_stats",
    description: "Get routing engine statistics",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const r = await getRouter();
      return json(r.stats());
    },
  },
];
