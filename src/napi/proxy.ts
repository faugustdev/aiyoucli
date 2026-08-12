/**
 * NAPI binary loader for ProxyEngine (consolidated into aiyoucli-napi).
 *
 * Loads the aiyoucli-napi .node binary and re-exports
 * the ProxyEngine class for LLM gateway/proxy operations.
 */

import { getNativeBindings } from "./index.js";

interface ProxyEngineClass {
  new (): ProxyEngineHandle;
}

export interface ProxyEngineHandle {
  chatCompletion(
    messages: Array<{ role: string; content: string }>,
    model?: string
  ): ProxyResponse;
  healthCheck(): HealthStatus;
  shieldCheck(content: string): ShieldResult;
  compressMessages(
    messages: Array<{ role: string; content: string }>,
    maxMessages?: number,
    maxMessageChars?: number
  ): CompressionResult;
  analyzeText(text: string): TextAnalysis;
  firewallCheck(origin: string, path: string): FirewallCheck;
  blockOrigin(origin: string): void;
  unblockOrigin(origin: string): void;
  blockedOrigins(): string[];
  cacheStats(): CacheStats;
  clearCache(): void;
  segmentByChunks(text: string, chunkSize: number, overlap?: number): SegmentationResult;
  segmentBySentences(text: string, maxChars?: number): SegmentationResult;
  listModels(provider?: string): ModelInfo[];
  estimatedCost(model: string, inputTokens: number, outputTokens: number): CostEstimate;
  embedText(text: string): EmbeddingResult;
  embedTexts(texts: string[]): EmbeddingBatchResult;

  // ── AST Analyzer ─────────────────────────────────
  analyzeCode(path: string, source: string): AnalysisResult;
  analyzeCodeBatch(files: Array<[string, string]>): BatchAnalysisResult;
  detectLanguage(path: string): string;

  // ── Semantic Router ──────────────────────────────
  semanticRoute(task: string): SemanticRouteResult;
  semanticRouteHybrid(task: string, embeddingScores: Record<string, number>): SemanticRouteResult;
  semanticRouteEnhanced(task: string): SemanticRouteResult;
  semanticEmbed(text: string): number[];
  semanticStats(): SemanticRouterStats;
  semanticAgentProfiles(): AgentProfile[];
}

// ── AST types ──────────────────────────────────────────────────────

export interface FunctionDecl {
  name: string;
  start_line: number;
  end_line: number;
  params: string[];
  complexity: number;
  has_doc_comment: boolean;
}

export interface ClassDecl {
  name: string;
  start_line: number;
  end_line: number;
  methods: FunctionDecl[];
  parent_class: string | null;
  interfaces: string[];
}

export interface ImportDecl {
  source: string;
  names: string[];
  kind: string;
}

export interface AnalysisResult {
  language: string;
  functions: FunctionDecl[];
  classes: ClassDecl[];
  imports: ImportDecl[];
  total_lines: number;
  comment_lines: number;
  blank_lines: number;
  code_lines: number;
  overall_complexity: number;
  max_nesting_depth: number;
  dependencies: string[];
}

export interface BatchAnalysisResult {
  files: AnalysisResult[];
  total_files: number;
  total_functions: number;
}

// ── Semantic Router types ──────────────────────────────────────────

export interface RouteScore {
  route: string;
  score: number;
}

export interface SemanticRouteResult {
  route: string;
  confidence: number;
  method: string;
  scores: RouteScore[];
  model_tier: string;
}

export interface SemanticRouterStats {
  num_agents: number;
  total_keywords: number;
  use_embeddings: boolean;
  min_confidence: number;
  agents: Array<{
    name: string;
    model_tier: string;
    keywords: number;
    patterns: number;
  }>;
}

/**
 * Full agent profile as defined in the Rust semantic router.
 * Keywords are returned sorted by weight (descending) for convenience.
 * Single source of truth — both `q_table_seed` and any future routing
 * layer that needs agent metadata must go through this type.
 */
export interface AgentProfile {
  name: string;
  model_tier: string;
  keywords: Array<{ text: string; weight: number }>;
  patterns: string[];
}

export interface ProxyResponse {
  cached?: boolean;
  hits?: number;
  response?: {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices: Array<{
      index: number;
      message: { role: string; content: string };
      finish_reason?: string;
    }>;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
  error?: string;
  blocked?: boolean;
  flags?: ShieldFlag[];
}

export interface HealthStatus {
  reachable: boolean;
  status_code: number;
  latency_ms: number;
  provider: string;
  error?: string;
}

export interface ShieldResult {
  passed: boolean;
  flags: ShieldFlag[];
  flagged: boolean;
}

export interface ShieldFlag {
  category: string;
  severity: string;
  pattern: string;
  position?: number;
}

export interface CompressionResult {
  original_tokens: number;
  compressed_tokens: number;
  ratio: number;
  method: string;
}

export interface TextAnalysis {
  chars: number;
  estimated_tokens: number;
  tokens_per_char: string;
  whitespace_pct: string;
  compression_targets: {
    truncate_middle_75: number;
    normalized: number;
  };
}

export interface FirewallCheck {
  allowed: boolean;
  reason?: string;
  matched_rule?: string;
}

export interface CacheStats {
  entries: number;
  max_entries: number;
  total_hits: number;
  avg_hits_per_entry: string;
  default_ttl_secs: number;
}

export interface Segment {
  index: number;
  content: string;
  char_count: number;
  estimated_tokens: number;
}

export interface SegmentationResult {
  segments: Segment[];
  total_chars: number;
  total_tokens: number;
  num_segments: number;
  strategy: string;
}

export interface ModelInfo {
  name: string;
  provider: string;
  max_input_tokens: number;
  max_output_tokens: number;
  supports_streaming: boolean;
  supports_functions: boolean;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
}

export interface CostEstimate {
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
}

export interface EmbeddingResult {
  embedding?: number[];
  dimensions?: number;
  error?: string;
}

export interface EmbeddingBatchResult {
  embeddings?: number[][];
  count?: number;
  dimensions?: number[];
  error?: string;
}

function loadProxyBindings(): ProxyEngineClass {
  // ProxyEngine lives in the same .node binary as VectorHandle et al., so
  // reuse the loader in ./index.js rather than keeping a second candidate
  // list here. The old local list only checked the package root (the dev
  // `napi build -o .` output) and never fell back to the platform npm
  // package, which is why the proxy engine was unavailable in every
  // published install.
  const bindings = getNativeBindings();
  const ProxyEngine = bindings.ProxyEngine as ProxyEngineClass | undefined;
  if (typeof ProxyEngine !== "function") {
    throw new Error(
      "aiyoucli-napi loaded but does not export ProxyEngine — the native binary is older than this wrapper."
    );
  }
  return ProxyEngine;
}

let _proxyBindings: ProxyEngineClass | null = null;

function getProxyBindings(): ProxyEngineClass {
  if (!_proxyBindings) {
    _proxyBindings = loadProxyBindings();
  }
  return _proxyBindings;
}

export function createProxyEngine(): ProxyEngineHandle {
  return new (getProxyBindings())();
}
