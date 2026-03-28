/**
 * Memory tools — vector store/search/list via NAPI (aiyouvector-core).
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { inMemoryVectorDB, openVectorDB, type VectorHandle } from "../../napi/index.js";

let db: VectorHandle | null = null;

function getDB(): VectorHandle {
  if (!db) {
    // Default: in-memory with HNSW enabled
    db = inMemoryVectorDB(384, true);
  }
  return db;
}

function textResult(text: string): MCPToolResult {
  return { content: [{ type: "text", text }] };
}

function jsonResult(data: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export const memoryTools: MCPTool[] = [
  {
    name: "memory_init",
    description: "Initialize the vector memory database",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Storage path (omit for in-memory)" },
        dimensions: { type: "number", description: "Vector dimensions (default: 384)" },
        enable_hnsw: { type: "boolean", description: "Enable HNSW index (default: true)" },
      },
    },
    handler: async (input) => {
      const path = input.path as string | undefined;
      const dims = (input.dimensions as number) ?? 384;
      const hnsw = (input.enable_hnsw as boolean) ?? true;

      if (path) {
        db = openVectorDB(path, dims);
      } else {
        db = inMemoryVectorDB(dims, hnsw);
      }

      const indexType = hnsw ? "HNSW" : "flat";
      return textResult(`Memory initialized (${path ?? "in-memory"}, ${dims}d, ${indexType})`);
    },
  },

  {
    name: "memory_store",
    description: "Store a vector with optional ID and metadata",
    inputSchema: {
      type: "object",
      properties: {
        vector: { type: "array", items: { type: "number" }, description: "Vector to store" },
        id: { type: "string", description: "Optional ID" },
        metadata: { type: "object", description: "Optional metadata" },
      },
      required: ["vector"],
    },
    handler: async (input) => {
      const vector = input.vector as number[];
      const id = input.id as string | undefined;
      const metadata = input.metadata as Record<string, unknown> | undefined;

      const resultId = getDB().insert(vector, id, metadata ? JSON.parse(JSON.stringify(metadata)) : undefined);
      return textResult(`Stored vector: ${resultId}`);
    },
  },

  {
    name: "memory_search",
    description: "Search for similar vectors using HNSW index",
    inputSchema: {
      type: "object",
      properties: {
        vector: { type: "array", items: { type: "number" }, description: "Query vector" },
        k: { type: "number", description: "Number of results (default: 5)" },
      },
      required: ["vector"],
    },
    handler: async (input) => {
      const vector = input.vector as number[];
      const k = (input.k as number) ?? 5;

      const results = getDB().search(vector, k);
      return jsonResult(results);
    },
  },

  {
    name: "memory_count",
    description: "Get the number of vectors in memory",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      return textResult(`Vectors: ${getDB().count()}`);
    },
  },

  {
    name: "memory_stats",
    description: "Get memory database statistics",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      return jsonResult(getDB().stats());
    },
  },

  {
    name: "memory_delete",
    description: "Delete a vector by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Vector ID to delete" },
      },
      required: ["id"],
    },
    handler: async (input) => {
      const id = input.id as string;
      const deleted = getDB().delete(id);
      return textResult(deleted ? `Deleted: ${id}` : `Not found: ${id}`);
    },
  },
];
