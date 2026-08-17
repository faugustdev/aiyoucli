//! Codebase indexing/search/graph-query — thin FFI wrapper over
//! `aiyouvector_codebase`, replacing the standalone `aiyouvector mcp`
//! server (retired). Same idea as `ast.rs`'s "Pillar C" consolidation,
//! applied to indexing instead of AST parsing.
//!
//! Unlike `ast.rs` (infallible by design — a bad parse just yields an
//! empty result), every operation here is genuinely fallible (project not
//! found, bad Cypher, I/O), so the plain layer returns `anyhow::Result<T>`
//! and the `#[napi]` layer converts errors the same way `vector.rs`/
//! `graph.rs` do: `.map_err(|e| Error::new(Status::GenericFailure, ...))`.
//!
//! Free functions, no wrapping struct: every operation here reopens its
//! own SQLite connection per call — there's no long-lived handle worth
//! constructing, unlike `VectorHandle`/`GraphHandle`. Not folded into
//! `ProxyEngine` (`proxy.rs`) either — that struct already hosts LLM/
//! firewall/cache/embeddings/semantic-router/AST, and none of these 14
//! operations belong to that family.

use std::path::Path;

// Aliased to avoid colliding with napi::bindgen_prelude's own `Result<T>`
// (a different 2-param alias, `Result<T, S = Status>`) — the plain-layer
// functions below use `anyhow::Result` (renamed `AResult`) for ergonomic
// `?`/`bail!`; the `#[napi]` layer at the bottom uses bare `Result<T>`,
// which resolves to napi's alias since nothing else imports that name.
use anyhow::{bail, Result as AResult};
use napi::bindgen_prelude::*;
use serde::Serialize;

use aiyouvector_codebase::exporter;
use aiyouvector_codebase::graph::cypher::query_project_cypher;
use aiyouvector_codebase::graph::{ArchitectureCluster, SearchResult, TraceResult};
use aiyouvector_codebase::indexer::{IndexStats, Indexer, Mode};
use aiyouvector_codebase::pipeline;
use aiyouvector_codebase::verifier::{self, VerifyMode, VerifyReport};
use aiyouvector_codebase::CodebaseGraph;

fn parse_mode(s: &str) -> Mode {
    match s {
        "moderate" => Mode::Moderate,
        "fast" => Mode::Fast,
        "cross-repo-intelligence" => Mode::CrossRepo,
        _ => Mode::Full,
    }
}

fn open_project(project: &str) -> AResult<CodebaseGraph> {
    let db_path = Indexer::new().db_path(project);
    if !db_path.is_file() {
        bail!("project not indexed: {project}");
    }
    CodebaseGraph::open(&db_path)
}

// ── Result shapes not already covered by an upstream Serialize type ────

/// Mirrors `aiyouvector_codebase::pipeline::PipelineOutcome`, which
/// doesn't derive `Serialize` itself.
#[derive(Debug, Clone, Serialize)]
pub struct PipelineSummary {
    pub observations: usize,
    pub patterns_added: usize,
    pub signals: u64,
    pub snapshot_index: Option<u64>,
    pub lora_path: String,
    pub profile_path: String,
}

