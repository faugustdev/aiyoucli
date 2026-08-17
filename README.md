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
| **Surface area** | 21 CLI commands · 44 MCP tools · 8 agent roles · 12 Rust crates (2 aiyoucli + 10 aiyouvector) |
| **Footprint** | 6,441 lines of TypeScript — 65× smaller than comparable tools |
| **Runtime cost** | Zero runtime dependencies. A single NAPI binary handles all compute |
| **Latency** | Model tier selection in 0.04ms · Neural learning in 0.18ms · Graph k-hop in 0.08ms |

---

## Ecosystem

```
                    ┌──────────────────────────────┐
                    │          aiyoucli             │
                    │   CLI + MCP Server (TS)       │
                    │   21 commands · 44 MCP tools  │
                    └─────┬──────────┬──────────────┘
                          │          │
              ┌───────────┘          └───────────┐
              ▼                                  ▼
   ┌──────────────────┐              ┌──────────────────────┐
   │   @aiyou-dev/team │              │    aiyouvector        │
   │  Agent Teams (TS) │              │  Knowledge Graph (Rust)│
   │  8 agent roles    │              │  10 crates · SQLite    │
   │  OpenCode plugin  │              │  Tree-sitter · FFI     │
   └──────────────────┘              └──────────────────────┘
```

`aiyouvector` has no MCP server or CLI-facing process of its own — nobody
uses it directly. `aiyoucli-napi` links its Rust crates in-process (NAPI)
and `aiyoucli` is the only thing that ever talks to it: as a CLI
(`aiyoucli codebase ...`, primary) and as 3 consolidated MCP tools
(secondary, for MCP-only hosts).

| Component | Package | Purpose |
|-----------|---------|---------|
| **aiyoucli** | `@aiyou-dev/cli` | CLI + MCP server. Orchestration layer, production middleware, developer experience |
| **aiyou-team** | `@aiyou-dev/team` | Structured agent teams with role specialization, quality gates, and OpenCode plugin integration |
| **aiyouvector** | `aiyouvector-*` (Rust) | Codebase knowledge graph, vector engine, developer profile, neural learning, attention routing — linked into `aiyoucli` via FFI, no standalone server |

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

- **OpenCode** — `plugin: ["@aiyou-dev/team"]` in `opencode.json` registers the 8 agents automatically when OpenCode loads.
- **Claude Code** — `aiyoucli init --tool claude --with-agents` writes `.claude/agents/*.md` for all 8 agents so Claude Code's `task` tool can dispatch to them. Off by default.

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

### Codebase (indexing, search, graph queries)

