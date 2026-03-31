/**
 * NAPI binary loader for aiyoucli-napi Rust crate.
 *
 * Loads the platform-specific .node binary and re-exports
 * the Rust-backed VectorHandle class + any future bindings.
 */

import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface NapiBindings {
  VectorHandle: VectorHandleClass;
  SonaHandle: SonaHandleConstructor;
  AttentionHandle: AttentionHandleConstructor;
  GraphHandle: GraphHandleConstructor;
  RoutingEngine: RoutingEngineConstructor;
  AnalysisEngine: AnalysisEngineConstructor;
  distillMarkdown: (markdown: string) => string;
  distillFile: (path: string) => string;
  detectTechnologies: (projectDir: string) => DetectResult;
}

export interface DetectResult {
  detected: Array<{
    id: string;
    name: string;
    category: string;
    skills: string[];
  }>;
  categories: string[];
  skills: string[];
  total_technologies: number;
  total_skills: number;
}

interface VectorHandleClass {
  open(path: string, dimensions?: number): VectorHandle;
  inMemory(dimensions?: number, enableHnsw?: boolean): VectorHandle;
}

export interface VectorHandle {
  insert(vector: number[], id?: string, metadata?: unknown): string;
  search(vector: number[], k?: number): SearchResult[];
  delete(id: string): boolean;
  count(): number;
  stats(): DbStats;
}

export interface SearchResult {
  id: string;
  score: number;
  vector?: number[];
  metadata?: Record<string, unknown>;
}

export interface DbStats {
  total_vectors: number;
  dimensions: number;
  metric: string;
  index_type: string;
  storage_bytes: number;
}

const PLATFORM_MAP: Record<string, Record<string, string>> = {
  darwin: {
    arm64: "@aiyou-dev/cli-darwin-arm64",
    x64: "@aiyou-dev/cli-darwin-x64",
  },
  linux: {
    x64: "@aiyou-dev/cli-linux-x64-gnu",
    arm64: "@aiyou-dev/cli-linux-arm64-gnu",
  },
  win32: {
    x64: "@aiyou-dev/cli-win32-x64-msvc",
  },
};

function getPlatformPackage(): string | undefined {
  return PLATFORM_MAP[process.platform]?.[process.arch];
}

function loadBindings(): NapiBindings {
  // Try loading from the workspace root (development: cargo build output)
  const candidates = [
    join(__dirname, "..", "..", "aiyoucli-napi.darwin-arm64.node"),
    join(__dirname, "..", "..", "aiyoucli-napi.darwin-x64.node"),
    join(__dirname, "..", "..", "aiyoucli-napi.linux-x64-gnu.node"),
    join(__dirname, "..", "..", "aiyoucli-napi.node"),
    // napi build output location
    join(__dirname, "..", "..", "crates", "aiyoucli-napi", "aiyoucli-napi.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return require(candidate) as NapiBindings;
    }
  }

  // Try loading platform-specific npm package (production)
  const platformPackage = getPlatformPackage();
  if (platformPackage) {
    try {
      return require(platformPackage) as NapiBindings;
    } catch {
      // ignore
    }
  }

  throw new Error(
    "Failed to load aiyoucli-napi native binding. " +
      "Run `npm run build:rs` or `cargo build -p aiyoucli-napi`."
  );
}

let _bindings: NapiBindings | null = null;

function getBindings(): NapiBindings {
  if (!_bindings) {
    _bindings = loadBindings();
  }
  return _bindings;
}

/**
 * Open a persistent vector database at the given path.
 */
export function openVectorDB(
  path: string,
  dimensions?: number
): VectorHandle {
  return getBindings().VectorHandle.open(path, dimensions);
}

/**
 * Create an in-memory vector database (no persistence).
 */
export function inMemoryVectorDB(dimensions?: number, enableHnsw?: boolean): VectorHandle {
  return getBindings().VectorHandle.inMemory(dimensions, enableHnsw);
}

// ── SONA Engine ─────────────────────────────────────────────────

