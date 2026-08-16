/**
 * Graph tools — knowledge graph exposed via MCP.
 *
 * Three tools:
 *   - graph_bootstrap: seed a graph with project/agent/file nodes (idempotent)
 *   - graph_stats:     return node/edge counts
 *   - graph_neighbors: return neighbors of a node
 *
 * The underlying NAPI binding (`GraphHandle` in
 * crates/aiyoucli-napi/src/graph.rs) is the source of truth. It's opened
 * redb-backed at `.aiyoucli/graph.redb`, the same convention memory-tools.ts
 * uses for `vectors.redb` — so the graph survives process restarts instead
 * of being rebuilt from scratch on every `aiyoucli init`. We still keep a
 * module-level singleton so repeated tool calls in the same process share
 * one open handle rather than reopening the file each time.
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { MCPTool, MCPToolResult } from "../../types.js";
import { openKnowledgeGraph, type GraphHandle } from "../../napi/index.js";

function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}
function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}

// ── Singleton graph handle ────────────────────────────────────────

/**
 * Resolved lazily (not as a module-level constant) so it reflects
 * `process.cwd()` at the time the graph is actually opened, not at module
 * import time — matters for tests, which `chdir` into a fresh tmp dir per
 * test and rely on `resetGraph()` + the next `getGraph()` call picking up
 * the new cwd's own `.aiyoucli/graph.redb`.
 */
function defaultGraphPath(): string {
  return join(process.cwd(), ".aiyoucli", "graph.redb");
}

let graph: GraphHandle | null = null;
export function getGraph(): GraphHandle {
  if (!graph) graph = openKnowledgeGraph(defaultGraphPath());
  return graph;
}

/**
 * Reset the graph singleton. Exported for testing only.
 * @internal
 */
export function resetGraph(): void {
  graph = null;
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Idempotently add a node: looks the (kind, name) pair up in the persisted
 * graph via `getNodeByName` and returns its id if found, otherwise creates
 * it. Note `getNodeByName` is keyed by name only (not name+kind) on the
 * Rust side — fine for today's dataset, where names are unique across
 * kinds, but a caller mixing kinds with the same name would collide.
 */
export function upsertNode(kind: string, name: string): number {
  const existing = getGraph().getNodeByName(name);
  if (existing) return existing.id;
  return getGraph().addNode(kind, name);
}

/**
 * Idempotently add an edge: returns the existing edge id if `from -> to`
 * of this `kind` already exists, otherwise creates it. This is what makes
 * graph_bootstrap idempotent across process restarts, not just within one.
 */
export function upsertEdge(from: number, to: number, kind: string, weight: number): number {
  const existing = getGraph().findEdge(from, to, kind);
  if (existing !== null) return existing;
  return getGraph().addEdge(from, to, kind, weight);
}

/**
 * The `project` node name graph_bootstrap derives from a project root —
 * exported so graph-route-hint.ts can find the same node without
 * recomputing the convention.
 */
export function projectNodeName(cwd: string): string {
  return cwd.split("/").pop() ?? "project";
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
      const projectId = upsertNode("project", projectNodeName(cwd));

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
