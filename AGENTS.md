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
        index.ts                      # Registers 41 MCP tools
        memory-tools.ts               # Persistent vector memory
        hooks-tools.ts                # Q-learning lifecycle hooks
        config-tools.ts               # Configuration get/set
        system-tools.ts               # Health diagnostics
        analyze-tools.ts              # Diff, commit, and complexity analysis
        neural-tools.ts               # SONA learning
        gcc-tools.ts                  # Git context
        security-tools.ts             # Security scan
        performance-tools.ts          # Vector benchmark
        distiller-tools.ts            # TOON distillation
        skills-tools.ts               # Skill sync, list, and detection
        proxy-tools.ts                # LLM gateway operations
        ast-tools.ts                  # Multi-language AST analysis
        discovery-tools.ts            # Capabilities and versions
        route-tools.ts                # Q-learning and semantic routing
        status-tools.ts               # System and statusline views
        stats-tools.ts                # Subsystem metrics
        embed-tools.ts                # ONNX and keyword embeddings
        graph-tools.ts                # Knowledge graph operations

    commands/
      index.ts                        # CLI commands — thin wrappers calling MCP tools

    statusline/
      generator.ts                    # Statusline renderer + standalone CJS script generator

    init/
      agentsmd-generator.ts           # Generates AGENTS.md (universal standard)
      settings-generator.ts           # Generates CLAUDE.md, GEMINI.md, .claude/settings.json, statusline.cjs
      wire-validate.ts                # Phase 2 — Environment probe (node, git, napi, aiyou-team)
      verify.ts                       # Phase 4 — Health verification (doctor, NAPI, capabilities)
      warmup.ts                       # Phase 3 — Warmup orchestrator (memory, graph, q-table, neural baseline, proxy, skills, index)
      indexer-chunk.ts                # File chunking (2000 chars + 200 overlap)
      indexer-embed.ts                # Parallel embedding + storage (max 8 concurrent)
      indexer-auto.ts                 # Git-aware auto-indexer with manifest tracking

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
    verify.test.ts                    # Phase 4 verify report rendering tests
    wire-validate.test.ts             # Phase 2 wire validation tests
    warmup.test.ts                    # Phase 3 warmup orchestrator tests
    indexer-chunk.test.ts             # File chunking tests
    indexer-auto.test.ts              # Git-aware auto-indexer tests
