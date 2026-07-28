/**
 * NAPI binary loader for aiyoucli-napi Rust crate.
 *
 * Loads the platform-specific .node binary and re-exports
 * the Rust-backed VectorHandle class + any future bindings.
 */

import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface NapiBindings {
  VectorHandle: VectorHandleClass;
  SonaHandle: SonaHandleConstructor;
  AttentionHandle: AttentionHandleConstructor;
  GraphHandle: GraphHandleConstructor;
  RoutingEngine: RoutingEngineConstructor;
  AnalysisEngine: AnalysisEngineConstructor;
  ProxyEngine: ProxyEngineConstructor;
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

// ── Proxy Engine (single source of truth for agent profiles) ──────

interface ProxyEngineConstructor {
  new (): {
    semanticAgentProfiles(): AgentProfile[];
  };
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

// ── Proxy Engine (semantic router side-channel) ────────────────────
//
// The ProxyEngine NAPI binding exposes `semanticAgentProfiles` which
// returns the full 8-agent profile list. This is the single source of
// truth for Q-table seeding — duplicating the keyword tables in TS
// would silently rot. Loaded lazily so callers that don't need the
// proxy engine don't pay the load cost.
//
// The NAPI binary itself is loaded via `getBindings()` (same binary
// that hosts VectorHandle, GraphHandle, etc.). The proxy engine is a
// class inside that binary; we instantiate it lazily.

let _proxyEngine: unknown = null;

function loadProxyEngineIfAvailable(): unknown {
  if (_proxyEngine !== null) return _proxyEngine;
  try {
    const bindings = getBindings() as unknown as {
      ProxyEngine?: new () => unknown;
    };
    if (bindings && typeof bindings.ProxyEngine === "function") {
      _proxyEngine = new bindings.ProxyEngine();
    } else {
      _proxyEngine = null;
    }
  } catch {
    _proxyEngine = null;
  }
  return _proxyEngine;
}

export interface AgentProfile {
  name: string;
  model_tier: string;
  keywords: Array<{ text: string; weight: number }>;
  patterns: string[];
}

/**
 * Return the full agent profile list from the semantic router.
 * Returns an empty array if the NAPI binding is unavailable.
 *
 * Fallback: when the Rust crate hasn't shipped `semanticAgentProfiles` yet
 * (Pillar G — observer→sona→profile end-to-end), parse the agent roster from
 * `.aiyoucli/agents.dsi.toon` so the Q-table seed step still has the 8
 * canonical profiles to work with. This keeps the warmup green even when
 * the binary is one Rust release ahead of the wrapper.
 */
export function getAgentProfiles(): AgentProfile[] {
  const engine = loadProxyEngineIfAvailable() as {
    semanticAgentProfiles?: () => AgentProfile[];
  } | null;
  if (engine && typeof engine.semanticAgentProfiles === "function") {
    try {
      const profiles = engine.semanticAgentProfiles();
      if (profiles.length > 0) return profiles;
    } catch {
      // fall through to TOON fallback
    }
  }
  return loadAgentProfilesFromToon();
}

function loadAgentProfilesFromToon(): AgentProfile[] {
  const toonPath = join(process.cwd(), ".aiyoucli", "agents.dsi.toon");
  if (!existsSync(toonPath)) return [];
  try {
    const raw = readFileSync(toonPath, "utf-8");
    // TOON row format for the agent roster:
    //   coding-leader,Execution-first orchestrator,flagship,Complex multi-file tasks; context owner
    // Four CSV columns: agent, role, tier, when_to_use.
    const profiles: AgentProfile[] = [];
    const seen = new Set<string>();
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([a-z][\w-]*),\s*([^,]+),\s*([^,]+),\s*(.+?)\s*$/);
      if (!m) continue;
      const name = m[1];
      // Skip obvious non-agent rows (they have spaces in the first column).
      if (name.includes(" ") || seen.has(name)) continue;
      // The first column must be a short identifier (no commas, no spaces).
      if (name.length > 32) continue;
      seen.add(name);
      const role = m[2];
      const tier = m[3];
      const whenToUse = m[4];
      profiles.push({
        name,
        model_tier: tier,
        // Synthesize keywords from the role + when_to_use. The Rust engine
        // does the same internally; this is "good enough" for seeding Q-table
        // entries during warmup — the actual routing still goes through the
        // engine's own embeddings when available.
        keywords: tokenizeKeywords(role + " " + whenToUse).map((text) => ({ text, weight: 0.5 })),
        patterns: [],
      });
    }
    return profiles;
  } catch {
    return [];
  }
}

function tokenizeKeywords(text: string): string[] {
  const stop = new Set(["a", "an", "the", "for", "and", "or", "of", "to", "in", "on", "with"]);
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9-]+/)
        .filter((w) => w.length >= 3 && !stop.has(w)),
    ),
  ).slice(0, 6);
}
  }
}
