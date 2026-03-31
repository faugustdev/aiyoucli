/**
 * Performance tools — benchmarking and profiling.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { inMemoryVectorDB } from "../../napi/index.js";

function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const performanceTools: MCPTool[] = [
  {
    name: "perf_benchmark",
    description: "Run vector search benchmark — measures NAPI performance",
    inputSchema: {
      type: "object",
      properties: {
        vectors: { type: "number", description: "Number of vectors to insert (default: 1000)" },
        dimensions: { type: "number", description: "Vector dimensions (default: 128)" },
        queries: { type: "number", description: "Number of search queries (default: 100)" },
      },
    },
    handler: async (input) => {
      const numVectors = Math.min(Math.max((input.vectors as number) || 1000, 1), 100_000);
      const dims = Math.min(Math.max((input.dimensions as number) || 128, 1), 4096);
      const numQueries = Math.min(Math.max((input.queries as number) || 100, 1), 10_000);

      const db = inMemoryVectorDB(dims);

      // Insert benchmark
      const insertStart = performance.now();
      for (let i = 0; i < numVectors; i++) {
        const vec = Array.from({ length: dims }, () => Math.random());
        db.insert(vec, `v${i}`);
      }
      const insertMs = performance.now() - insertStart;

      // Search benchmark
      const searchStart = performance.now();
      for (let i = 0; i < numQueries; i++) {
        const query = Array.from({ length: dims }, () => Math.random());
        db.search(query, 5);
      }
      const searchMs = performance.now() - searchStart;

      return json({
        insert: {
          vectors: numVectors,
          total_ms: Math.round(insertMs * 100) / 100,
          per_vector_us: Math.round((insertMs / numVectors) * 1000 * 100) / 100,
        },
        search: {
          queries: numQueries,
          total_ms: Math.round(searchMs * 100) / 100,
          per_query_us: Math.round((searchMs / numQueries) * 1000 * 100) / 100,
        },
        dimensions: dims,
        index_type: "flat",
      });
    },
  },
];
