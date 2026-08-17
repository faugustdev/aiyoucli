# MCP Tools Reference

[Home](../README.md) | [Getting Started](getting-started.md) | [CLI Reference](cli-reference.md) | **MCP Tools** | [Architecture](architecture.md) | [Configuration](configuration.md)

---

## What is MCP?

The Model Context Protocol (MCP) is a standard for connecting AI models to external tools and data sources. aiyoucli implements an MCP server that exposes its toolkit over JSON-RPC 2.0 via stdio transport.

The live tool surface is authoritative — run `aiyoucli mcp tools` for the current list. This page describes the **shape** of the registered tools and their parameter conventions; consult the runtime registry for the exact count.

> **MCP is disabled by default as of `aiyoucli init`.** Every tool documented here also
> exists as a CLI command (`aiyoucli <command>`, see [CLI Reference](cli-reference.md)) — the
> CLI and MCP layers call the same handlers. Prefer the CLI via shell: it costs nothing until
> invoked, whereas MCP tool schemas (~60 of them) load into context on every turn once wired.
> Run `aiyoucli init --with-mcp --force` to opt back in — useful for clients without shell
> access (e.g. Claude Desktop).

## Connecting to aiyoucli via MCP

Add the following to your `.mcp.json` (project root or `~/.claude/.mcp.json`):

```json
{
  "mcpServers": {
    "aiyoucli": {
      "command": "npx",
      "args": ["-y", "@aiyou-dev/cli", "mcp", "start"]
    }
  }
}
```

Or if aiyoucli is installed globally:

```json
{
  "mcpServers": {
    "aiyoucli": {
      "command": "aiyoucli",
      "args": ["mcp", "start"]
    }
  }
}
```

Agent-team delegation is owned by `@aiyou-dev/team` (OpenCode plugin). Claude Code support for the same team is deferred — see `../ROADMAP.md`.

---

## Tool Catalog

The MCP registry groups currently shipped tools as follows.

### Discovery

| Tool | Purpose |
|---|---|
| `capabilities` | Reports NAPI features, aiyouvector integration, aiyou-team availability, embed server status |
| `version` | Version info for aiyoucli, aiyouvector, aiyou-team, runtime env |
| `system_doctor` | Health diagnostics — Node, NAPI, git |
| `config_get` | Read configuration values (dot-notation) |
| `config_set` | Persist configuration values to `.aiyoucli/config.json` |

### Status & Stats

| Tool | Purpose |
|---|---|
| `status` | System or statusline dashboard (`scope: system|statusline`) |
| `stats` | Subsystem metrics (`scope: memory|routing|neural|semantic|cache|full`) |

### Memory

| Tool | Purpose |
|---|---|
| `memory_init` | Initialize the persistent vector database (default `.aiyoucli/vectors.redb`, HNSW-on, 8-dim keyword embeddings) |
| `memory_store` | Store a vector with optional ID and metadata |
| `memory_search` | Nearest-neighbor search via HNSW |
| `memory_count` | Total vectors stored |
| `memory_delete` | Delete a vector by ID |
| `memory_export` | Export every stored vector as JSON (`{id, vector, metadata}[]`), for backup/migration |
| `memory_import` | Import entries previously produced by `memory_export`. Dimensions must match the current database |

The auto-indexer uses 8-dim keyword embeddings (HNSW), so `memory_init` defaults to dimensions=8. ONNX 384-dim embeddings are available separately via the embed server for opt-in flows.

### Embeddings

| Tool | Purpose |
|---|---|
| `embed` | ONNX or keyword embeddings, dispatched by `type` |

### Neural learning (SONA)

| Tool | Purpose |
|---|---|
| `neural_observe` | Submit an observation to the SONA learning engine |
| `neural_transform` | Apply learned LoRA-style transformation to an embedding |
| `neural_learn` | Force a background learning cycle |

### Hooks & Routing

| Tool | Purpose |
|---|---|
| `hooks_pre_task` | Pre-task routing recommendation |
| `hooks_post_task` | Record outcome for Q-learning and persist the Q-table |
| `route` | Q-learning, keyword, and hybrid task routing |
| `q_table_seed` | Seed the Q-table with baseline entries |

### Analysis

| Tool | Purpose |
|---|---|
| `analyze` | Diff, commit, or complexity analysis (`type: diff|commit|complexity`) |
| `ast` | AST analysis, batch analysis, or language detection |
| `security_scan` | npm audit + tracked-secret checks |
| `perf_benchmark` | Vector insert/search benchmark |
| `git_context` | Current branch, status, recent commits, staged/unstaged changes |

### Proxy / LLM Gateway

| Tool | Purpose |
|---|---|
| `proxy_chat` | Chat completion through the gateway |
| `proxy_health` | Gateway health probe |
| `proxy_shield_check` | Prompt-injection / content safety check |
| `proxy_compress` | Token compression and message pruning |
| `proxy_analyze_text` | Lightweight text analysis |
| `proxy_segment` | Segment a long prompt for downstream providers |
| `proxy_estimate_cost` | Estimate token cost for a prompt |

### Graph

| Tool | Purpose |
|---|---|
| `graph_bootstrap` | Initialize the knowledge graph with project metadata |
| `graph_neighbors` | k-hop neighborhood query |
| `graph_stats` | Knowledge graph statistics |

### Skills & Distillation

| Tool | Purpose |
|---|---|
| `skills_sync` | Distill `SKILL.md` files to TOON format |
| `skills_list` | List distilled skills |
| `skills_detect` | Detect project technologies and recommend skills |
| `distill_markdown` | Convert Markdown to TOON |
| `distill_file` | Distill a Markdown file to TOON |

### PDF

| Tool | Purpose |
|---|---|
| `pdf_to_markdown` | Convert a local PDF file to Markdown |

Backed by [`pdfrs`](https://crates.io/crates/pdfrs) — pure Rust, no Poppler/PDFium/Python. Native/selectable text only (headings, lists, code blocks, simple column-aligned tables); scanned PDFs with no embedded text layer are **not OCR'd** and yield empty/near-empty output. Known quirk: `pdfrs` (a young, actively-developed crate — pin the exact version) sometimes emits a trailing page-number line (e.g. a lone `1`) in the output; strip it downstream if that matters for your use case. Also available as `aiyoucli pdf2md <file.pdf> [--out file.md]` on the CLI. DOCX/PPTX/XLSX and OCR-for-scanned-PDFs are deliberately out of scope for now — see the [`markdownify`](https://crates.io/crates/markdownify) crate (pure Rust, MIT) as the likely next step for office formats.

### Dispatch semantics

Tool dispatch includes production hardening: circuit breaker (threshold=10, reset=15s) and retry with exponential backoff (1 retry, 500ms base). Each tool returns `{ ok, text, isError? }` over JSON-RPC; the runtime registry is the source of truth for which tools are reachable.

### Notes on removed surfaces

- Per-agent / per-swarm / per-task / per-session tools are intentionally absent. Coordination lives in `@aiyou-dev/team` (OpenCode).
- `metrics_*` were removed; cost/latency/memory/tool stats are now exposed via `stats` scopes.
- Deep research (`rd_*`) is implemented internally but not registered. Finish it before exposing — see `../ROADMAP.md`.
- Local model management tools were removed; the gateway handles remote providers.
