# AGENTS.md — aiyoucli

AI agent CLI with Rust-powered vector intelligence

## Build & Run

```bash
# Install dependencies
npm install

# Build Rust NAPI binary (requires Rust toolchain)
npm run build:rs

# Build TypeScript
npm run build:ts

# Build everything
npm run build

# Dev mode (TS watch)
npm run dev

# Run tests
npm test

# Clean build artifacts
npm run clean
```

### Rust requirements

- Rust 1.77+
- The NAPI crate depends on aiyouvector crates at `../aiyouvector/crates/`. Ensure the aiyouvector repo is cloned as a sibling directory.

### Using the CLI

```bash
# After npm link or npm install -g
aiyoucli --help
aiyoucli doctor
aiyoucli statusline
aiyoucli route --task "implement user auth"
aiyoucli init
```

## Architecture

```
aiyoucli (npm package)
  TypeScript shell (MCP protocol, CLI UX, npm distribution)
    NAPI bindings (src/napi/index.ts, src/napi/proxy.ts)
      Rust core (crates/aiyoucli-napi, 6.8MB binary)
        aiyouvector crates (direct path dependency)
        LLM gateway, cache, shield, firewall, AST, semantic routing (consolidated)
```

### Directory Structure

```
aiyoucli/
  Cargo.toml                          # Rust workspace root
  package.json                        # npm package (ES modules, Node >= 20)
  tsconfig.json                       # TypeScript strict, ES2022, Node16

  crates/
    aiyoucli-napi/                    # Rust NAPI-RS crate (consolidated)
      src/
        lib.rs                        # Module declarations
        vector.rs                     # VectorDB: open, insert, search, delete, count, stats
        sona.rs                       # SONA: submit_observation, transform_embedding, force_learn, stats
        attention.rs                  # AttentionRouter: compute with auto/flat/hierarchical/broad hints
        graph.rs                      # KnowledgeGraph: add_node, add_edge, neighbors, k_hop, remove, stats
        routing.rs                    # Q-Learning router + model tier selection (haiku/sonnet/opus)
        analysis.rs                   # Diff classifier + commit classifier + complexity scorer
        proxy.rs                      # ProxyEngine: LLM gateway, cache, shield, firewall, embeddings, AST, semantic

  bin/
    aiyoucli.js                       # CLI entry point (auto-detects MCP mode vs interactive)
    aiyoucli-mcp.js                   # MCP stdio entry point (always MCP mode)

  src/
    index.ts                          # CLI class — parser, output, config, command dispatch
    parser.ts                         # CommandParser — argv to command path + flags + positional
    output.ts                         # Output formatter — ANSI colors, tables, spinners, verbosity
    config.ts                         # Config loader — file, env vars, defaults
    suggest.ts                        # Fuzzy command suggestion (Levenshtein distance)
    types.ts                          # Core types: Command, Config, MCPTool, errors

    napi/
      index.ts                        # NAPI binary loader + TypeScript type re-exports
      proxy.ts                        # ProxyEngineHandle — TypeScript bridge (loads from aiyoucli-napi)

    metrics/
      collector.ts                    # Metrics collector — tokens, cost, latency, memory, tool calls

    semantic/
      agent-profiles.ts               # 8 agent profiles with keyword scoring + hybrid embeddings

    mcp/
      server.ts                       # MCP stdio JSON-RPC handler (initialize, tools/list, tools/call)
      client.ts                       # Tool registry + dispatch (with circuit breaker + retry)
      types.ts                        # JSON-RPC message types
      tools/
        index.ts                      # Registers all 22 tool modules (76 tools total)
        memory-tools.ts               # 6 tools: init, store, search, count, stats, delete (NAPI)
        agent-tools.ts                # 6 tools: spawn, list, status, stop, record, metrics (file persistence)
        swarm-tools.ts                # 3 tools: init, status, stop (file persistence)
        task-tools.ts                 # 4 tools: create, list, status, complete (file persistence)
        session-tools.ts              # 3 tools: start, end, list (file persistence)
        hooks-tools.ts                # 5 tools: pre_task, post_task, route, model_route, stats (NAPI routing)
        config-tools.ts               # 2 tools: get, set
        system-tools.ts               # 2 tools: status, doctor
        analyze-tools.ts              # 3 tools: diff, commit, complexity (NAPI analysis)
        neural-tools.ts               # 4 tools: observe, transform, learn, stats (NAPI sona)
        gcc-tools.ts                  # 1 tool: git_context
        security-tools.ts             # 1 tool: scan (npm audit + git checks)
        performance-tools.ts          # 1 tool: benchmark (NAPI vector perf)
        coordination-tools.ts         # 1 tool: status (aggregates swarm + agents + tasks)
        statusline-tools.ts           # 1 tool: statusline dashboard
        metrics-tools.ts              # 8 tools: snapshot, record_tokens, cost, memory, latency, tools_summary, save, reset
        distiller-tools.ts            # 2 tools: distill_markdown, distill_file
        skills-tools.ts               # 3 tools: sync, list, detect
        proxy-tools.ts                # 10 tools: chat, health, shield_check, compress, analyze_text, segment, list_models, estimate_cost, embed, cache_stats
        ast-tools.ts                  # 3 tools: ast_analyze, ast_analyze_batch, ast_detect_language
        semantic-tools.ts             # 5 tools: route, route_hybrid, route_enhanced, embed, stats
        models-tools.ts               # 2 tools: list, optimize (GGUF model management + Unsloth recommendations)

    commands/
      index.ts                        # CLI commands — thin wrappers calling MCP tools

    statusline/
      generator.ts                    # Statusline renderer + standalone CJS script generator

    init/
      agentsmd-generator.ts           # Generates AGENTS.md (universal standard)
      settings-generator.ts           # Generates CLAUDE.md, GEMINI.md, .claude/settings.json, statusline.cjs

    services/
      worker-daemon.ts                # EventEmitter-based background worker daemon
      worker-queue.ts                 # Priority task queue (critical > high > normal > low)

    production/
      index.ts                        # Barrel export
      circuit-breaker.ts              # CLOSED -> OPEN -> HALF_OPEN pattern
      retry.ts                        # Exponential backoff + jitter
      rate-limiter.ts                 # Token bucket
      error-handler.ts                # Structured error handling with codes + exit codes

  models/
    embed-server.py                   # FastAPI ONNX embedding server (port 8001, all-MiniLM-L6-v2, 384-dim)
    all-MiniLM-L6-v2/                 # ONNX model files (config.json, model.onnx, model.safetensors, tokenizer.json)

  __tests__/
    napi-smoke.ts                     # Vector DB smoke test
    napi-phase3-smoke.ts              # SONA + Attention + Graph tests (13 tests)
    napi-phase4-smoke.ts              # Routing + Analysis tests (13 tests)
```

