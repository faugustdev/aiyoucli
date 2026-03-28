/**
 * SONA + Attention + KnowledgeGraph NAPI tests — vitest.
 */

import { describe, it, expect } from "vitest";
import {
  createSonaEngine,
  createAttentionRouter,
  createKnowledgeGraph,
} from "../src/napi/index.js";

// ── SONA Engine ──────────────────────────────────────────

describe("SONA Engine (NAPI)", () => {
  it("creates an engine", () => {
    const sona = createSonaEngine();
    expect(sona).toBeDefined();
  });

  it("submits observation and updates stats", () => {
    const sona = createSonaEngine();
    const emb = Array.from({ length: 128 }, () => Math.random());
    sona.submitObservation(emb, 0.8, "commit");

    const s = sona.stats();
    expect(s.signals_processed).toBe(1);
    expect(s.trajectories_buffered).toBe(1);
    expect(s.enabled).toBe(true);
  });

  it("transforms embedding via MicroLoRA", () => {
    const sona = createSonaEngine();
    const input = Array.from({ length: 128 }, () => 1.0);
    const output = sona.transformEmbedding(input);

    expect(output).toHaveLength(128);
    const changed = output.some((v, i) => Math.abs(v - input[i]) > 1e-10);
    expect(changed).toBe(true);
  });

  it("force learn processes buffered trajectories", () => {
    const sona = createSonaEngine();
    for (let i = 0; i < 5; i++) {
      const emb = Array.from({ length: 128 }, () => Math.random());
      sona.submitObservation(emb, 0.7);
    }

    const processed = sona.forceLearn();
    expect(processed).toBe(5);
    expect(sona.stats().trajectories_buffered).toBe(0);
  });

  it("respects enabled/disabled state", () => {
    const sona = createSonaEngine();
    expect(sona.stats().enabled).toBe(true);

    sona.setEnabled(false);
    expect(sona.stats().enabled).toBe(false);

    sona.setEnabled(true);
    expect(sona.stats().enabled).toBe(true);
  });
});

// ── Attention Router ─────────────────────────────────────

describe("Attention Router (NAPI)", () => {
  it("creates a router", () => {
    const attn = createAttentionRouter(4);
    expect(attn).toBeDefined();
  });

  it("computes attention with auto hint", () => {
    const attn = createAttentionRouter(4);
    const query = [1, 0, 0, 0];
    const keys = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const values = [10, 0, 0, 0, 0, 10, 0, 0, 0, 0, 10, 0];

    const result = attn.compute(query, keys, values, "auto");
    expect(result).toHaveLength(4);
    expect(result[0]).toBeGreaterThan(result[1]);
  });

  it("computes attention with broad hint", () => {
    const attn = createAttentionRouter(3);
    const query = [1, 0, 0];
    const keys = [1, 0, 0, 0, 1, 0];
    const values = [5, 0, 0, 0, 5, 0];

    const result = attn.compute(query, keys, values, "broad");
    expect(result).toHaveLength(3);
  });

  it("computes attention with flat hint", () => {
    const attn = createAttentionRouter(2);
    const query = [1, 0];
    const keys = [1, 0, 0, 1];
    const values = [10, 0, 0, 10];

    const result = attn.compute(query, keys, values, "flat");
    expect(result).toHaveLength(2);
  });
});

// ── Knowledge Graph ──────────────────────────────────────

describe("Knowledge Graph (NAPI)", () => {
  it("creates a graph", () => {
    const g = createKnowledgeGraph();
    expect(g).toBeDefined();
  });

  it("adds nodes and edges", () => {
    const g = createKnowledgeGraph();
    const rust = g.addNode("technology", "Rust");
    const tokio = g.addNode("technology", "Tokio");
    const eid = g.addEdge(rust, tokio, "used_in", 0.9);

    expect(rust).toBeGreaterThan(0);
    expect(eid).toBeGreaterThan(0);

    const s = g.stats();
    expect(s.nodes).toBe(2);
    expect(s.edges).toBe(1);
  });

  it("retrieves a node by id", () => {
    const g = createKnowledgeGraph();
    const id = g.addNode("project", "aiyoucli");
    const node = g.getNode(id);

    expect(node).not.toBeNull();
    expect(node!.name).toBe("aiyoucli");
    expect(node!.kind.toLowerCase()).toBe("project");
  });

  it("returns null for non-existent node", () => {
    const g = createKnowledgeGraph();
    expect(g.getNode(9999)).toBeNull();
  });

  it("finds neighbors", () => {
    const g = createKnowledgeGraph();
    const a = g.addNode("concept", "A");
    const b = g.addNode("concept", "B");
    const c = g.addNode("concept", "C");
    g.addEdge(a, b, "relates_to", 1.0);
    g.addEdge(a, c, "depends_on", 0.5);

    const neighbors = g.neighbors(a, "outgoing");
    expect(neighbors).toHaveLength(2);
  });

  it("performs k-hop BFS", () => {
    const g = createKnowledgeGraph();
    const a = g.addNode("concept", "A");
    const b = g.addNode("concept", "B");
    const c = g.addNode("concept", "C");
    g.addEdge(a, b, "relates_to", 1.0);
    g.addEdge(b, c, "relates_to", 1.0);

    const hop1 = g.kHop(a, 1);
    expect(hop1).toContain(a);
    expect(hop1).toContain(b);
    expect(hop1).not.toContain(c);

    const hop2 = g.kHop(a, 2);
    expect(hop2).toContain(c);
  });

  it("removes node and cascades edges", () => {
    const g = createKnowledgeGraph();
    const a = g.addNode("concept", "A");
    const b = g.addNode("concept", "B");
    g.addEdge(a, b, "relates_to", 1.0);

    expect(g.stats().edges).toBe(1);
    g.removeNode(a);
    expect(g.stats().nodes).toBe(1);
    expect(g.stats().edges).toBe(0);
  });
});
