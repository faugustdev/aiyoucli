import type { MCPTool, MCPToolResult } from "../../types.js";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { isNapiAvailable } from "../../napi/index.js";
import { loadConfig } from "./memory-tools.js";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}

/**
 * Whether the native binding is usable.
 *
 * Delegates to the real loader instead of re-deriving candidate paths. The
 * old local list only checked the package root — where `napi build -o .`
 * drops the binary during development — so every npm install, where the
 * binary ships inside the platform package, was reported as "not found"
 * even though it loaded fine.
 */
function detectNapi(): { available: boolean; features: string[] } {
  if (!isNapiAvailable()) {
    return { available: false, features: [] };
  }

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

function detectAiyouTeam(): {
  available: boolean;
  version: string | null;
  via: string;
} {
  // Resolve the package first: it is a declared dependency, so when it is
  // installed this answers instantly and without spawning a process. The
  // execSync probes below only find it if a CLI binary happens to be on PATH,
  // which is not how the dependency is normally consumed.
  const installed = readInstalledTeamManifest();
  if (installed?.version) {
    return { available: true, version: installed.version, via: "dependency" };
  }

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

/**
 * Read @aiyou-dev/team's package.json without going through its `exports`
 * map, which does not expose "./package.json" — resolving that subpath
 * throws ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the entry point instead and
 * walk up to the owning manifest.
 */
function readInstalledTeamManifest(): { version?: string } | null {
  let dir: string;
  try {
    dir = dirname(require.resolve("@aiyou-dev/team"));
  } catch {
    return null;
  }

  // Walk up from dist/... to the package root.
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf-8"));
        if (pkg?.name === "@aiyou-dev/team") return pkg;
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Width of the vector collection as actually configured on disk. */
function memoryDimensions(): number | null {
  try {
    return loadConfig().dimensions;
  } catch {
    return null;
  }
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
          // The collection's real width, not a constant — this advertised 384
          // while `init` created the store at a different size.
          dimensions: memoryDimensions(),
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
