import type { MCPTool, MCPToolResult } from "../../types.js";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}

function detectNapi(): { available: boolean; features: string[] } {
  const candidates = [
    join(__dirname, "..", "..", "..", "aiyoucli-napi.darwin-arm64.node"),
    join(__dirname, "..", "..", "..", "aiyoucli-napi.darwin-x64.node"),
    join(__dirname, "..", "..", "..", "aiyoucli-napi.linux-x64-gnu.node"),
    join(__dirname, "..", "..", "..", "aiyoucli-napi.node"),
  ];

  for (const c of candidates) {
    if (existsSync(c)) {
      return {
        available: true,
        features: [
          "vector_db",
          "sona_learning",
          "attention_router",
          "knowledge_graph",
          "q_learning_routing",
          "code_analysis",
          "proxy_engine",
          "ast_analyzer",
          "semantic_router",
          "distiller",
          "technology_detector",
        ],
      };
    }
  }

  return { available: false, features: [] };
}

function detectAiyouTeam(): {
  available: boolean;
  version: string | null;
  via: string;
} {
  try {
    const output = execSync("npx aiyou-team version 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (output) {
      const match = output.match(/Current version:\s*(\S+)/);
      const version = match ? match[1] : output.split("\n")[0];
      return { available: true, version, via: "npx" };
    }
  } catch {}

  try {
    const output = execSync("aiyou-team version 2>/dev/null", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (output) {
      const match = output.match(/Current version:\s*(\S+)/);
      const version = match ? match[1] : output.split("\n")[0];
      return { available: true, version, via: "global" };
    }
  } catch {}

  return { available: false, version: null, via: "none" };
}

function detectEmbedServer(): { running: boolean; port: number } {
  try {
    execSync(
      `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/health`,
      { encoding: "utf-8", timeout: 2000 }
    );
    return { running: true, port: 8001 };
  } catch {
    return { running: false, port: 8001 };
  }
}

export const discoveryTools: MCPTool[] = [
  {
    name: "capabilities",
    description:
      "Discover aiyoucli capabilities: NAPI features (aiyouvector), aiyou-team integration, embed server status, and tool count",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const napi = detectNapi();
      const team = detectAiyouTeam();
      const embed = detectEmbedServer();

      const pkgPath = join(__dirname, "..", "..", "..", "package.json");
      let version = "unknown";
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        version = pkg.version ?? "unknown";
      } catch {}

      return json({
        server: {
          name: "aiyoucli",
          version,
          protocol: "2024-11-05",
        },
        napi: {
          available: napi.available,
          binary: "aiyoucli-napi",
          features: napi.features,
        },
        aiyouvector: {
          integrated: napi.available,
          description:
            "Rust-backed vector intelligence (HNSW, SONA, KnowledgeGraph, Q-Learning)",
          backend: "aiyouvector-core",
          dimensions: 384,
          hnsw_enabled: true,
        },
        aiyou_team: {
          available: team.available,
          version: team.version,
          via: team.via,
        },
        embed_server: {
          running: embed.running,
          port: embed.port,
          model: "all-MiniLM-L6-v2",
          dimensions: 384,
        },
      });
    },
  },
  {
    name: "version",
    description:
      "Get version info for aiyoucli, aiyouvector (NAPI), aiyou-team, and runtime environment",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const napi = detectNapi();
      const team = detectAiyouTeam();

      const pkgPath = join(__dirname, "..", "..", "..", "package.json");
      let cliVersion = "unknown";
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        cliVersion = pkg.version ?? "unknown";
      } catch {}

      return json({
        aiyoucli: cliVersion,
        aiyouvector: napi.available ? "integrated (NAPI)" : "not available",
        aiyou_team: team.available ? team.version ?? "detected" : "not installed",
        embed_server: detectEmbedServer().running
          ? "running on :8001"
          : "not running",
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
      });
    },
  },
];