## CLI Commands (23)

| Command | Subcommands | What it does |
|---------|-------------|--------------|
| `init` | | Generate AGENTS.md, CLAUDE.md, GEMINI.md, settings, statusline |
| `agent` | spawn, list, status, stop, record, metrics | Agent lifecycle management |
| `swarm` | init, status, stop | Multi-agent swarm coordination |
| `memory` | init, store, search, list, stats, delete | Vector memory via Rust NAPI |
| `mcp` | start, status, tools | MCP server management |
| `task` | create, list, status, complete | Task lifecycle |
| `session` | start, end, list | Session state persistence |
| `hooks` | route, pre-task, post-task, stats | Lifecycle hooks + Q-learning routing |
| `config` | get, set | Configuration management |
| `status` | | System status overview |
| `doctor` | | Health diagnostics (Node, NAPI, git) |
| `neural` | observe, learn, stats | SONA learning engine |
| `security` | scan | npm audit + git secret detection |
| `analyze` | diff, commit, complexity | Code analysis via Rust NAPI |
| `route` | | Task-to-agent routing (Q-learning + model tier) |
| `gcc` | | Git context controller |
| `daemon` | | Background worker daemon |
| `completions` | | Shell completions (bash/zsh) |
| `update` | | Self-update (placeholder) |
| `performance` | benchmark | Vector search benchmarking |
| `statusline` | | Rich status dashboard (supports --json, --generate) |
| `models` | list, optimize | GGUF model management + Unsloth Dynamic v2.0 recommendations |
| `skills` | sync, list, detect | Skill discovery and TOON distillation |
| `rd` | init, search, strategies, status, report, doc | Deep research (strategies, search, documents, knowledge graph) |

## MCP Tools (60)

The CLI exposes 60 tools via MCP protocol (JSON-RPC over stdio). Claude Code, Gemini CLI, or any MCP client can call these tools.

To see all tools: `aiyoucli mcp tools`

