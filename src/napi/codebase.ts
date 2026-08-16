/**
 * Codebase indexing/search/graph-query — TS bindings for the free
 * `codebase*` functions in `aiyoucli-napi/src/codebase.rs`, which replace
 * the retired standalone `aiyouvector mcp` server (Pillar C-style
 * consolidation, same idea as `ast.rs`/`proxy.ts` for AST parsing).
 *
 * Unlike `proxy.ts`'s `ProxyEngine`, there's no handle/class to construct
 * here — every Rust-side function is a free function (no long-lived state,
 * each call reopens its own SQLite connection), so this file just grabs
 * each one off the shared native binding object and re-exports a typed
 * wrapper. Reuses `getNativeBindings()` from `./index.js` rather than a
 * second binary-discovery loader — see `proxy.ts`'s comment on why that
 * duplication broke published installs before.
 */

import { getNativeBindings } from "./index.js";

interface CodebaseNapiBindings {
  codebaseIndexRepository(repoPath: string, indexMode?: string): unknown;
  codebaseListProjects(): unknown;
  codebaseDeleteProject(project: string): unknown;
  codebaseProjectStatus(project: string): unknown;
  codebaseSearch(
    project: string,
    query?: string,
    namePattern?: string,
    label?: string,
    limit?: number
  ): unknown;
  codebaseTracePath(project: string, functionName: string, direction?: string, depth?: number): unknown;
  codebaseDetectChanges(project: string): unknown;
  codebaseQueryGraph(project: string, query: string, maxRows?: number): unknown;
  codebaseGraphSchema(project: string): unknown;
  codebaseCodeSnippet(project: string, qualifiedName: string): unknown;
  codebaseArchitecture(project: string, aspects?: string[]): unknown;
  codebaseVerify(init?: boolean, strict?: boolean): unknown;
  codebaseExportProject(project: string, outDir?: string): unknown;
  codebaseImportProject(archive: string): unknown;
  codebaseObservePipeline(repoPath: string): unknown;
}

const REQUIRED_FNS = [
  "codebaseIndexRepository", "codebaseListProjects", "codebaseDeleteProject",
  "codebaseProjectStatus", "codebaseSearch", "codebaseTracePath",
  "codebaseDetectChanges", "codebaseQueryGraph", "codebaseGraphSchema",
  "codebaseCodeSnippet", "codebaseArchitecture", "codebaseVerify",
  "codebaseExportProject", "codebaseImportProject", "codebaseObservePipeline",
] as const;

let _bindings: CodebaseNapiBindings | null = null;

function bindings(): CodebaseNapiBindings {
  if (_bindings) return _bindings;
  const raw = getNativeBindings();
  for (const name of REQUIRED_FNS) {
    if (typeof raw[name] !== "function") {
      throw new Error(
        `aiyoucli-napi loaded but does not export ${name} — the native binary is older than this wrapper.`
      );
    }
  }
  _bindings = raw as unknown as CodebaseNapiBindings;
  return _bindings;
}

// ── Result shapes (mirror the Rust `Serialize` structs field-for-field,
//    snake_case preserved — same convention as proxy.ts's AST types) ────

export interface PipelineSummary {
  observations: number;
  patterns_added: number;
  signals: number;
  snapshot_index: number | null;
  lora_path: string;
  profile_path: string;
}

export interface IndexStats {
  files_scanned: number;
  files_indexed: number;
  files_skipped: number;
  nodes_created: number;
  edges_created: number;
  duration_ms: number;
  db_size_bytes: number;
}

export interface IndexRepositoryResult {
  stats: IndexStats;
  pipeline: PipelineSummary | null;
}

export interface ProjectSummary {
  name: string;
  nodes: number;
  edges: number;
  files: number;
}

export interface DeleteResult {
  project: string;
  deleted: boolean;
}

export interface ProjectStatus {
  project: string;
  nodes: number;
  edges: number;
  files: number;
  labels: string[];
  edge_types: string[];
}

export interface SearchResult {
  node_id: number;
  name: string;
  qualified_name: string;
  label: string;
  file_path: string;
  start_line: number;
  end_line: number;
  score: number;
}

export interface TraceResult {
  edge_type: string;
  name: string;
  qualified_name: string;
  file_path: string;
  line: number;
  depth: number;
}

export interface DetectChangesResult {
  project: string;
  tracked_files: number;
}

export interface GraphSchema {
  project: string;
  node_labels: string[];
  edge_types: string[];
}

export interface CodeSnippet {
  file_path: string;
  start_line: number;
  end_line: number;
  code: string;
}

export interface ArchitectureCluster {
  label: string;
  member_count: number;
  members: string[];
}

export interface VerifyReport {
  ok: boolean;
  manifest_present: boolean;
  entries_checked: number;
  entries_ok: number;
  entries_missing: string[];
  entries_corrupted: string[];
  untracked: string[];
}

export interface ExportResult {
  project: string;
  archive: string;
}

export interface ImportResult {
  installed: string;
  archive: string;
}

// ── Typed wrappers ───────────────────────────────────────────────────

export function indexRepository(repoPath: string, indexMode?: string): IndexRepositoryResult {
  return bindings().codebaseIndexRepository(repoPath, indexMode) as IndexRepositoryResult;
}

export function listProjects(): ProjectSummary[] {
  return bindings().codebaseListProjects() as ProjectSummary[];
}

export function deleteProject(project: string): DeleteResult {
  return bindings().codebaseDeleteProject(project) as DeleteResult;
}

export function projectStatus(project: string): ProjectStatus | null {
  return bindings().codebaseProjectStatus(project) as ProjectStatus | null;
}

export function searchCodebase(
  project: string,
  query?: string,
  namePattern?: string,
  label?: string,
  limit?: number
): SearchResult[] {
  return bindings().codebaseSearch(project, query, namePattern, label, limit) as SearchResult[];
}

export function tracePath(
  project: string,
  functionName: string,
  direction?: string,
  depth?: number
): TraceResult[] {
  return bindings().codebaseTracePath(project, functionName, direction, depth) as TraceResult[];
}

export function detectChanges(project: string): DetectChangesResult {
  return bindings().codebaseDetectChanges(project) as DetectChangesResult;
}

export function queryGraph(project: string, query: string, maxRows?: number): string[][] {
  return bindings().codebaseQueryGraph(project, query, maxRows) as string[][];
}

export function graphSchema(project: string): GraphSchema {
  return bindings().codebaseGraphSchema(project) as GraphSchema;
}

export function codeSnippet(project: string, qualifiedName: string): CodeSnippet | null {
  return bindings().codebaseCodeSnippet(project, qualifiedName) as CodeSnippet | null;
}

export function architecture(project: string, aspects?: string[]): ArchitectureCluster[] {
  return bindings().codebaseArchitecture(project, aspects) as ArchitectureCluster[];
}

export function verifyState(init?: boolean, strict?: boolean): VerifyReport {
  return bindings().codebaseVerify(init, strict) as VerifyReport;
}

export function exportProject(project: string, outDir?: string): ExportResult {
  return bindings().codebaseExportProject(project, outDir) as ExportResult;
}

export function importProject(archive: string): ImportResult {
  return bindings().codebaseImportProject(archive) as ImportResult;
}

export function observePipeline(repoPath: string): PipelineSummary {
  return bindings().codebaseObservePipeline(repoPath) as PipelineSummary;
}
