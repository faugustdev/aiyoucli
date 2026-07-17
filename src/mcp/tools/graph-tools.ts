/**
 * Graph tools — knowledge graph exposed via MCP.
 *
 * Three tools:
 *   - graph_bootstrap: seed a graph with project/agent/file nodes (idempotent)
 *   - graph_stats:     return node/edge counts
 *   - graph_neighbors: return neighbors of a node
 *
 * The graph is in-memory per process. The underlying NAPI binding
 * (`GraphHandle` in crates/aiyoucli-napi/src/graph.rs) is the source of
 * truth. We keep a module-level singleton so repeated tool calls in the
 * same process share the same graph instance.
 *
 * Persistence is intentionally NOT implemented in PR #2. The graph is
 * rebuilt by `aiyoucli init` (via `graph_bootstrap`) on every cold start.
 * Future PRs can add a redb-backed persistence layer behind the same
 * GraphHandle API.
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { MCPTool, MCPToolResult } from "../../types.js";
import { createKnowledgeGraph, type GraphHandle } from "../../napi/index.js";

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}
function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}

// ── Singleton graph handle ────────────────────────────────────────

let graph: GraphHandle | null = null;
function getGraph(): GraphHandle {
  if (!graph) graph = createKnowledgeGraph();
  return graph;
}

/**
 * Reset the graph singleton. Exported for testing only.
 * @internal
 */
export function resetGraph(): void {
  graph = null;
  nodeIndex.clear();
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Idempotently add a node. Returns the existing node id if the
 * (kind, name) pair is already present in the graph, otherwise
 * creates it and returns the new id.
 *
 * We do a linear scan over the graph for idempotency. For a project
 * with <10k nodes this is fast enough; if it ever becomes a bottleneck
 * we can add a `find_by_kind_name` NAPI method.
 */
const nodeIndex: Map<string, number> = new Map();

function upsertNode(kind: string, name: string): number {
  const key = `${kind}:${name}`;
  const existing = nodeIndex.get(key);
  if (existing !== undefined) return existing;
  const id = getGraph().addNode(kind, name);
  nodeIndex.set(key, id);
  return id;
}

function upsertEdge(from: number, to: number, kind: string, weight: number): number {
  // addEdge may fail (e.g. duplicate); we just call it and let the NAPI
  // error bubble. Most projects have <1000 nodes so dupes are cheap.
  return getGraph().addEdge(from, to, kind, weight);
}

/**
 * Walk a directory and return file paths matching the given extensions,
 * excluding common heavy directories. The result is capped at `limit`
 * entries to keep graph_bootstrap bounded.
 */
function listProjectFiles(
  cwd: string,
  extensions: string[],
  limit: number,
  exclude: string[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const SKIP_DIRS = new Set([
    "node_modules", "target", "dist", "build", "out", ".next", ".turbo",
    "vendor", ".git", ".aiyoucli", "coverage", "__tests__", "node_modules",
  ]);

  function walk(dir: string, depth: number): void {
    if (out.length >= limit || depth > 6) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= limit) return;
      const full = join(dir, name);
      if (seen.has(full)) continue;
      seen.add(full);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(full, depth + 1);
      } else if (st.isFile()) {
        if (exclude.some((p) => full.includes(p))) continue;
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (extensions.includes(ext)) {
          out.push(full);
        }
      }
    }
  }

  walk(cwd, 0);
  return out;
}

// ── Tools ─────────────────────────────────────────────────────────

export const graphTools: MCPTool[] = [
  {
    name: "graph_bootstrap",
    description:
      "Seed the knowledge graph with a project skeleton: project root, " +
      "AGENTS.md, package.json (if present), top files by extension, and the " +
      "8 aiyou-team agents. Idempotent — re-running with the same inputs is a no-op.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["minimal", "full"],
          description: "minimal = project + agents only; full = also include top files (default minimal)",
        },
        maxFiles: {
          type: "number",
          description: "Maximum files to add in full mode (default 200, max 5000)",
        },
        extensions: {
          type: "array",
          items: { type: "string" },
          description: "File extensions to include in full mode (default: ts,tsx,js,jsx,py,rs,go,md)",
        },
        cwd: {
          type: "string",
          description: "Project root (default: process.cwd())",
        },
      },
    },
    handler: async (input) => {
      const mode = (input.mode as "minimal" | "full") ?? "minimal";
      const cwd = (input.cwd as string) ?? process.cwd();
      const maxFiles = Math.min(Math.max((input.maxFiles as number) ?? 200, 1), 5000);
      const extensions = (input.extensions as string[] | undefined) ?? [
        "ts", "tsx", "js", "jsx", "py", "rs", "go", "md",
      ];

      // 1. Project root
      const projectName = cwd.split("/").pop() ?? "project";
      const projectId = upsertNode("project", projectName);

      // 2. AGENTS.md if present
      let agentsMdId: number | null = null;
      if (existsSync(join(cwd, "AGENTS.md"))) {
        agentsMdId = upsertNode("file", "AGENTS.md");
        upsertEdge(projectId, agentsMdId, "used_in", 1.0);
      }

      // 3. package.json if present
      let pkgJsonId: number | null = null;
      if (existsSync(join(cwd, "package.json"))) {
        pkgJsonId = upsertNode("file", "package.json");
        upsertEdge(projectId, pkgJsonId, "used_in", 1.0);
      }

      // 4. aiyou-team agents (8)
      const agentNames = [
        "coding-leader", "coordination-leader", "coding-executor",
        "codebase-explorer", "web-researcher", "reviewer",
        "principal-advisor", "multimodal-looker",
      ];
      const agentIds: number[] = [];
      for (const a of agentNames) {
        const id = upsertNode("agent", a);
        agentIds.push(id);
        upsertEdge(projectId, id, "works_on", 0.8);
      }

      let filesAdded = 0;
      if (mode === "full") {
        const files = listProjectFiles(cwd, extensions, maxFiles, []);
        for (const f of files) {
          const rel = relative(cwd, f) || f;
          const id = upsertNode("file", rel);
          upsertEdge(projectId, id, "used_in", 0.4);
          filesAdded++;
        }
      }

      const stats = getGraph().stats();
      return json({
        mode,
        project_id: projectId,
        agents_added: agentNames.length,
        files_added: filesAdded,
        total_nodes: stats.nodes,
        total_edges: stats.edges,
      });
    },
  },
  {
    name: "graph_stats",
    description: "Return node/edge counts for the current knowledge graph.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const stats = getGraph().stats();
      return json({
        nodes: stats.nodes,
        edges: stats.edges,
        index_size: nodeIndex.size,
      });
    },
  },
  {
    name: "graph_neighbors",
    description:
      "Return neighbors of a node in the knowledge graph. " +
      "Use direction=outgoing (default), incoming, or both.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "number", description: "Node ID to query" },
        direction: {
          type: "string",
          enum: ["outgoing", "incoming", "both"],
          description: "Edge direction (default outgoing)",
        },
      },
      required: ["nodeId"],
    },
    handler: async (input) => {
      const id = input.nodeId as number;
      const direction = (input.direction as "outgoing" | "incoming" | "both") ?? "outgoing";
      const node = getGraph().getNode(id);
      if (!node) {
        return text(`Node ${id} not found`);
      }
      const neighbors = getGraph().neighbors(id, direction);
      return json({
        node,
        direction,
        neighbor_count: neighbors.length,
        neighbors,
      });
    },
  },
];
