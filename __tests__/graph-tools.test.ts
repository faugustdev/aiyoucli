/**
 * Graph tools tests — vitest.
 *
 * Tests cover:
 *   - graph_bootstrap in minimal mode: project + 8 agents
 *   - graph_bootstrap in full mode: + files
 *   - graph_bootstrap idempotency
 *   - graph_stats: returns correct counts
 *   - graph_neighbors: outgoing direction
 *   - graph_neighbors: error on missing node
 *   - 3 tools are registered
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { graphTools, resetGraph } from "../src/mcp/tools/graph-tools.js";

let tmpDir: string;
const originalCwd = process.cwd();

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "aiyoucli-graph-"));
  process.chdir(tmpDir);
  // Reset the graph singleton between tests
  resetGraph();
  // Create a minimal project layout
  writeFileSync(join(tmpDir, "AGENTS.md"), "# test");
  writeFileSync(
    join(tmpDir, "package.json"),
    JSON.stringify({ name: "test", scripts: { test: "echo" } })
  );
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
});

function findTool(name: string) {
  const tool = graphTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

function parseJson(result: { content: Array<{ text?: string }> }): unknown {
  return JSON.parse(result.content[0]?.text ?? "null");
}
function parseText(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("graph-tools registration", () => {
  it("registers exactly 3 tools", () => {
    expect(graphTools).toHaveLength(3);
  });

  it("registers the expected tool names", () => {
    const names = graphTools.map((t) => t.name).sort();
    expect(names).toEqual(["graph_bootstrap", "graph_neighbors", "graph_stats"]);
  });
});

describe("graph_bootstrap", () => {
  it("minimal mode creates project + 8 agents", async () => {
    const tool = findTool("graph_bootstrap");
    const result = await tool.handler({ mode: "minimal", cwd: tmpDir });
    const data = parseJson(result) as {
      mode: string;
      project_id: number;
      agents_added: number;
      files_added: number;
      total_nodes: number;
      total_edges: number;
    };

    expect(data.mode).toBe("minimal");
    expect(data.agents_added).toBe(8);
    expect(data.files_added).toBe(0);
    // project + AGENTS.md + package.json + 8 agents = 11 nodes
    expect(data.total_nodes).toBe(11);
  });

  it("links AGENTS.md and package.json to project via used_in edges", async () => {
    const tool = findTool("graph_bootstrap");
    const bootstrapResult = await tool.handler({ mode: "minimal", cwd: tmpDir });
    const bootstrapData = parseJson(bootstrapResult) as { project_id: number };

    // Use the project_id returned by bootstrap
    const neighborsTool = findTool("graph_neighbors");
    const result = await neighborsTool.handler({ nodeId: bootstrapData.project_id, direction: "outgoing" });
    const data = parseJson(result) as { neighbors: Array<{ edge_kind: string; node_kind: string }> };

    const usedIn = data.neighbors.filter((n) => n.edge_kind === "UsedIn");
    expect(usedIn.length).toBeGreaterThanOrEqual(2); // AGENTS.md + package.json
    expect(usedIn.some((n) => n.node_kind === "File")).toBe(true);
  });

  it("links 8 agents to project via works_on edges", async () => {
    const tool = findTool("graph_bootstrap");
    const bootstrapResult = await tool.handler({ mode: "minimal", cwd: tmpDir });
    const bootstrapData = parseJson(bootstrapResult) as { project_id: number };

    const neighborsTool = findTool("graph_neighbors");
    const result = await neighborsTool.handler({ nodeId: bootstrapData.project_id, direction: "outgoing" });
    const data = parseJson(result) as { neighbors: Array<{ edge_kind: string; node_kind: string }> };

    const worksOn = data.neighbors.filter((n) => n.edge_kind === "WorksOn");
    expect(worksOn).toHaveLength(8);
    expect(worksOn.every((n) => n.node_kind === "Agent")).toBe(true);
  });

  it("full mode includes files", async () => {
    // Create some source files
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "index.ts"), "");
    writeFileSync(join(tmpDir, "src", "util.ts"), "");
    writeFileSync(join(tmpDir, "src", "data.json"), "");

    const tool = findTool("graph_bootstrap");
    const result = await tool.handler({
      mode: "full",
      cwd: tmpDir,
      maxFiles: 100,
      extensions: ["ts", "tsx", "js"],
    });
    const data = parseJson(result) as { files_added: number; total_nodes: number };

    expect(data.files_added).toBe(2); // index.ts + util.ts; data.json excluded
    // 11 (minimal) + 2 (files) = 13
    expect(data.total_nodes).toBe(13);
  });

  it("is idempotent: re-running does not double-add nodes", async () => {
    const tool = findTool("graph_bootstrap");
    const r1 = await tool.handler({ mode: "minimal", cwd: tmpDir });
    const d1 = parseJson(r1) as { total_nodes: number };
    const r2 = await tool.handler({ mode: "minimal", cwd: tmpDir });
    const d2 = parseJson(r2) as { total_nodes: number };

    expect(d2.total_nodes).toBe(d1.total_nodes);
  });

  it("is idempotent across a simulated process restart (graph reopened from disk)", async () => {
    const tool = findTool("graph_bootstrap");
    const r1 = await tool.handler({ mode: "minimal", cwd: tmpDir });
    const d1 = parseJson(r1) as { total_nodes: number; total_edges: number };

    // Drop the in-process singleton without touching the file on disk —
    // the next getGraph() call reopens .aiyoucli/graph.redb from scratch,
    // standing in for a fresh process picking the persisted graph back up.
    resetGraph();

    const r2 = await tool.handler({ mode: "minimal", cwd: tmpDir });
    const d2 = parseJson(r2) as { total_nodes: number; total_edges: number };

    expect(d2.total_nodes).toBe(d1.total_nodes);
    expect(d2.total_edges).toBe(d1.total_edges);
  });

  it("skips heavy directories like node_modules", async () => {
    mkdirSync(join(tmpDir, "node_modules", "foo"), { recursive: true });
    writeFileSync(join(tmpDir, "node_modules", "foo", "index.ts"), "");
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "app.ts"), "");

    const tool = findTool("graph_bootstrap");
    const result = await tool.handler({
      mode: "full",
      cwd: tmpDir,
      maxFiles: 100,
      extensions: ["ts"],
    });
    const data = parseJson(result) as { files_added: number };

    expect(data.files_added).toBe(1); // only src/app.ts
  });

  it("respects maxFiles cap", async () => {
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    for (let i = 0; i < 10; i++) {
      writeFileSync(join(tmpDir, "src", `f${i}.ts`), "");
    }

    const tool = findTool("graph_bootstrap");
    const result = await tool.handler({
      mode: "full",
      cwd: tmpDir,
      maxFiles: 3,
      extensions: ["ts"],
    });
    const data = parseJson(result) as { files_added: number };
    expect(data.files_added).toBe(3);
  });

  it("uses process.cwd() when no cwd is provided", async () => {
    const tool = findTool("graph_bootstrap");
    const result = await tool.handler({ mode: "minimal" });
    const data = parseJson(result) as { mode: string; total_nodes: number };
    // Should not throw; just verify it ran
    expect(data.mode).toBe("minimal");
    expect(data.total_nodes).toBeGreaterThan(0);
  });
});

describe("graph_stats", () => {
  it("returns nodes/edges", async () => {
    const bootTool = findTool("graph_bootstrap");
    await bootTool.handler({ mode: "minimal", cwd: tmpDir });

    const statsTool = findTool("graph_stats");
    const result = await statsTool.handler({});
    const data = parseJson(result) as { nodes: number; edges: number };

    expect(data.nodes).toBeGreaterThan(0);
    expect(data.edges).toBeGreaterThan(0);
  });

  it("returns zero counts on a fresh graph (each test gets its own tmp cwd, so its own graph.redb)", async () => {
    const statsTool = findTool("graph_stats");
    const result = await statsTool.handler({});
    const data = parseJson(result) as { nodes: number; edges: number };
    expect(data.nodes).toBe(0);
    expect(data.edges).toBe(0);
  });
});

describe("graph_neighbors", () => {
  it("returns neighbors for an existing node", async () => {
    const bootTool = findTool("graph_bootstrap");
    const bootstrapResult = await bootTool.handler({ mode: "minimal", cwd: tmpDir });
    const bootstrapData = parseJson(bootstrapResult) as { project_id: number };

    const neighborsTool = findTool("graph_neighbors");
    const result = await neighborsTool.handler({ nodeId: bootstrapData.project_id, direction: "outgoing" });
    const data = parseJson(result) as { neighbor_count: number; neighbors: unknown[] };

    expect(data.neighbor_count).toBeGreaterThan(0);
    expect(data.neighbors.length).toBeGreaterThan(0);
  });

  it("returns 'not found' for a non-existent node", async () => {
    const bootTool = findTool("graph_bootstrap");
    await bootTool.handler({ mode: "minimal", cwd: tmpDir });

    const neighborsTool = findTool("graph_neighbors");
    const result = await neighborsTool.handler({ nodeId: 99999 });
    const text = parseText(result);
    expect(text).toMatch(/not found/i);
  });

  it("defaults direction to outgoing", async () => {
    const bootTool = findTool("graph_bootstrap");
    const bootstrapResult = await bootTool.handler({ mode: "minimal", cwd: tmpDir });
    const bootstrapData = parseJson(bootstrapResult) as { project_id: number };

    const neighborsTool = findTool("graph_neighbors");
    const result = await neighborsTool.handler({ nodeId: bootstrapData.project_id });
    const data = parseJson(result) as { direction: string };
    expect(data.direction).toBe("outgoing");
  });
});