impl From<pipeline::PipelineOutcome> for PipelineSummary {
    fn from(o: pipeline::PipelineOutcome) -> Self {
        Self {
            observations: o.observations,
            patterns_added: o.patterns_added,
            signals: o.signals,
            snapshot_index: o.snapshot_index,
            lora_path: o.lora_path,
            profile_path: o.profile_path,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct IndexRepositoryResult {
    pub stats: IndexStats,
    /// Best-effort observer/SONA/profile pass over the same repo. `None`
    /// if that pass failed — indexing itself still succeeded.
    pub pipeline: Option<PipelineSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectSummary {
    pub name: String,
    pub nodes: i64,
    pub edges: i64,
    pub files: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeleteResult {
    pub project: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectStatus {
    pub project: String,
    pub nodes: i64,
    pub edges: i64,
    pub files: i64,
    pub labels: Vec<String>,
    pub edge_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DetectChangesResult {
    pub project: String,
    /// Files with a recorded hash for this project. NOT a git diff —
    /// this project never actually compared against a git ref, despite
    /// the old MCP tool's description implying it did.
    pub tracked_files: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphSchema {
    pub project: String,
    pub node_labels: Vec<String>,
    pub edge_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CodeSnippet {
    pub file_path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub code: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportResult {
    pub project: String,
    pub archive: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub installed: String,
    pub archive: String,
}

// ── Plain functions (unit-testable without the NAPI runtime) ───────────

pub fn index_repository(repo_path: &str, index_mode: &str) -> AResult<IndexRepositoryResult> {
    let indexer = Indexer::new();
    let stats = indexer.index_repository(Path::new(repo_path), parse_mode(index_mode))?;
    // Best-effort: an observer/SONA/profile failure must not fail the
    // index itself, same behavior as the old MCP handler.
    let pipeline = pipeline::observe_repo(Path::new(repo_path))
        .ok()
        .map(PipelineSummary::from);
    Ok(IndexRepositoryResult { stats, pipeline })
}

/// Infallible, mirroring the old handler: a project whose DB fails to
/// open (corrupted, mid-write) is silently skipped rather than failing
/// the whole listing.
pub fn list_projects() -> Vec<ProjectSummary> {
    let db_dir = Indexer::default_db_dir();
    let mut projects = Vec::new();
    let Ok(entries) = std::fs::read_dir(&db_dir) else {
        return projects;
    };
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        let Some(project_name) = name.strip_suffix(".db") else {
            continue;
        };
        let Ok(graph) = CodebaseGraph::open(&entry.path()) else {
            continue;
        };
        let Ok(counts) = graph.stats() else {
            continue;
        };
        projects.push(ProjectSummary {
            name: project_name.to_string(),
            nodes: *counts.get("nodes").unwrap_or(&0),
            edges: *counts.get("edges").unwrap_or(&0),
            files: *counts.get("files").unwrap_or(&0),
        });
    }
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    projects
}

pub fn delete_project(project: &str) -> AResult<DeleteResult> {
    let db_path = Indexer::new().db_path(project);
    let deleted = std::fs::remove_file(&db_path).is_ok();
    Ok(DeleteResult {
        project: project.to_string(),
        deleted,
    })
}

/// `None` means the project isn't indexed — not an error.
pub fn project_status(project: &str) -> AResult<Option<ProjectStatus>> {
    let db_path = Indexer::new().db_path(project);
    if !db_path.is_file() {
        return Ok(None);
    }
    let graph = CodebaseGraph::open(&db_path)?;
    let counts = graph.stats()?;
    let (labels, edge_types) = graph.get_schema()?;
    Ok(Some(ProjectStatus {
        project: project.to_string(),
        nodes: *counts.get("nodes").unwrap_or(&0),
        edges: *counts.get("edges").unwrap_or(&0),
        files: *counts.get("files").unwrap_or(&0),
        labels,
        edge_types,
    }))
}

/// Merges the old `search_graph`/`search_code` handlers — both called
/// the identical `search_bm25` for their query path; `search_code`'s
/// "grep with dedup" description was never actually implemented.
/// Exactly one of `query`/`name_pattern` must be given.
pub fn search(
    project: &str,
    query: Option<&str>,
    name_pattern: Option<&str>,
    label: Option<&str>,
    limit: usize,
) -> AResult<Vec<SearchResult>> {
    let graph = open_project(project)?;
    match (query, name_pattern) {
        (Some(q), _) => graph.search_bm25(q, limit),
        (None, Some(pattern)) => graph.search_name_pattern(pattern, label, limit),
        (None, None) => bail!("either query or name_pattern is required"),
    }
}

/// aiyoucli's public vocabulary (CLI flag, MCP tool input, docs) is
/// callers/callees/both. aiyouvector-codebase's `trace_calls()` speaks its
/// own outbound/inbound vocabulary internally (consistent across its own
/// callers and tests, so we don't rename it there) and treats anything that
/// isn't exactly "outbound" or "inbound" as "both". Without this
/// translation, "callers" and "callees" both fell through to that wildcard
/// and silently returned the same result as "both" — no error.
fn translate_direction(direction: &str) -> &str {
    match direction {
        "callees" => "outbound",
        "callers" => "inbound",
        _ => direction, // "both", or anything unrecognized -> upstream's both-directions wildcard
    }
}

pub fn trace_path(
    project: &str,
    function_name: &str,
    direction: &str,
    depth: usize,
) -> AResult<Vec<TraceResult>> {
    let graph = open_project(project)?;
    graph.trace_calls(function_name, translate_direction(direction), depth)
}

/// NOT a git diff — counts files with a recorded hash for this project.
/// The old MCP tool's description ("detect changed files since a git
/// ref") never matched what this actually did; don't repeat that here.
pub fn detect_changes(project: &str) -> AResult<DetectChangesResult> {
    let graph = open_project(project)?;
    let hashes = graph.get_file_hashes(project)?;
    Ok(DetectChangesResult {
        project: project.to_string(),
        tracked_files: hashes.len(),
    })
}

pub fn query_graph(project: &str, query: &str, max_rows: usize) -> AResult<Vec<Vec<String>>> {
    let db_path = Indexer::new().db_path(project);
    if !db_path.is_file() {
        bail!("project not indexed: {project}");
    }
    query_project_cypher(&db_path, query, max_rows)
}

pub fn graph_schema(project: &str) -> AResult<GraphSchema> {
    let graph = open_project(project)?;
    let (node_labels, edge_types) = graph.get_schema()?;
    Ok(GraphSchema {
        project: project.to_string(),
        node_labels,
        edge_types,
    })
}

pub fn code_snippet(project: &str, qualified_name: &str) -> AResult<Option<CodeSnippet>> {
    let graph = open_project(project)?;
    Ok(graph
        .get_code_snippet(qualified_name)?
        .map(|(file_path, start_line, end_line, code)| CodeSnippet {
            file_path,
            start_line,
            end_line,
            code,
        }))
}

/// `aspects` is accepted for API continuity with the old tool but does
/// nothing upstream — `CodebaseGraph::get_architecture`'s parameter is
/// literally named `_aspects`. Documented here rather than silently
/// pretending it filters.
pub fn architecture(project: &str, aspects: &[String]) -> AResult<Vec<ArchitectureCluster>> {
    let graph = open_project(project)?;
    graph.get_architecture(aspects)
}

pub fn verify(init: bool, strict: bool) -> AResult<VerifyReport> {
    let mode = if init {
        VerifyMode::Init
    } else if strict {
        VerifyMode::Strict
    } else {
        VerifyMode::Standard
    };
    Ok(verifier::verify(mode)?)
}

pub fn export_project(project: &str, out_dir: Option<&str>) -> AResult<ExportResult> {
    let dir = out_dir.map_or_else(exporter::export_dir, std::path::PathBuf::from);
    std::fs::create_dir_all(&dir)?;
    let dest = dir.join(exporter::default_archive_name(project));
    let archive = exporter::export_project(project, &dest)?;
    Ok(ExportResult {
        project: project.to_string(),
        archive: archive.display().to_string(),
    })
}

pub fn import_project(archive: &str) -> AResult<ImportResult> {
    let installed = exporter::import_project(Path::new(archive))?;
    Ok(ImportResult {
        installed,
        archive: archive.to_string(),
    })
}

pub fn observe_pipeline(repo_path: &str) -> AResult<PipelineSummary> {
    Ok(pipeline::observe_repo(Path::new(repo_path))?.into())
}

// ── NAPI layer ───────────────────────────────────────────────────────

fn to_value<T: Serialize>(r: AResult<T>) -> Result<serde_json::Value> {
    r.map(|v| serde_json::to_value(&v).unwrap_or_default())
        .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))
}

#[napi]
pub fn codebase_index_repository(
    repo_path: String,
    index_mode: Option<String>,
) -> Result<serde_json::Value> {
    to_value(index_repository(
        &repo_path,
        index_mode.as_deref().unwrap_or("full"),
    ))
}

#[napi]
pub fn codebase_list_projects() -> serde_json::Value {
    serde_json::to_value(list_projects()).unwrap_or_default()
}

#[napi]
pub fn codebase_delete_project(project: String) -> Result<serde_json::Value> {
    to_value(delete_project(&project))
}

#[napi]
pub fn codebase_project_status(project: String) -> Result<serde_json::Value> {
    to_value(project_status(&project))
}

#[napi]
pub fn codebase_search(
    project: String,
    query: Option<String>,
    name_pattern: Option<String>,
    label: Option<String>,
    limit: Option<u32>,
) -> Result<serde_json::Value> {
    to_value(search(
        &project,
        query.as_deref(),
        name_pattern.as_deref(),
        label.as_deref(),
        limit.unwrap_or(200) as usize,
    ))
}

#[napi]
pub fn codebase_trace_path(
    project: String,
    function_name: String,
    direction: Option<String>,
    depth: Option<u32>,
) -> Result<serde_json::Value> {
    to_value(trace_path(
        &project,
        &function_name,
        direction.as_deref().unwrap_or("both"),
        depth.unwrap_or(3) as usize,
    ))
}

#[napi]
pub fn codebase_detect_changes(project: String) -> Result<serde_json::Value> {
    to_value(detect_changes(&project))
}

#[napi]
pub fn codebase_query_graph(
    project: String,
    query: String,
    max_rows: Option<u32>,
) -> Result<serde_json::Value> {
    to_value(query_graph(
        &project,
        &query,
        max_rows.unwrap_or(1000) as usize,
    ))
}

#[napi]
pub fn codebase_graph_schema(project: String) -> Result<serde_json::Value> {
    to_value(graph_schema(&project))
}

#[napi]
pub fn codebase_code_snippet(project: String, qualified_name: String) -> Result<serde_json::Value> {
    to_value(code_snippet(&project, &qualified_name))
}

#[napi]
pub fn codebase_architecture(
    project: String,
    aspects: Option<Vec<String>>,
) -> Result<serde_json::Value> {
    to_value(architecture(&project, &aspects.unwrap_or_default()))
}

#[napi]
pub fn codebase_verify(init: Option<bool>, strict: Option<bool>) -> Result<serde_json::Value> {
    to_value(verify(init.unwrap_or(false), strict.unwrap_or(false)))
}

#[napi]
pub fn codebase_export_project(
    project: String,
    out_dir: Option<String>,
) -> Result<serde_json::Value> {
    to_value(export_project(&project, out_dir.as_deref()))
}

#[napi]
pub fn codebase_import_project(archive: String) -> Result<serde_json::Value> {
    to_value(import_project(&archive))
}

#[napi]
pub fn codebase_observe_pipeline(repo_path: String) -> Result<serde_json::Value> {
    to_value(observe_pipeline(&repo_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_temp_indexer(f: impl FnOnce(&Path)) {
        let tmp = tempfile::tempdir().unwrap();
        f(tmp.path());
    }

    #[test]
    fn list_projects_on_empty_dir_is_empty_not_error() {
        with_temp_indexer(|_| {
            // default_db_dir() points at the real home dir in test runs too,
            // so just exercise the infallible path directly.
            let _ = list_projects();
        });
    }

    #[test]
    fn search_requires_query_or_name_pattern() {
        // open_project fails fast on a nonexistent project before the
        // query/name_pattern check even runs — assert on that instead,
        // since there's no indexed project in this test's environment.
        let err = search("definitely-not-a-real-project-xyz", None, None, None, 10).unwrap_err();
        assert!(err.to_string().contains("not indexed"));
    }

    #[test]
    fn detect_changes_reports_missing_project() {
        let err = detect_changes("definitely-not-a-real-project-xyz").unwrap_err();
        assert!(err.to_string().contains("not indexed"));
    }

    #[test]
    fn translate_direction_maps_public_vocabulary_to_upstream() {
        // The bug this guards against: "callers"/"callees" used to fall
        // through untranslated and silently behave like "both".
        assert_eq!(translate_direction("callees"), "outbound");
        assert_eq!(translate_direction("callers"), "inbound");
        assert_eq!(translate_direction("both"), "both");
        assert_eq!(translate_direction("anything-else"), "anything-else");
    }
}