interface SonaHandleConstructor {
  new (): SonaHandle;
}

export interface SonaHandle {
  submitObservation(embedding: number[], qualityScore: number, kind?: string): void;
  transformEmbedding(input: number[]): number[];
  forceLearn(): number;
  stats(): { signals_processed: number; trajectories_buffered: number; enabled: boolean };
  setEnabled(enabled: boolean): void;
}

export function createSonaEngine(): SonaHandle {
  return new (getBindings().SonaHandle)();
}

// ── Attention Router ────────────────────────────────────────────

interface AttentionHandleConstructor {
  new (dim: number): AttentionHandle;
}

export interface AttentionHandle {
  compute(
    query: number[],
    keysFlat: number[],
    valuesFlat: number[],
    hint?: string
  ): number[];
}

export function createAttentionRouter(dim: number): AttentionHandle {
  return new (getBindings().AttentionHandle)(dim);
}

// ── Knowledge Graph ─────────────────────────────────────────────

interface GraphHandleConstructor {
  new (): GraphHandle;
}

export interface GraphHandle {
  addNode(kind: string, name: string): number;
  addEdge(from: number, to: number, kind: string, weight: number): number;
  getNode(id: number): { id: number; name: string; kind: string } | null;
  neighbors(
    id: number,
    direction?: string
  ): Array<{
    node_id: number;
    node_name: string;
    node_kind: string;
    edge_kind: string;
    weight: number;
  }>;
  kHop(start: number, k: number): number[];
  removeNode(id: number): boolean;
  stats(): { nodes: number; edges: number };
}

export function createKnowledgeGraph(): GraphHandle {
  return new (getBindings().GraphHandle)();
}

// ── Routing Engine ──────────────────────────────────────────────

interface RoutingEngineConstructor {
  new (): RoutingEngine;
}

export interface RoutingEngine {
  route(taskDescription: string): {
    route: string;
    confidence: number;
    model_tier: string;
    explored: boolean;
    method: string;
    alternatives: Array<{ route: string; score: number }>;
  };
  semanticRoute(taskDescription: string): {
    route: string;
    similarity: number;
    scores: Array<{ route: string; score: number }>;
  };
  embed(text: string): number[];
  recordReward(taskDescription: string, chosenRoute: string, reward: number): void;
  selectModelTier(taskDescription: string): string;
  stats(): {
    states_learned: number;
    total_steps: number;
    num_actions: number;
    replay_buffer_size: number;
    replay_buffer_full: boolean;
    embedding_dimensions: number;
  };
  exportQTable(): string;
  importQTable(jsonStr: string): void;
}

export function createRoutingEngine(): RoutingEngine {
  return new (getBindings().RoutingEngine)();
}

// ── Analysis Engine ─────────────────────────────────────────────

interface AnalysisEngineConstructor {
  new (): AnalysisEngine;
}

export interface AnalysisEngine {
  classifyDiff(diffContent: string): {
    files: Array<{
      path: string;
      additions: number;
      deletions: number;
      classification: string;
      impact: string;
    }>;
    overall: { classification: string; impact: string; confidence: number };
    stats: { total_additions: number; total_deletions: number; files_changed: number };
    risk_factors: string[];
  };
  classifyCommit(message: string): string;
  complexityScore(source: string): number;
}

export function createAnalysisEngine(): AnalysisEngine {
  return new (getBindings().AnalysisEngine)();
}

// ── Distiller ────────────────────────────────────────────────────

/**
 * Distill Markdown into TOON format (Dense Structured Instructions).
 * ~52% fewer tokens for the same semantic content.
 */
export function distillMarkdown(markdown: string): string {
  return getBindings().distillMarkdown(markdown);
}

/**
 * Distill a Markdown file into TOON format. Reads file and returns TOON string.
 */
export function distillFile(path: string): string {
  return getBindings().distillFile(path);
}

/**
 * Detect technologies in a project directory.
 */
export function detectTechnologies(projectDir: string): DetectResult {
  return getBindings().detectTechnologies(projectDir);
}
