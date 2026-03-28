/**
 * Semantic router NAPI tests — vitest.
 */

import { describe, it, expect } from "vitest";
import { createRoutingEngine } from "../src/napi/index.js";

describe("Semantic Router (NAPI)", () => {
  it("routes coding task via semantics", () => {
    const r = createRoutingEngine();
    const result = r.semanticRoute("implement a login page with form validation");
    expect(result.route).toBe("coder");
    expect(result.similarity).toBeGreaterThan(0);
    expect(result.scores).toHaveLength(8);
  });

  it("routes security task via semantics", () => {
    const r = createRoutingEngine();
    const result = r.semanticRoute("audit security vulnerabilities in payment system");
    expect(result.route).toBe("security");
  });

  it("routes test task via semantics", () => {
    const r = createRoutingEngine();
    const result = r.semanticRoute("write unit tests for the auth module");
    expect(result.route).toBe("tester");
  });

  it("routes architecture task via semantics", () => {
    const r = createRoutingEngine();
    const result = r.semanticRoute("design the microservice architecture");
    expect(result.route).toBe("architect");
  });

  it("returns scores sorted descending", () => {
    const r = createRoutingEngine();
    const result = r.semanticRoute("fix the null pointer crash");
    for (let i = 1; i < result.scores.length; i++) {
      expect(result.scores[i - 1].score).toBeGreaterThanOrEqual(result.scores[i].score);
    }
  });

  it("combined route uses semantic when Q-table is empty", () => {
    const r = createRoutingEngine();
    const result = r.route("audit security vulnerabilities");
    // Method should be "semantic" since no Q-table history
    expect(result.method).toBe("semantic");
    expect(result.route).toBe("security");
  });

  it("combined route uses Q-learning after training", () => {
    const r = createRoutingEngine();
    // Train the Q-table
    for (let i = 0; i < 10; i++) {
      r.route("implement login");
      r.recordReward("implement login", "coder", 1.0);
    }
    const result = r.route("implement login");
    // Should now use q-learning or explore, not semantic
    expect(["q-learning", "explore"]).toContain(result.method);
  });

  it("embed returns a vector", () => {
    const r = createRoutingEngine();
    const vec = r.embed("implement login page");
    expect(vec.length).toBe(128); // default dimensions
    // Should be L2 normalized
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 1);
  });

  it("similar texts produce similar embeddings", () => {
    const r = createRoutingEngine();
    const a = r.embed("implement user login page");
    const b = r.embed("implement user authentication page");
    const c = r.embed("audit security vulnerabilities");

    const simAB = cosine(a, b);
    const simAC = cosine(a, c);
    expect(simAB).toBeGreaterThan(simAC);
  });

  it("stats includes embedding dimensions", () => {
    const r = createRoutingEngine();
    const stats = r.stats();
    expect(stats.embedding_dimensions).toBe(128);
  });
});

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (normA * normB);
}