```

## CLI Commands

Run `aiyoucli --help` for the live command tree. The current set covers:

- **Bootstrap**: `init`, `setup`, `doctor`, `status`, `statusline`
- **MCP**: `mcp start|status|tools`
- **Memory**: `memory init|store|search|list|stats|delete`
- **Learning**: `neural observe|learn|stats`, `hooks route|pre-task|post-task|stats`
- **Routing**: `route <description>`
- **Analysis**: `analyze diff|commit|complexity`, `security scan`, `performance benchmark`
- **Graph**: `graph bootstrap|neighbors|stats`, `daemon`
- **Skills**: `skills sync|list|detect`
- **Git**: `gcc`
- **Ext**: `team` (delegates to `@aiyou-dev/team`)
- **Config**: `config get|set`
- **Meta**: `completions`, `update`

Agent orchestration is owned by `@aiyou-dev/team` (OpenCode plugin). Claude Code support for the same team is deferred — see `plans/aiyoucli-deferred-work.md`.

## MCP Tools

The CLI exposes 41 tools via MCP protocol (JSON-RPC over stdio). Claude Code, Gemini CLI, or any MCP client can call these tools.

The live list is authoritative — run `aiyoucli mcp tools` to see the current registry. Hardcoded counts in this document are stale the moment a tool is added or removed.

Tool dispatch includes production hardening: circuit breaker (threshold=10, reset=15s) and retry with exponential backoff (1 retry, 500ms base).

Discovery tools expose aiyouvector and aiyou-team to MCP clients:

| Tool | Description |
|---|---|
| `capabilities` | Reports NAPI features, aiyouvector integration, aiyou-team availability, embed server status |
| `version` | Version info for aiyoucli, aiyouvector, aiyou-team, runtime env |

AST TypeScript bridge: `src/napi/proxy.ts` — adds `analyzeCode`, `analyzeCodeBatch`, `detectLanguage`, `semanticRoute`, `semanticRouteHybrid`, `semanticEmbed`, `semanticStats` to `ProxyEngineHandle`.

Deep research (`rd_*`) is implemented internally but not registered on the MCP surface. Finish it before exposing it — see `plans/aiyoucli-deferred-work.md`.

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
aiyoucli  Francisco August  |  main +3~1  |  Opus 4.6 (1M context)  |  12m30s
  41 mcp tools available

# With Claude Code stdin data (context %, cost)
aiyoucli  Francisco August  |  main +3~1  |  Opus 4.6 (1M context)  |  213m56s  |  40% ctx  |  $48.29
  41 mcp tools available
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

## Init Phases

`aiyoucli init` runs 4 phases in sequence. Each phase is independent — failures in later phases don't block earlier progress.

| Phase | Name | Module | Purpose |
|-------|------|--------|---------|
| 1 | Write | `agentsmd-generator.ts`, `settings-generator.ts` | Generate AGENTS.md, CLAUDE.md, GEMINI.md, settings, statusline |
| 2 | Wire | `wire-validate.ts` | Probe node, git, napi, aiyou-team binaries (read-only) |
| 2b | Team Setup | `team-setup.ts` | Auto-install aiyou-team if missing |
| 3 | Warmup | `warmup.ts` | Initialize memory, graph, q-table, neural baseline, proxy health, skills detect, auto-index |
| 4 | Verify | `verify.ts` | Aggregate health signals (doctor, capabilities, memory) |

### Phase 3 — Warmup Steps

The warmup orchestrator runs the following steps (each independent — failures don't block others):

1. `memory_init` — Initialize HNSW 8-dim vector memory (keyword embeddings)
2. `graph_bootstrap` — Bootstrap knowledge graph with project metadata
3. `q_table_seed` — Seed Q-Learning routing table with 24 entries
4. `neural_observe` — Submit baseline SONA observation
5. `proxy_health`, `proxy_shield_check` — Proxy engine health checks
6. `skills_detect` — Detect project technologies
7. `auto_index` — Git-aware project indexing (idempotent via manifest)

### Init Flags

| Flag | Purpose |
|------|---------|
| `--force` / `-f` | Overwrite existing files |
| `--skip-skills` | Skip interactive skills setup |
| `--skip-verify` | Skip Phase 4 verification probes (faster init, no MCP calls) |
| `--skip-index` | Skip Phase 3 auto-indexing |
| `--skip-team` | Skip Phase 3 team setup hook |
| `--skip-proxy` | Skip Phase 3 proxy health checks |
| `--tool` / `-t` | Tools to configure: claude, gemini, opencode, all |

## File Persistence

State is stored in `.aiyoucli/` in the project root:

```
.aiyoucli/
  helpers/statusline.cjs  # Standalone statusline script
  config.json             # Project config (optional)
  q-table.json            # Q-Learning persistence (auto-saved)
  vectors.redb            # Vector memory database (HNSW 8-dim, keyword embeddings)
  index-manifest.json     # Auto-indexer manifest (commit + chunk counts)
  metrics/                # Metrics snapshots
  skills/                 # TOON-distilled skill files
```

## Pending Work

| Priority | Feature | Notes |
|----------|---------|-------|
| High | Deep research module (aiyoucli-rd) | Finish internal implementation before exposing — see `plans/aiyoucli-deferred-work.md` |
| High | Claude Code integration for `@aiyou-dev/team` | Mirror the OpenCode plugin flow for Claude Code |
| High | npm packaging + GitHub Actions CI | Cross-platform NAPI builds for 5 targets |
| High | `update` command | Self-update mechanism |
| Done | AST analyzer (regex + language-specific parsers) | Multi-language function/class/import extraction |
| Done | Semantic router (keyword + embedding hybrid) | 8 agent profiles with gateway embedding hybrid |
| Done | HNSW 8-dim keyword embeddings | Default for auto-indexed vectors |
| Done | Q-table persistence to disk | Auto-save to .aiyoucli/q-table.json |
| Done | ONNX embedding server | Local all-MiniLM-L6-v2 on port 8001 (opt-in) |
| Done | Consolidated proxy into aiyoucli-napi | Single NAPI binary — LLM gateway, cache, shield, firewall, AST, semantic |
| Low | Plugin system | Deferred |
| Low | IPFS pattern sharing | Deferred |
