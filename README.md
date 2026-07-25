# aiyoucli

> **AI agent infrastructure for developers.** Rust-powered vector intelligence, structured agent teams, and codebase knowledge graphs — unified through a single CLI and MCP server.

[![npm version](https://img.shields.io/npm/v/@aiyou-dev/cli)](https://www.npmjs.com/package/@aiyou-dev/cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen)](https://www.npmjs.com/package/@aiyou-dev/cli)
[![node](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org)

[Read in Español](README.es.md)

---

## Why aiyoucli

| Signal | Value |
|--------|-------|
| **Surface area** | 25 CLI commands · 84 MCP tools · 8 agent roles · 17 Rust crates |
| **Footprint** | 6,441 lines of TypeScript — 65× smaller than comparable tools |
| **Runtime cost** | Zero runtime dependencies. A single NAPI binary handles all compute |
| **Latency** | Model tier selection in 0.04ms · Neural learning in 0.18ms · Graph k-hop in 0.08ms |

---

## Ecosystem

```
                    ┌──────────────────────────────┐
                    │          aiyoucli             │
                    │   CLI + MCP Server (TS)       │
                    │   25 commands · 84 MCP tools  │
                    └─────┬──────────┬──────────────┘
                          │          │
              ┌───────────┘          └───────────┐
              ▼                                  ▼
   ┌──────────────────┐              ┌──────────────────────┐
   │   @aiyou-dev/team │              │    aiyouvector        │
   │  Agent Teams (TS) │              │  Knowledge Graph (Rust)│
   │  8 agent roles    │              │  17 crates · SQLite    │
   │  OpenCode plugin  │              │  Tree-sitter · MCP     │
   └──────────────────┘              └──────────────────────┘
```

| Component | Package | Purpose |
|-----------|---------|---------|
| **aiyoucli** | `@aiyou-dev/cli` | CLI + MCP server. Orchestration layer, production middleware, developer experience |
| **aiyou-team** | `@aiyou-dev/team` | Structured agent teams with role specialization, quality gates, and OpenCode plugin integration |
| **aiyouvector** | `aiyouvector-*` (Rust) | Codebase knowledge graph, vector engine, developer profile, neural learning, attention routing |

---

## Quick Start

```sh
# Install globally
npm install -g @aiyou-dev/cli

# Initialize project (AGENTS.md, MCP config, skills, statusline)
aiyoucli init

# For OpenCode specifically
aiyoucli init --tool opencode

# Health check
aiyoucli doctor
```

---

## CLI Commands

### Core

```
aiyoucli init                          Initialize project — AGENTS.md, settings, skills, statusline
aiyoucli setup                         Global setup — install aiyou-team for OpenCode
aiyoucli status                        System status overview
aiyoucli doctor                        Health diagnostics (Node ≥ 20, NAPI, git)
aiyoucli config get --key <path>       Read config value (dot-notation)
aiyoucli config set --key <path> -v    Write config value
aiyoucli completions --shell <shell>   Generate shell completions (bash/zsh)
aiyoucli statusline                    Rich terminal dashboard
aiyoucli gcc                           Git context (branch, status, commits, diffs)
```

### Agent Team

Agent orchestration is provided by the `@aiyou-dev/team` OpenCode plugin. Use `aiyoucli setup` and `aiyoucli team` to install and manage it.

### Intelligence

```
aiyoucli memory init --path <p> --dimensions <d>    Initialize vector store
aiyoucli memory store --vector <v> --id <id>        Store embedding
aiyoucli memory search --vector <v> --k <n>         K-NN similarity search
aiyoucli memory list                                 List stored vectors
aiyoucli memory stats                                Database statistics
aiyoucli memory delete --id <id>                     Remove vector

aiyoucli neural observe --embedding <e> --quality <q> --kind <k>
aiyoucli neural learn                                Force learning cycle
aiyoucli neural stats                                SONA engine statistics

aiyoucli analyze diff --diff <d>                     Classify git diff
aiyoucli analyze commit --message <m>                Classify commit (conventional)
aiyoucli analyze complexity --source <s>             Code complexity scoring

aiyoucli route --task <description>                  Q-learning task routing
aiyoucli hooks route --task <description>            Hook-based routing
aiyoucli hooks pre-task --description <d>            Pre-task hook
aiyoucli hooks post-task --description <d>           Post-task hook
aiyoucli hooks stats                                 Routing statistics

aiyoucli security scan                               Security audit
aiyoucli performance benchmark --vectors <n>         Vector benchmarks
```

### MCP & Skills

```
aiyoucli mcp start                                   Start MCP stdio server
aiyoucli mcp status                                  Server status
aiyoucli mcp tools                                   List available tools

aiyoucli skills sync                                 Sync & distill skills to TOON
aiyoucli skills list                                 List installed skills
aiyoucli skills detect                               Detect project technologies
```

---

## Agent Teams (`@aiyou-dev/team`)

Structured agent teams with role specialization, evidence-driven quality gates, and full OpenCode plugin integration.

### The Coding Team

One embedded team. Eight specialized roles. Single active owner at any time.

| Role | Archetype | Model Tier | Purpose |
|------|-----------|------------|---------|
| **CodingLeader** | executor + orchestrator | flagship | Primary execution owner. Persistent, pragmatic, closure-oriented |
| **CoordinationLeader** | orchestrator | strong | Management-style opening for high-ambiguity tasks. Plans, narrows, delegates |
| **CodingExecutor** | executor | flagship | Pure execution leaf. Finishes the job. Never delegates implementation |
| **CodebaseExplorer** | researcher | fast | Read-only in-repo specialist. 3+ parallel search angles. Absolute paths |
| **WebResearcher** | researcher | balanced | Read-only external specialist. Evidence > speculation. Official docs first |
| **Reviewer** | reviewer | strong | Default-approve. Max 3 blocking issues. 80% clarity = approve |
| **PrincipalAdvisor** | advisor | strong | Senior read-only advisor. One recommendation. Max 7 action steps |
| **MultimodalLooker** | interpreter | balanced | PDF/image/screenshot interpreter. Vision-capable models required |

### Design Principles

```
Single Active Owner → Evidence-Driven → Quality Gates → Minimal Delegation
```

- **Single active owner**: Exactly one agent holds the main context and drives to closure
- **Evidence required**: All claims need verification. Diagnostics + build + tests must pass
- **Default-approve review**: Reviewer rejects only for true blockers (max 3 issues)
- **Read-only specialists**: Explorer, Researcher, Reviewer, Advisor, and Looker cannot modify files
- **No silent failures**: No `as any`, `@ts-ignore`, empty catches, or deleting failing tests
- **Todo discipline**: 2+ step tasks require structured tracking with single `in_progress` at a time
- **Instruction precedence**: Platform > Repository > Team > Agent > Task

### Workflow

```
Receive → Localize Evidence → Plan/Delegate → Implement → Review → Verify → Summarize
```

### OpenCode Plugin

aiyou-team ships as a first-class OpenCode plugin:

```jsonc
// opencode.json
{
  "plugin": ["@aiyou-dev/team"]
}
```

### i18n

Full translations for **English** and **Spanish**. Agent prompts, team manifest, and all documentation sections.

```sh
aiyou-team setup --language es    # Spanish
aiyou-team setup --language en    # English (default)
```

---

## Codebase Knowledge Graph (`aiyouvector`)

A Rust-native engine that indexes your codebase into a queryable knowledge graph with 17 specialized crates.

### Architecture

```
Layer 4 — Interface        cli · server (HTTP/REST) · mcp
Layer 3 — Intelligence     graph · attention · solver · gnn
Layer 2 — Learning         profile · sona · observer · watchdog
Layer 1 — Foundation       core (HNSW + SIMD + redb) · daemon
```

### 17 Crates

| Crate | Function |
|-------|----------|
| `aiyouvector-core` | Vector engine: HNSW, SIMD distance, redb storage, quantization |
| `aiyouvector-graph` | Knowledge graph: typed nodes/edges, BFS, CSR export |
| `aiyouvector-codebase` | Codebase indexing: tree-sitter parsing, search, tracing, MCP server |
| `aiyouvector-metagraph` | Cross-project meta-graph: graph-of-graphs, relationship detection |
| `aiyouvector-profile` | Developer profile: pattern matching, preference graph, temporal analysis |
| `aiyouvector-sona` | Self-learning: MicroLoRA (rank 2), REINFORCE, EWC++ consolidation |
| `aiyouvector-attention` | Attention mechanisms: scaled-dot, multi-head, flash, linear |
| `aiyouvector-solver` | Sublinear solvers: Forward Push PPR, Conjugate Gradient, Neumann |
| `aiyouvector-gnn` | Graph Neural Network with neighbor aggregation |
| `aiyouvector-embeddings` | Feature-hashing text embedder (n-gram + hashing trick), <1μs/embed |
| `aiyouvector-routing` | Model-tier routing with Q-learning router |
| `aiyouvector-observer` | Filesystem watcher + SimHash embedder |
| `aiyouvector-watchdog` | Agent session context + memory change notifications |
| `aiyouvector-daemon` | Global daemon with Unix socket IPC |
| `aiyouvector-server` | HTTP/REST API server (axum) |
| `aiyouvector-visual` | Graph visualization HTTP API |
| `aiyouvector-cli` | Standalone CLI: init, search, profile, collections, daemon |

### Indexing Pipeline

```
1. Parallel parse (tree-sitter, rayon)    ─── 18 languages
2. Extract symbols → graph nodes          ─── 17 node kinds
3. Extract relationships → graph edges    ─── 21 edge kinds
4. Update file hashes (SHA256)            ─── incremental indexing
5. Rebuild FTS5 full-text index           ─── BM25 search ready
```

**Supported languages**: Rust, TypeScript/TSX, JavaScript/JSX, Python, Go, Java, C, C++, C#, Ruby, PHP, Scala, Kotlin, Swift, Vue, Svelte, YAML, JSON, Markdown, HTML, CSS, Bash

### MCP Tools (14 graph tools)

```
index_repository              Index a repo (full/moderate/fast/cross-repo)
list_projects                 List all indexed projects with stats
delete_project                Remove a project database
index_status                  Node/edge/file counts, labels, edge types
search_graph                  BM25 or regex name search with label filter
search_code                   Graph-augmented grep with function-level dedup
trace_path                    BFS call/dependency tracing (inbound/outbound/both)
detect_changes                Track file changes since last index
query_graph                   Execute Cypher queries against the graph
get_graph_schema              Node labels and edge types
get_code_snippet              Read source code for a qualified name
get_architecture              Leiden community detection clusters
manage_adr                    Architecture Decision Record CRUD
ingest_traces                 Ingest runtime execution traces
```

### Cypher Query Support

```cypher
MATCH (n:Function)-[:Calls]->(m:Function)
WHERE n.name = "handleRequest"
RETURN n, m
LIMIT 10
```

Compiles to recursive SQL CTEs with depth limit of 5. Supports `MATCH`, `WHERE`, `RETURN`, `LIMIT`.

### Search Modes

| Mode | Method | Use Case |
|------|--------|----------|
| **BM25** | FTS5 full-text with camelCase splitting | Name search, keyword lookup |
| **Vector** | Cosine similarity on 768-dim embeddings | Semantic search |
| **Hybrid** | Reciprocal Rank Fusion (k=60) | Best of both worlds |
| **Regex** | Name pattern matching | Wildcard queries |

### Developer Profile (Learning)

Three-tier learning loop that runs locally with zero network calls:

| Loop | Frequency | Action |
|------|-----------|--------|
| **A — Instant** | Per observation | MicroLoRA gradient accumulation (rank 2, ~500 params) |
| **B — Hourly** | 3600s interval | Drain buffer, process signals, flush gradients |
| **C — Weekly** | 604800s interval | Decay, K-means++ re-cluster, prune low-confidence patterns |

### Community Detection

Leiden-like label propagation with configurable resolution. Returns clusters with cohesion scores (internal_edges / total_edges).

---

## MCP Server

84 tools across 24 modules. Any MCP-compatible client can use them.

### Configuration

```jsonc
// .mcp.json
{
  "mcpServers": {
    "aiyoucli": {
      "command": "npx",
      "args": ["@aiyou-dev/cli", "mcp", "start"]
    },
    "aiyouvector": {
      "command": "aiyouvector-codebase",
      "args": ["mcp"]
    }
  }
}
```

### Tool Categories

| Module | Highlights |
|--------|------------|
| **Metrics** | Token tracking, cost calculation, latency percentiles, memory usage |
| **Proxy Gateway** | Chat completions, prompt-injection shield, compression, caching, embedding, segmentation |
| **Vector Memory** | HNSW persistent storage (redb), insert/search/delete/count/stats |
| **Semantic Router** | Keyword + embedding hybrid routing |
| **Hooks & Lifecycle** | Q-learning routing and pre/post task hooks |
| **Neural Learning** | SONA engine: observe, transform, learn, stats |
| **Code & AST Analysis** | Diff, commit, complexity, and multi-language AST analysis |
| **Skills** | TOON sync, listing, and technology detection |
| **Distiller** | TOON markdown distillation |
| **Graph (aiyouvector)** | Index, search, trace, Cypher, architecture, schema, snippets |
| **Config & System** | Dot-notation configuration and health diagnostics |

---

## OpenCode Integration

aiyoucli integrates with [OpenCode](https://opencode.ai) at multiple levels:

### 1. Plugin System

```jsonc
// opencode.json
{
  "plugin": ["@aiyou-dev/team"],
  "mcp": {
    "aiyoucli": { "type": "stdio", "command": "npx", "args": ["@aiyou-dev/cli", "mcp", "start"] },
    "aiyouvector": { "type": "stdio", "command": "aiyouvector-codebase", "args": ["mcp"] }
  }
}
```

### 2. Agent Teams as OpenCode Sessions

Each agent role maps to an OpenCode session with custom model tier, temperature, tools, and permissions:

| Agent | OpenCode Session | Model Tier | Vision |
|-------|-----------------|------------|--------|
| CodingLeader | `coding-leader` | flagship | — |
| CoordinationLeader | `coordination-leader` | strong | — |
| CodingExecutor | `coding-executor` | flagship | — |
| CodebaseExplorer | `codebase-explorer` | fast | — |
| WebResearcher | `web-researcher` | balanced | — |
| Reviewer | `reviewer` | strong | — |
| PrincipalAdvisor | `principal-advisor` | strong | — |
| MultimodalLooker | `multimodal-looker` | balanced | required |

### 3. Statusline Hook

Rich terminal dashboard showing vectors, tests, git status, model, and context — only data that actually exists.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     CLI / MCP Server                          │
│                      (TypeScript)                             │
│   CLI commands · MCP tools · production middleware             │
│   Circuit breaker · Rate limiter · Retry + exponential backoff│
├──────────────────────────────────────────────────────────────┤
│                    NAPI Bridge (two binaries)                 │
│                    aiyoucli-napi (6.8MB) + aiyoucli-rd        │
├──────────────────────────────────────────────────────────────┤
│                     Rust Engines                              │
│                                                               │
│  vector    HNSW + SIMD       │  Gateway routing + cache       │
│  sona      MicroLoRA+EWC++   │  Shield + firewall             │
│  attention 4 mechanisms      │  Compression + segmentation    │
│  routing   Q-learning        │  AST analysis (6 languages)    │
│  graph     k-hop + BFS       │  Semantic routing (hybrid)     │
│  analysis  diff/commit/      │  Embedding (ONNX client)       │
│            complexity        │                                 │
│  detector  45+ techs         │  Research orchestration (rd)    │
│  distiller TOON format       │  Web search + doc processing   │
├──────────────────────────────────────────────────────────────┤
│                    aiyouvector (17 crates)                    │
│  codebase graph · profile · embeddings · solver · gnn         │
│  metagraph · observer · watchdog · daemon · server             │
└──────────────────────────────────────────────────────────────┘
```

**Design**: TypeScript handles I/O, MCP protocol, and production middleware. All compute crosses the NAPI bridge into Rust, where operations complete in microseconds.

---

## Performance

Benchmarks on Apple M-series. All in-process, no network calls.

| Operation | Latency | Throughput |
|-----------|--------:|-----------:|
| Model tier selection | 0.04ms | 23,923 ops/s |
| Graph k-hop (100 nodes) | 0.08ms | 13,158 ops/s |
| Task routing | 0.11ms | 8,718 ops/s |
| Complexity analysis | 0.15ms | 6,631 ops/s |
| Neural learn | 0.18ms | 5,445 ops/s |
| Neural observe | 0.42ms | 2,398 ops/s |
| Vector insert (3D) | 1.87ms | 534 ops/s |
| Vector search (100 vectors) | 3.36ms | 297 ops/s |

---

## Configuration

```sh
aiyoucli config set memory.dimensions 384
aiyoucli config set memory.backend aiyouvector
aiyoucli config set llm.base_url http://127.0.0.1:8000/v1
```

Environment variable overrides:

| Variable | Config Path |
|----------|------------|
| `AIYOUCLI_MEMORY_BACKEND` | `memory.backend` |
| `AIYOUCLI_MEMORY_PATH` | `memory.storagePath` |
| `AIYOUCLI_MEMORY_DIMENSIONS` | `memory.dimensions` |
| `AIYOUCLI_MCP_PORT` | `mcp.port` |
| `AIYOUCLI_VERBOSITY` | `cli.verbosity` |
| `NO_COLOR` | `cli.color = false` |

---

## Platform Support

| Target | Binary |
|--------|--------|
| macOS ARM64 | `@aiyou-dev/cli-darwin-arm64` |
| macOS x64 | `@aiyou-dev/cli-darwin-x64` |
| Linux ARM64 | `@aiyou-dev/cli-linux-arm64-gnu` |
| Linux x64 | `@aiyou-dev/cli-linux-x64-gnu` |
| Windows x64 | `@aiyou-dev/cli-win32-x64-msvc` |

---

## File Structure

```
.aiyoucli/
├── config.json              # Project configuration
├── memory-config.json       # Vector DB config
├── vectors.redb             # Persistent vector database
├── q-table.json             # Q-Learning persistence
├── metrics/*.json           # Metrics snapshots
├── skills/*.dsi.toon        # TOON-distilled skill files
├── helpers/statusline.cjs   # Statusline script
└── agents.dsi.toon          # TOON-distilled AGENTS.md
```

---

## Contributing

```sh
git clone https://github.com/faugustdev/aiyoucli.git
cd aiyoucli
npm install
npm run build       # Rust NAPI + TypeScript
npm test
```

Requires Rust 1.77+ (stable). The NAPI crate depends on aiyouvector crates at `../aiyouvector/crates/`.

---

## License

MIT — [LICENSE](LICENSE)

---

Built by [Francisco August](https://github.com/faugustdev).
