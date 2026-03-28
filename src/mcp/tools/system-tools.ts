/**
 * System tools — status, health diagnostics.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const systemTools: MCPTool[] = [
  {
    name: "system_status",
    description: "Get system status overview",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const cwd = process.cwd();
      const hasConfig = existsSync(join(cwd, ".aiyoucli", "config.json"));
      const hasAgents = existsSync(join(cwd, ".aiyoucli", "agents", "store.json"));
      const hasSwarm = existsSync(join(cwd, ".aiyoucli", "swarm", "state.json"));

      return json({
        version: "0.1.0",
        cwd,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        initialized: hasConfig,
        agents: hasAgents,
        swarm: hasSwarm,
        uptime: Math.round(process.uptime()),
      });
    },
  },
  {
    name: "system_doctor",
    description: "Run health diagnostics",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const checks: Array<{ name: string; status: string; detail?: string }> = [];

      // Node version
      const nodeVersion = parseInt(process.version.slice(1));
      checks.push({
        name: "Node.js",
        status: nodeVersion >= 20 ? "ok" : "fail",
        detail: process.version,
      });

      // NAPI binding
      try {
        const { inMemoryVectorDB } = await import("../../napi/index.js");
        const db = inMemoryVectorDB(3);
        db.insert([1, 0, 0]);
        checks.push({ name: "NAPI binding", status: "ok", detail: "aiyouvector-core loaded" });
      } catch (e) {
        checks.push({ name: "NAPI binding", status: "fail", detail: String(e) });
      }

      // Git
      try {
        const { execSync } = await import("node:child_process");
        const gitVersion = execSync("git --version", { encoding: "utf-8" }).trim();
        checks.push({ name: "git", status: "ok", detail: gitVersion });
      } catch {
        checks.push({ name: "git", status: "fail" });
      }

      const allOk = checks.every((c) => c.status === "ok");
      return json({ healthy: allOk, checks });
    },
  },
];
