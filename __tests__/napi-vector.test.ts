/**
 * VectorDB NAPI tests — vitest.
 * Covers: create, insert, search, delete, count, stats.
 */

import { describe, it, expect } from "vitest";
import { inMemoryVectorDB } from "../src/napi/index.js";

describe("VectorDB (NAPI)", () => {
  it("creates an in-memory database", () => {
    const db = inMemoryVectorDB(3);
    expect(db).toBeDefined();
    expect(db.count()).toBe(0);
  });

  it("inserts vectors and returns ids", () => {
    const db = inMemoryVectorDB(3);
    const id1 = db.insert([1.0, 0.0, 0.0], "vec-x");
    const id2 = db.insert([0.0, 1.0, 0.0], "vec-y");
    expect(id1).toBe("vec-x");
    expect(id2).toBe("vec-y");
    expect(db.count()).toBe(2);
  });

  it("searches nearest neighbors", () => {
    const db = inMemoryVectorDB(3);
    db.insert([1.0, 0.0, 0.0], "vec-x");
    db.insert([0.0, 1.0, 0.0], "vec-y");
    db.insert([0.0, 0.0, 1.0], "vec-z");
    db.insert([0.9, 0.1, 0.0], "vec-near-x");

    const results = db.search([1.0, 0.0, 0.0], 2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("vec-x");
    expect(ids).toContain("vec-near-x");
  });

  it("returns scores ordered by similarity", () => {
    const db = inMemoryVectorDB(3);
    db.insert([1.0, 0.0, 0.0], "exact");
    db.insert([0.5, 0.5, 0.0], "partial");
    db.insert([0.0, 0.0, 1.0], "orthogonal");

    const results = db.search([1.0, 0.0, 0.0], 3);
    // Lower score = closer (cosine distance)
    expect(results[0].id).toBe("exact");
    expect(results[0].score).toBeLessThan(results[1].score);
  });

  it("deletes a vector", () => {
    const db = inMemoryVectorDB(3);
    db.insert([1.0, 0.0, 0.0], "vec-x");
    db.insert([0.0, 1.0, 0.0], "vec-y");
    expect(db.count()).toBe(2);

    const deleted = db.delete("vec-x");
    expect(deleted).toBe(true);
    expect(db.count()).toBe(1);
  });

  it("delete returns false for non-existent id", () => {
    const db = inMemoryVectorDB(3);
    expect(db.delete("nonexistent")).toBe(false);
  });

  it("returns correct stats", () => {
    const db = inMemoryVectorDB(4);
    db.insert([1, 2, 3, 4], "a");
    db.insert([5, 6, 7, 8], "b");

    const stats = db.stats();
    expect(stats.dimensions).toBe(4);
    expect(stats.total_vectors).toBe(2);
    expect(stats.metric).toBe("Cosine");
    expect(stats.index_type).toBe("hnsw");
    expect(stats.storage_bytes).toBeGreaterThan(0);
  });

  it("handles high-dimensional vectors", () => {
    const dim = 128;
    const db = inMemoryVectorDB(dim);
    const vec = Array.from({ length: dim }, (_, i) => Math.sin(i));
    db.insert(vec, "high-dim");
    expect(db.count()).toBe(1);

    const results = db.search(vec, 1);
    expect(results[0].id).toBe("high-dim");
  });
});