Tool dispatch includes production hardening: circuit breaker (threshold=10, reset=15s) and retry with exponential backoff (1 retry, 500ms base).

### Consolidated Tools (8 tools replacing 29)

| Consolidated tool | Replaces | Dispatch param |
|---|---|---|
| `route` | hooks_route, hooks_model_route, semantic_route, semantic_route_hybrid, semantic_route_enhanced | `action: qlearn|model_tier|keyword|hybrid|enhanced` |
| `status` | system_status, coordination_status, statusline, swarm_status | `scope: system|coordination|statusline|swarm` |
| `stats` | memory_stats, agent_metrics, hooks_stats, neural_stats, semantic_stats, proxy_cache_stats, metrics_snapshot | `scope: memory|agents|routing|neural|semantic|cache|full` |
| `metrics` | metrics_record_tokens, cost, memory, latency, tools_summary, save, reset | `action: record_tokens|cost|memory|latency|tools_summary|save|reset` |
| `embed` | proxy_embed, semantic_embed | `type: onnx|keyword` |
| `models` | models_list, models_optimize, models_start, models_stop, models_status, proxy_list_models | `action: list|optimize|start|stop|status|list_remote` |
| `analyze` | analyze_diff, analyze_commit, analyze_complexity | `type: diff|commit|complexity` |
| `ast` | ast_analyze, ast_analyze_batch, ast_detect_language | `mode: analyze|batch|detect` |

### Discovery Tools (2 new — exposes aiyouvector + aiyou-team to MCP clients)

| Tool | Description |
|---|---|
| `capabilities` | Reports NAPI features, aiyouvector integration, aiyou-team availability, embed server status |
| `version` | Version info for aiyoucli, aiyouvector, aiyou-team, runtime env |

AST TypeScript bridge: `src/napi/proxy.ts` — adds `analyzeCode`, `analyzeCodeBatch`, `detectLanguage`, `semanticRoute`, `semanticRouteHybrid`, `semanticEmbed`, `semanticStats` to `ProxyEngineHandle`.

Semantic enhancement: `src/semantic/agent-profiles.ts` — 8 agent profiles with keyword scoring, cosine similarity, hybrid score computation using gateway embeddings with keyword fallback.

### Phase 5 — Deep Research (aiyoucli-rd)

| Tool | Description |
|------|-------------|
| `rd_init` | Initialize a deep research session with strategy and config |
| `rd_search` | Web search across engines (searxng, arxiv, pubmed, semantic-scholar, wikipedia) |
| `rd_document_process` | Process PDF/DOCX/image documents via bgustdown/bgustreadimg pipeline |
| `rd_strategies` | List available research strategies with descriptions |
| `rd_status` | Check research session status |
| `rd_knowledge_graph` | View knowledge graph nodes and connections for a session |
| `rd_citations` | Generate citations from session sources (APA/MLA/Chicago/BibTeX) |
| `rd_report` | Generate markdown/json research report from completed session |

TypeScript bridge: `src/rd/engine.ts` — `ResearchEngine` class with session lifecycle, strategy management, `getResearchEngine()` singleton.

Rust NAPI crate: `crates/aiyoucli-rd/src/lib.rs` — Fast NAPI functions for session creation, strategy listing, document processing (builds independently, no aiyouvector deps).

## ONNX Embedding Server

The local embedding server runs at `http://127.0.0.1:8001/v1/embeddings` using ONNX Runtime with all-MiniLM-L6-v2 (384-dim). It provides fast, local text embeddings without external API calls.

```bash
source /tmp/minio-venv/bin/activate && setsid python3 models/embed-server.py
```

Dependencies: fastapi, uvicorn, onnxruntime, numpy, minio, tokenizers, sentence-transformers (no-deps). The model files are stored in `models/all-MiniLM-L6-v2/` (config.json, model.onnx, model.safetensors, tokenizer.json).

## NAPI Rust Bindings

The Rust NAPI crate (`crates/aiyoucli-napi`) provides all modules exposed to TypeScript:

