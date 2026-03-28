/**
 * Built-in benchmark definitions for aiyoucli.
 *
 * These benchmarks can be run via `aiyoucli performance benchmark`
 * and compared against other systems (claude-flow, etc).
 */

import { BenchmarkSuite } from "./benchmark.js";
import {
  inMemoryVectorDB,
  createSonaEngine,
  createAttentionRouter,
  createKnowledgeGraph,
  createRoutingEngine,
  createAnalysisEngine,
} from "../napi/index.js";

export function createAiyoucliSuite(): BenchmarkSuite {
  const suite = new BenchmarkSuite("aiyoucli", "0.1.0");

  // ── Vector operations ──────────────────────────────────

  suite.add("vector_insert_3d", "vector", () => {
    const db = inMemoryVectorDB(3);
    for (let i = 0; i < 100; i++) {
      db.insert([Math.random(), Math.random(), Math.random()]);
    }
  }, { iterations: 50, warmup: 5 });

  suite.add("vector_insert_128d", "vector", () => {
    const db = inMemoryVectorDB(128);
    for (let i = 0; i < 100; i++) {
      db.insert(Array.from({ length: 128 }, () => Math.random()));
    }
  }, { iterations: 50, warmup: 5 });

  suite.add("vector_search_100vecs", "vector", () => {
    const db = inMemoryVectorDB(128);
    for (let i = 0; i < 100; i++) {
      db.insert(Array.from({ length: 128 }, () => Math.random()));
    }
    const query = Array.from({ length: 128 }, () => Math.random());
    for (let i = 0; i < 10; i++) {
      db.search(query, 5);
    }
  }, { iterations: 30, warmup: 3 });

  suite.add("vector_search_1000vecs", "vector", () => {
    const db = inMemoryVectorDB(128);
    for (let i = 0; i < 1000; i++) {
      db.insert(Array.from({ length: 128 }, () => Math.random()));
    }
    const query = Array.from({ length: 128 }, () => Math.random());
    for (let i = 0; i < 10; i++) {
      db.search(query, 10);
    }
  }, { iterations: 10, warmup: 2 });

  // ── SONA learning ──────────────────────────────────────

  suite.add("sona_observe", "intelligence", () => {
    const sona = createSonaEngine();
    for (let i = 0; i < 50; i++) {
      const emb = Array.from({ length: 128 }, () => Math.random());
      sona.submitObservation(emb, Math.random(), "commit");
    }
  }, { iterations: 50, warmup: 5 });

  suite.add("sona_transform", "intelligence", () => {
    const sona = createSonaEngine();
    const input = Array.from({ length: 128 }, () => 1.0);
    for (let i = 0; i < 100; i++) {
      sona.transformEmbedding(input);
    }
  }, { iterations: 50, warmup: 5 });

  suite.add("sona_learn_cycle", "intelligence", () => {
    const sona = createSonaEngine();
    for (let i = 0; i < 20; i++) {
      const emb = Array.from({ length: 128 }, () => Math.random());
      sona.submitObservation(emb, Math.random());
    }
    sona.forceLearn();
  }, { iterations: 30, warmup: 3 });

  // ── Attention ──────────────────────────────────────────

  suite.add("attention_compute_4d", "intelligence", () => {
    const attn = createAttentionRouter(4);
    const q = [1, 0, 0, 0];
    const k = Array.from({ length: 40 }, () => Math.random()); // 10 keys
    const v = Array.from({ length: 40 }, () => Math.random());
    for (let i = 0; i < 100; i++) {
      attn.compute(q, k, v, "auto");
    }
  }, { iterations: 50, warmup: 5 });

  // ── Knowledge Graph ────────────────────────────────────

  suite.add("graph_build_100nodes", "graph", () => {
    const g = createKnowledgeGraph();
    const ids: number[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(g.addNode("concept", `node-${i}`));
    }
    for (let i = 0; i < 99; i++) {
      g.addEdge(ids[i], ids[i + 1], "next", 1.0);
    }
  }, { iterations: 30, warmup: 3 });

  suite.add("graph_khop_100nodes", "graph", () => {
    const g = createKnowledgeGraph();
    const ids: number[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(g.addNode("concept", `node-${i}`));
    }
    for (let i = 0; i < 99; i++) {
      g.addEdge(ids[i], ids[i + 1], "next", 1.0);
    }
    for (let i = 0; i < 10; i++) {
      g.kHop(ids[0], 3);
    }
  }, { iterations: 20, warmup: 2 });

  // ── Routing ────────────────────────────────────────────

  suite.add("routing_route", "routing", () => {
    const r = createRoutingEngine();
    const tasks = [
      "implement login page",
      "write unit tests for auth",
      "audit security vulnerabilities",
      "design microservice architecture",
      "fix null pointer bug in parser",
      "update API documentation",
      "refactor database layer",
      "deploy to production",
    ];
    for (const task of tasks) {
      r.route(task);
    }
  }, { iterations: 100, warmup: 10 });

  suite.add("routing_model_tier", "routing", () => {
    const r = createRoutingEngine();
    const tasks = [
      "fix typo",
      "implement user auth",
      "architect distributed system with security audit",
    ];
    for (const task of tasks) {
      r.selectModelTier(task);
    }
  }, { iterations: 100, warmup: 10 });

  suite.add("routing_learn_cycle", "routing", () => {
    const r = createRoutingEngine();
    for (let i = 0; i < 50; i++) {
      const result = r.route("implement feature");
      r.recordReward("implement feature", result.route, Math.random());
    }
  }, { iterations: 30, warmup: 3 });

  // ── Analysis ───────────────────────────────────────────

  suite.add("analysis_complexity", "analysis", () => {
    const a = createAnalysisEngine();
    const code = `
function processOrder(order) {
  if (order.items.length === 0) throw new Error("empty");
  for (const item of order.items) {
    if (item.quantity > 0) {
      if (item.price > 100) {
        if (order.user.isPremium) {
          item.discount = calc(item);
        }
      }
    }
  }
  return order;
}`;
    for (let i = 0; i < 100; i++) {
      a.complexityScore(code);
    }
  }, { iterations: 50, warmup: 5 });

  suite.add("analysis_classify_commit", "analysis", () => {
    const a = createAnalysisEngine();
    const msgs = [
      "fix: null pointer", "feat: new page", "refactor: cleanup",
      "docs: readme", "test: auth tests", "chore: deps update",
      "style: formatting", "perf: optimize query",
    ];
    for (let i = 0; i < 100; i++) {
      for (const m of msgs) a.classifyCommit(m);
    }
  }, { iterations: 50, warmup: 5 });

  return suite;
}