Primary interface for the `aiyouvector` knowledge-graph engine — CLI-first
by design (see [Codebase Knowledge Graph](#codebase-knowledge-graph-aiyouvector)
below for why). Every subcommand calls the same underlying function the
`codebase_project`/`codebase_query`/`codebase_maintenance` MCP tools call —
no duplicated logic, just two front doors to one FFI layer.

```
aiyoucli codebase index <path> [--mode full|moderate|fast|cross-repo-intelligence]
aiyoucli codebase list                                List indexed projects
aiyoucli codebase delete <project>                    Remove a project's index
aiyoucli codebase status <project>                     Node/edge/file counts, schema
aiyoucli codebase search <project> --query <q>         BM25 or --name-pattern search
aiyoucli codebase trace <project> <function>            BFS call-graph trace
aiyoucli codebase changes <project>                     Tracked-file count (not a git diff)
aiyoucli codebase query <project> "<cypher>"            Cypher-style graph query
aiyoucli codebase schema <project>                      Node labels + edge types
aiyoucli codebase snippet <project> <qualified_name>    Source of a symbol
aiyoucli codebase architecture <project>                Community-detected clusters
aiyoucli codebase verify [--init] [--strict]            Check the on-disk manifest
aiyoucli codebase export <project> [--out-dir <d>]      Archive a project
aiyoucli codebase import <archive>                      Restore a project archive
aiyoucli codebase observe <path>                        Observer/SONA learning pass, no re-index
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

### Claude Code

Claude Code has no plugin mechanism like OpenCode's, so aiyoucli writes the 8 agent identities as project files at `init` time:

```bash
aiyoucli init --tool claude --with-agents
```

This writes `.claude/agents/<name>.md` for each of the 8 agents:

- `coding-leader` (opus) — execution-first orchestrator
- `coordination-leader` (sonnet) — plan-first coordinator
- `coding-executor` (opus) — direct implementation
- `codebase-explorer` (haiku) — read-only code search
- `web-researcher` (sonnet) — external docs research
- `reviewer` (sonnet) — code review gate
- `principal-advisor` (sonnet) — strategic advisory
- `multimodal-looker` (sonnet) — visual interpretation

Each file has a YAML frontmatter (`name`, `description`, `tools`, `model`) and a hand-authored system prompt body. Re-running `init` is a no-op (idempotent); use `--force` to refresh.

### i18n

Full translations for **English** and **Spanish**. Agent prompts, team manifest, and all documentation sections.

```sh
aiyou-team setup --language es    # Spanish
aiyou-team setup --language en    # English (default)
```

---

## Codebase Knowledge Graph (`aiyouvector`)

A Rust-native engine that indexes your codebase into a queryable knowledge
graph. **`aiyouvector` has no MCP server or standalone client-facing
process** — nobody uses it directly. `aiyoucli-napi` links its crates
in-process (FFI) and `aiyoucli` is the only consumer: the `codebase`
CLI command family above is the primary interface (discoverable via
`--help`, no standing MCP-schema cost — see
[mcp2cli](https://pypi.org/project/mcp2cli/)'s "save 96-99% of the
tokens wasted on tool schemas every turn" for the reasoning); 3
consolidated MCP tools (`codebase_project`, `codebase_query`,
`codebase_maintenance`) are the secondary path, for MCP-only hosts that
can't run a shell command. `aiyouvector` also ships a standalone CLI
binary (`aiyouvector index/search/query/...`) for direct human use, and
`aiyouvector serve` (feature `visual`) — a separate, human-only 3D
graph-ui viewer, unrelated to the agent-facing surface above.

### Architecture

```
Layer 4 — Codebase         codebase (indexer, BM25/cypher, metagraph/gnn/solver
                            sub-modules, verifier, exporter, graph-ui [visual])
Layer 3 — Learning          profile · sona · observer · watchdog
Layer 2 — Intelligence      routing · attention · embeddings
Layer 1 — Foundation        core (HNSW + SIMD + redb) · graph
```

### 10 Crates

| Crate | Function |
|-------|----------|
| `aiyouvector-codebase` | Codebase indexing: tree-sitter parsing, search, tracing, Cypher, graph-ui server |
| `aiyouvector-core` | Vector engine: HNSW, SIMD distance, redb storage, quantization |
| `aiyouvector-graph` | Knowledge graph: typed nodes/edges, BFS, CSR export, redb persistence |
| `aiyouvector-profile` | Developer profile: pattern matching, preference graph, temporal analysis |
| `aiyouvector-sona` | Self-learning: MicroLoRA (rank 2), REINFORCE, EWC++ consolidation |
| `aiyouvector-attention` | Attention mechanisms: scaled-dot, multi-head, flash, linear |
| `aiyouvector-embeddings` | Feature-hashing text embedder (n-gram + hashing trick), <1μs/embed |
| `aiyouvector-routing` | Model-tier routing with Q-learning router |
| `aiyouvector-observer` | Filesystem watcher + SimHash embedder |
| `aiyouvector-watchdog` | Agent session context + memory change notifications |

`metagraph`/`gnn`/`solver` are sub-modules inside `aiyouvector-codebase`,
not separate crates.

### Indexing Pipeline

```
1. Parallel parse (tree-sitter, rayon)    ─── 18 languages
2. Extract symbols → graph nodes          ─── 17 node kinds
3. Extract relationships → graph edges    ─── 21 edge kinds
4. Update file hashes (SHA256)            ─── incremental indexing
5. Rebuild FTS5 full-text index           ─── BM25 search ready
```

**Supported languages**: Rust, TypeScript/TSX, JavaScript/JSX, Python, Go, Java, C, C++, C#, Ruby, PHP, Scala, Kotlin, Swift, Vue, Svelte, YAML, JSON, Markdown, HTML, CSS, Bash

### Access (CLI-first, MCP secondary)

See [Codebase (indexing, search, graph queries)](#codebase-indexing-search-graph-queries)
above for the full `aiyoucli codebase ...` command list — that's the
primary interface. The same 14 operations are also reachable over MCP
as 3 mode-dispatched tools (not one tool per operation — see
[MCP Server](#mcp-server) below):

| MCP tool | modes |
|----------|-------|
| `codebase_project` | `index`, `list`, `delete`, `export`, `import` |
| `codebase_query` | `status`, `search`, `trace`, `changes`, `cypher`, `schema`, `snippet`, `architecture` |
| `codebase_maintenance` | `verify`, `observe` |

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

44 tools across 22 modules, all from a single server. Any MCP-compatible
client can use them; `aiyouvector` has no MCP server of its own — its
codebase-indexing capability is consolidated into this same process via
FFI (see [Codebase Knowledge Graph](#codebase-knowledge-graph-aiyouvector)).

### Configuration

```jsonc
// .mcp.json
{
  "mcpServers": {
    "aiyoucli": {
      "command": "npx",
      "args": ["@aiyou-dev/cli", "mcp", "start"]
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
| **Codebase (aiyouvector via FFI)** | Index, search, trace, Cypher, architecture, schema, snippets |
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
    "aiyoucli": { "type": "stdio", "command": "npx", "args": ["@aiyou-dev/cli", "mcp", "start"] }
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
│                    aiyouvector (10 crates)                    │
│  codebase (incl. solver/gnn/metagraph submodules) · graph      │
│  profile · embeddings · sona · attention · routing             │
│  observer · watchdog · core                                   │
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
