/**
 * Memory tools — vector store/search/list via NAPI (aiyouvector-core).
 * Persistent by default: stores vectors at .aiyoucli/vectors/ and config at .aiyoucli/memory-config.json.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { inMemoryVectorDB, openVectorDB, type VectorHandle } from "../../napi/index.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const AIYOUCLI_DIR = join(process.cwd(), ".aiyoucli");
const CONFIG_PATH = join(AIYOUCLI_DIR, "memory-config.json");
const DEFAULT_VECTORS_PATH = join(AIYOUCLI_DIR, "vectors.redb");

interface MemoryConfig {
  path: string | null;
  dimensions: number;
  hnsw: boolean;
}

function loadConfig(): MemoryConfig {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch { /* fall through */ }
  }
  return { path: DEFAULT_VECTORS_PATH, dimensions: 384, hnsw: true };
}

function saveConfig(config: MemoryConfig): void {
  mkdirSync(AIYOUCLI_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

let db: VectorHandle | null = null;

function getDB(): VectorHandle {
  if (!db) {
    const config = loadConfig();
    if (config.path) {
      mkdirSync(AIYOUCLI_DIR, { recursive: true });
      db = openVectorDB(config.path, config.dimensions);
    } else {
      db = inMemoryVectorDB(config.dimensions, config.hnsw);
    }
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
    description: "Initialize the vector memory database. Persistent by default (stored in .aiyoucli/vectors/).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Storage path (default: .aiyoucli/vectors/). Use 'memory' for in-memory only." },
        dimensions: { type: "number", description: "Vector dimensions (default: 384)" },
        enable_hnsw: { type: "boolean", description: "Enable HNSW index (default: true)" },
      },
    },
    handler: async (input) => {
      const rawPath = input.path as string | undefined;
      const dims = (input.dimensions as number) ?? 384;
      const hnsw = (input.enable_hnsw as boolean) ?? true;

      const isMemoryOnly = rawPath === "memory";
      const storagePath = isMemoryOnly ? null : (rawPath ?? DEFAULT_VECTORS_PATH);

      const config: MemoryConfig = { path: storagePath, dimensions: dims, hnsw };
      saveConfig(config);

      // Reset singleton so next getDB() picks up new config
      db = null;

      const indexType = hnsw ? "HNSW" : "flat";
      const location = isMemoryOnly ? "in-memory" : storagePath;
      return textResult(`Memory initialized (${location}, ${dims}d, ${indexType})`);
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
