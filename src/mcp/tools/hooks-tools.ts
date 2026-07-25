/**
 * Hooks tools — lifecycle hooks for pre/post task, routing, workers.
 * Q-table persisted to .aiyoucli/q-table.json between sessions.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import type { MCPTool, MCPToolResult } from "../../types.js";
import {
  createRoutingEngine,
  getAgentProfiles,
  type RoutingEngine,
  type AgentProfile,
} from "../../napi/index.js";
import { loadConfig } from "../../config.js";

function getQTableDir(): string {
  return join(process.cwd(), ".aiyoucli");
}

function getQTablePath(): string {
  return join(getQTableDir(), "q-table.json");
}

let router: RoutingEngine | null = null;

async function getRouter(): Promise<RoutingEngine> {
  if (!router) {
    router = createRoutingEngine();
    // Load persisted Q-table if it exists
    const qTablePath = getQTablePath();
    if (existsSync(qTablePath)) {
      try {
        const data = await readFile(qTablePath, "utf-8");
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
    const qTableDir = getQTableDir();
    const qTablePath = getQTablePath();
    await mkdir(qTableDir, { recursive: true });
    const data = router.exportQTable();
    await writeFile(qTablePath, data);
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
      // Execute configured pre_task shell command if present
      const config = loadConfig();
      if (config.hooks?.pre_task) {
        try {
          execSync(config.hooks.pre_task, { stdio: "inherit" });
        } catch (err) {
          // Log or handle error but proceed
          console.error(`Error running pre_task hook: ${err}`);
        }
      }

      const r = await getRouter();
      const taskDescription = input.description as string;
      const result = r.route(taskDescription);

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

      // Execute configured post_task shell command if present
      const config = loadConfig();
      if (config.hooks?.post_task) {
        try {
          execSync(config.hooks.post_task, { stdio: "inherit" });
        } catch (err) {
          console.error(`Error running post_task hook: ${err}`);
        }
      }

      return text(`Recorded ${(input.success as boolean) ? "success" : "failure"} for ${input.agent} (Q-table saved)`);
    },
  },
  {
    name: "q_table_seed",
    description:
      "Seed the Q-table with sensible initial values for the 8 agent profiles. " +
      "Idempotent: existing Q-table entries are preserved, only missing entries are added. " +
      "Returns the number of entries seeded.",
    inputSchema: {
      type: "object",
      properties: {
        topK: {
          type: "number",
          description: "Number of top keywords per profile to seed (default 3, max 10)",
        },
        reward: {
          type: "number",
          description: "Initial Q-value reward for the matching agent (default 0.5, range 0..1)",
        },
        force: {
          type: "boolean",
          description: "Overwrite the existing q-table.json if present (default false)",
        },
      },
    },
    handler: async (input) => {
      const topK = Math.min(Math.max((input.topK as number) ?? 3, 1), 10);
      const reward = Math.min(Math.max((input.reward as number) ?? 0.5, 0), 1);
      const force = (input.force as boolean) ?? false;

      const qTablePath = getQTablePath();
      const qTableDir = getQTableDir();

      // Skip if Q-table already exists and force is false.
      if (!force && existsSync(qTablePath)) {
        return text(`Q-table already exists at ${qTablePath}. Pass force=true to overwrite.`);
      }

      const profiles = getAgentProfiles();
      if (profiles.length === 0) {
        return text(
          "No agent profiles available — NAPI binding missing or agent_profiles() returned empty. " +
            "Run `npm run build:rs` to ensure the native binary exposes semantic_agent_profiles."
        );
      }

      // Create a fresh routing engine. We DO NOT load the existing Q-table
      // because the whole point of seeding is to start from a known state.
      const r = createRoutingEngine();
      let seeded = 0;
      const seedLog: Array<{ keyword: string; agent: string; reward: number }> = [];

      for (const profile of profiles) {
        for (const kw of profile.keywords.slice(0, topK)) {
          const keyword = kw.text;
          // route() initializes the Q-table entry for this state hash.
          r.route(keyword);
          // recordReward() applies a direct Q-update favoring the chosen agent.
          r.recordReward(keyword, profile.name, reward);
          seedLog.push({ keyword, agent: profile.name, reward });
          seeded++;
        }
      }

      // Persist the seeded Q-table.
      const qJson = r.exportQTable();
      try {
        await mkdir(qTableDir, { recursive: true });
        await writeFile(qTablePath, qJson, "utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return text(`Failed to write Q-table: ${msg}`);
      }

      return json({
        seeded_entries: seeded,
        profiles_used: profiles.length,
        top_k: topK,
        reward,
        q_table_path: qTablePath,
        sample: seedLog.slice(0, 5),
      });
    },
  },
];
