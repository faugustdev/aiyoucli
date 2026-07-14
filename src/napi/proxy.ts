/**
 * NAPI binary loader for aiyoucli-proxy Rust crate.
 *
 * Loads the aiyoucli-proxy .node binary and re-exports
 * the ProxyEngine class for LLM gateway/proxy operations.
 */

import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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
  semanticEmbed(text: string): number[];
  semanticStats(): SemanticRouterStats;
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
  const candidates = [
    join(__dirname, "..", "..", "aiyoucli-proxy.linux-x64-gnu.node"),
    join(__dirname, "..", "..", "aiyoucli-proxy.darwin-arm64.node"),
    join(__dirname, "..", "..", "aiyoucli-proxy.darwin-x64.node"),
    join(__dirname, "..", "..", "aiyoucli-proxy.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const mod = require(candidate) as { ProxyEngine: ProxyEngineClass };
      return mod.ProxyEngine;
    }
  }

  throw new Error(
    "Failed to load aiyoucli-proxy native binding. " +
      "Run `cargo build --release -p aiyoucli-proxy` and copy the .so to the project root."
  );
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
