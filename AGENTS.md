# AGENTS.md — aiyoucli

AI agent CLI with Rust-powered vector intelligence. Part of the aiyou ecosystem.

## Overview

aiyoucli is a CLI tool that provides AI agent orchestration, vector memory, task routing, and code analysis. It uses a **Rust core via NAPI-RS** for performance-critical operations (vector search, SONA learning, attention mechanisms, Q-learning routing, diff classification) and a **TypeScript shell** for MCP protocol, CLI UX, and npm distribution.

### Ecosystem

aiyoucli is one of 3 independent projects:

| Project | What | Location |
|---------|------|----------|
| **aiyoucli** | CLI tool (this repo) | `/Users/august/Dev/personal/aiyoucli` |
| **aiyouvector** | Rust vector database (12 crates) | `/Users/august/Dev/personal/aiyouvector` |
| **aiyoudev** | Orchestrator + web UI (Docker stack) | `/Users/august/Dev/personal/aiyou-dev/aiyou-dev` |

The NAPI crate in aiyoucli depends on aiyouvector crates directly via path — no HTTP, no WASM, in-process Rust calls.

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
    NAPI bindings (src/napi/index.ts)
      Rust core (crates/aiyoucli-napi, 4.3MB binary)
        aiyouvector crates (direct path dependency)
```

### Directory Structure

```
aiyoucli/
  Cargo.toml                          # Rust workspace root
  package.json                        # npm package (ES modules, Node >= 20)
  tsconfig.json                       # TypeScript strict, ES2022, Node16

  crates/
    aiyoucli-napi/                    # Rust NAPI-RS crate
      src/
        lib.rs                        # Module declarations
        vector.rs                     # VectorDB: open, insert, search, delete, count, stats
        sona.rs                       # SONA: submit_observation, transform_embedding, force_learn, stats
        attention.rs                  # AttentionRouter: compute with auto/flat/hierarchical/broad hints
        graph.rs                      # KnowledgeGraph: add_node, add_edge, neighbors, k_hop, remove, stats
        routing.rs                    # Q-Learning router + model tier selection (haiku/sonnet/opus)
        analysis.rs                   # Diff classifier + commit classifier + complexity scorer

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

    mcp/
      server.ts                       # MCP stdio JSON-RPC handler (initialize, tools/list, tools/call)
      client.ts                       # Tool registry + dispatch (with circuit breaker + retry)
      types.ts                        # JSON-RPC message types
      tools/
        index.ts                      # Registers all 15 tool modules (41 tools total)
        memory-tools.ts               # 6 tools: init, store, search, count, stats, delete (NAPI)
        agent-tools.ts                # 4 tools: spawn, list, status, stop (file persistence)
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

    commands/
      index.ts                        # 21 CLI commands — thin wrappers calling MCP tools

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

  __tests__/
    napi-smoke.ts                     # Vector DB smoke test
    napi-phase3-smoke.ts              # SONA + Attention + Graph tests (13 tests)
    napi-phase4-smoke.ts              # Routing + Analysis tests (13 tests)
```

## CLI Commands (21)

| Command | Subcommands | What it does |
|---------|-------------|--------------|
| `init` | | Generate AGENTS.md, CLAUDE.md, GEMINI.md, settings, statusline |
| `agent` | spawn, list, status, stop | Agent lifecycle management |
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

## MCP Tools (41)

The CLI exposes 41 tools via MCP protocol (JSON-RPC over stdio). Claude Code, Gemini CLI, or any MCP client can call these tools.

To see all tools: `aiyoucli mcp tools`

Tool dispatch includes production hardening: circuit breaker (threshold=10, reset=15s) and retry with exponential backoff (1 retry, 500ms base).

## NAPI Rust Bindings

The Rust NAPI crate (`crates/aiyoucli-napi`) provides 6 modules exposed to TypeScript:

| Module | aiyouvector crate | Key functions |
|--------|-------------------|---------------|
| `vector.rs` | aiyouvector-core | VectorDB open/insert/search/delete/stats (HNSW + SIMD + redb) |
| `sona.rs` | aiyouvector-sona | SONA learning: submit_observation, transform_embedding (MicroLoRA), force_learn |
| `attention.rs` | aiyouvector-attention | AttentionRouter: scaled-dot, multi-head, flash, linear — auto-selects by input size |
| `graph.rs` | aiyouvector-graph | KnowledgeGraph: add_node/edge, neighbors, k-hop BFS, CSR export |
| `routing.rs` | (new Rust code) | Q-Learning task-to-agent router + model tier selection (haiku/sonnet/opus) |
| `analysis.rs` | (new Rust code) | Git diff classifier, conventional commit classifier, code complexity scorer |

Performance: ~18us/vector insert, ~256us/search query, <0.01ms SONA adaptation.

## Statusline

The statusline shows an honest dashboard — only data that actually exists:

```
# Minimal (no active state)
aiyoucli  Francisco August  |  main +3~1  |  Opus 4.6 (1M context)  |  12m30s
  41 mcp tools available

# With activity
aiyoucli  Francisco August  |  main +3~1  |  Opus 4.6 (1M context)  |  12m30s
  agents 2/8  |  tasks 1 running  3 done  2 queued  |  vectors 150
  41 mcp tools available

# With Claude Code stdin data (context %, cost)
aiyoucli  Francisco August  |  main +3~1  |  Opus 4.6 (1M context)  |  213m56s  |  40% ctx  |  $48.29
  agents 2/8  |  tasks 1 running  3 done  2 queued
  41 mcp tools available
```

Palette: indigo, teal, warm peach, soft green, soft yellow, soft red.

Integrates with:
- **Claude Code**: `.claude/settings.json` statusLine hook
- **Gemini CLI**: via `GEMINI.md` instructions
- **Terminal**: `aiyoucli statusline` directly or standalone `node .aiyoucli/helpers/statusline.cjs`

## Code Style

- TypeScript strict mode, ES2022 target, Node16 module resolution
- Use `node:` protocol for built-in imports
- Prefer `const` over `let`; avoid `var`
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
```

## Pending Work

| Priority | Feature | Notes |
|----------|---------|-------|
| High | npm packaging + GitHub Actions CI | Cross-platform NAPI builds for 5 targets |
| High | `update` command | Self-update mechanism |
| High | AST analyzer (tree-sitter multi-language) | Currently uses regex-based complexity |
| High | Semantic router (embeddings) | Currently keyword-based heuristic |
| Medium | HNSW index in memory tools | Currently uses flat index |
| Medium | Q-table persistence to disk | Currently in-memory only |
| Low | Plugin system | Deferred |
| Low | IPFS pattern sharing | Deferred |
