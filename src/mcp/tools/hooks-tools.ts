/**
 * Hooks tools — lifecycle hooks for pre/post task, routing, workers.
 * Q-table persisted to .aiyoucli/q-table.json between sessions.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { execSync, exec, spawn } from "node:child_process";
import net from "node:net";
import type { MCPTool, MCPToolResult } from "../../types.js";
import { createRoutingEngine, type RoutingEngine } from "../../napi/index.js";
import { loadConfig } from "../../config.js";
import { isPortInUse, stopAll } from "../../models/launcher.js";

function checkPortReachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => resolve(false));
    socket.connect(port, "127.0.0.1");
  });
}

async function waitForPortsReady(ports: number[], timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let allReady = true;
    for (const port of ports) {
      const ready = await checkPortReachable(port);
      if (!ready) {
        allReady = false;
        break;
      }
    }
    if (allReady) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

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

      // Auto Wake-on-Request local models logic
      const recommendedTier = result.model_tier; // e.g. unimodel, dualmodels, treemodels
      const isResearch = /research|investiga|redacta|write|summary|report|analiza|articulo|redacción/i.test(taskDescription);
      const mode = isResearch ? "research" : "coder";

      const modes = (config as any).routing?.modes;
      if (modes && modes[mode] && modes[mode][recommendedTier]) {
        const tierConfig = modes[mode][recommendedTier];
        const ports = tierConfig.ports || [];
        
        let portsActive = true;
        for (const port of ports) {
          if (!isPortInUse(port) && !(await checkPortReachable(port))) {
            portsActive = false;
            break;
          }
        }

        if (!portsActive) {
          console.log(`[Hooks Pre-Task] Levantando perfiles para modo ${mode} en Tier ${recommendedTier}...`);
          try {
            // Detener servidores corriendo para evitar colisiones de VRAM
            stopAll();
          } catch {}

          // Lanza el script correspondiente en segundo plano
          const scriptName = `${recommendedTier}.sh`;
          const scriptPath = join(config.projectRoot, "scripts", scriptName);
          
          try {
            const child = spawn("bash", [scriptPath, mode], { detached: true, stdio: "ignore" });
            child.unref();
            
            console.log(`[Hooks Pre-Task] Esperando a que los puertos [${ports.join(", ")}] esten listos...`);
            const ready = await waitForPortsReady(ports);
            if (ready) {
              console.log(`[Hooks Pre-Task] Modelos iniciados y listos en modo ${mode}.`);
            } else {
              console.warn(`[Hooks Pre-Task] Advertencia: Algunos modelos no respondieron a tiempo.`);
            }
          } catch (err) {
            console.error(`[Hooks Pre-Task] Error al arrancar lanzador: ${err}`);
          }
        }
      }

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
];