| Module | Source | Key functions |
|--------|--------|---------------|
| `vector.rs` | aiyouvector-core | VectorDB open/insert/search/delete/stats (HNSW + SIMD + redb) |
| `sona.rs` | aiyouvector-sona | SONA learning: submit_observation, transform_embedding (MicroLoRA), force_learn |
| `attention.rs` | aiyouvector-attention | AttentionRouter: scaled-dot, multi-head, flash, linear — auto-selects by input size |
| `graph.rs` | aiyouvector-graph | KnowledgeGraph: add_node/edge, neighbors, k-hop BFS, CSR export |
| `routing.rs` | aiyouvector-routing | Q-Learning task-to-agent router + model tier selection (haiku/sonnet/opus) |
| `analysis.rs` | new Rust code | Git diff classifier, conventional commit classifier, code complexity scorer |
| `proxy.rs` | consolidated | ProxyEngine: LLM gateway, cache, shield, firewall, compression, AST, semantic routing |
| `llm.rs` | consolidated | LLM provider (OpenAI/Anthropic/Custom) — chat completion, health check |
| `cache.rs` | consolidated | TTL response cache with SHA-256 keys |
| `shield.rs` | consolidated | Prompt injection detection + content safety |
| `firewall.rs` | consolidated | Rate limiting + origin blocklist |
| `compressor.rs` | consolidated | Token compression + message pruning |
| `embeddings.rs` | consolidated | ONNX embedding client (port 8001) |
| `ast.rs` | consolidated | Multi-language AST analyzer (JS/TS/Python/Rust/Go/Java) |
| `semantic.rs` | consolidated | Semantic router: keyword matching + embedding hybrid (8 agents) |

Performance: ~18us/vector insert, ~256us/search query, <0.01ms SONA adaptation.

## Statusline

The statusline shows an honest dashboard — only data that actually exists:

```
# Minimal (no active state)
aiyoucli  Francisco August  |  main +3~1  |  Opus 4.6 (1M context)  |  12m30s
  84 mcp tools available

# With activity
aiyoucli  Francisco August  |  main +3~1  |  Opus 4.6 (1M context)  |  12m30s
  agents 2/8  |  tasks 1 running  3 done  2 queued  |  vectors 150
  84 mcp tools available

# With Claude Code stdin data (context %, cost)
aiyoucli  Francisco August  |  main +3~1  |  Opus 4.6 (1M context)  |  213m56s  |  40% ctx  |  $48.29
  agents 2/8  |  tasks 1 running  3 done  2 queued
  84 mcp tools available
```

Palette: indigo, teal, warm peach, soft green, soft yellow, soft red.

Integrates with:
- **Claude Code**: `.claude/settings.json` statusLine hook
- **Gemini CLI**: via `GEMINI.md` instructions
- **Terminal**: `aiyoucli statusline` directly or standalone `node .aiyoucli/helpers/statusline.cjs`

## Code Style

- TypeScript strict mode, ES2022 target
- Use `node:` protocol for built-in imports (`import { readFileSync } from "node:fs"`)
- Prefer `const` over `let`; avoid `var`
- Use explicit return types on exported functions
- Keep files under 500 lines
- Handle errors explicitly at system boundaries
- MCP tools are the business logic layer — CLI commands are thin wrappers that call tools
- NAPI functions handle all compute-intensive work — TypeScript handles I/O and formatting

## File Persistence

State is stored in `.aiyoucli/` in the project root:

```
.aiyoucli/
  agents/store.json       # Agent registry
  swarm/state.json        # Swarm state
  tasks/store.json        # Task queue
  sessions/*.json         # Session files
  helpers/statusline.cjs  # Standalone statusline script
  config.json             # Project config (optional)
  q-table.json            # Q-Learning persistence (auto-saved)
  metrics/                # Metrics snapshots
  skills/                 # TOON-distilled skill files
```

## Pending Work

| Priority | Feature | Notes |
|----------|---------|-------|
| High | Deep research module (aiyoucli-rd) | Orchestration, web search, document processing, knowledge graph |
| High | npm packaging + GitHub Actions CI | Cross-platform NAPI builds for 5 targets |
| High | `update` command | Self-update mechanism |
| Done | AST analyzer (regex + language-specific parsers) | Multi-language function/class/import extraction |
| Done | Semantic router (keyword + embedding hybrid) | 8 agent profiles with gateway embedding hybrid |
| Done | HNSW index in memory tools | HNSW enabled by default (open + in-memory) |
| Done | Q-table persistence to disk | Auto-save to .aiyoucli/q-table.json |
| Done | ONNX embedding server | Local all-MiniLM-L6-v2 on port 8001 |
| Done | Consolidated proxy into aiyoucli-napi | Single NAPI binary — LLM gateway, cache, shield, firewall, AST, semantic |
| Low | Plugin system | Deferred |
| Low | IPFS pattern sharing | Deferred |
