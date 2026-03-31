# Architecture

[Home](../README.md) | [Getting Started](getting-started.md) | [CLI Reference](cli-reference.md) | [MCP Tools](mcp-tools.md) | **Architecture** | [Configuration](configuration.md)

---

## High-Level Overview

aiyoucli is a hybrid TypeScript + Rust CLI tool. The TypeScript shell handles command parsing, configuration, and MCP protocol negotiation. Compute-intensive operations -- vector search, neural learning, code analysis, routing -- are implemented in Rust and accessed through NAPI (Node API) bindings.

```
+------------------+     +------------------+     +-------------------+
|                  |     |                  |     |                   |
|   CLI Commands   +---->+  Command Parser  +---->+ Command Handlers  |
|                  |     |                  |     |                   |
+------------------+     +------------------+     +--------+----------+
                                                           |
                              +----------------------------+
                              |
                    +---------v----------+
                    |                    |
                    |    MCP Tools       |
                    |  (40+ tools)       |
                    |                    |
                    +---------+----------+
                              |
                    +---------v----------+
                    |                    |
                    |   NAPI Bridge      |
                    | (platform-specific |
                    |   .node binary)    |
                    |                    |
                    +---------+----------+
                              |
          +-------------------+-------------------+
          |         |         |         |         |
     +----v---+ +--v----+ +--v----+ +--v----+ +--v------+
     |Vector  | | SONA  | |Routing| |Analyze| |Distiller|
     |  DB    | |Engine | |Engine | |Engine | |  +Tech  |
     |HNSW+   | |MicroL | |Q-Lrn | |Diff+  | | Detect  |
     |SIMD    | |+EWC++ | |+Replay| |Cmplx  | |         |
     +--------+ +-------+ +-------+ +-------+ +---------+
```

## TypeScript Layer

### Command System

Commands are defined as structured objects implementing the `Command` interface. Each command declares its name, description, options, examples, and an async action handler. The parser extracts flags and positional arguments from `process.argv` and dispatches to the matching handler.

### MCP Server

The MCP server implements JSON-RPC 2.0 over stdio transport. It registers all tool modules at startup and handles `tools/list` and `tools/call` requests. Each tool is an object with a `name`, `description`, `inputSchema` (JSON Schema), and an async `handler` function.

The server supports:

- **Tool discovery** via `tools/list`
- **Tool invocation** via `tools/call` with validated input
- **Error propagation** with structured error responses

### Tool Modules

Tools are organized into 18 modules, each exporting an array of `MCPTool` objects:

| Module | File | Tools |
|---|---|---|
| System | `system-tools.ts` | `system_status`, `system_doctor` |
| Config | `config-tools.ts` | `config_get`, `config_set` |
| Agents | `agent-tools.ts` | `agent_spawn`, `agent_list`, `agent_status`, `agent_stop`, `agent_record`, `agent_metrics` |
| Memory | `memory-tools.ts` | `memory_init`, `memory_store`, `memory_search`, `memory_count`, `memory_stats`, `memory_delete` |
| Tasks | `task-tools.ts` | `task_create`, `task_list`, `task_status`, `task_complete` |
| Sessions | `session-tools.ts` | `session_start`, `session_end`, `session_list` |
| Hooks | `hooks-tools.ts` | `hooks_pre_task`, `hooks_post_task`, `hooks_route`, `hooks_model_route`, `hooks_stats` |
| Swarm | `swarm-tools.ts` | `swarm_init`, `swarm_status`, `swarm_stop` |
| Coordination | `coordination-tools.ts` | `coordination_status` |
| Neural | `neural-tools.ts` | `neural_observe`, `neural_transform`, `neural_learn`, `neural_stats` |
| Analysis | `analyze-tools.ts` | `analyze_diff`, `analyze_commit`, `analyze_complexity` |
| Distiller | `distiller-tools.ts` | `distill_markdown`, `distill_file` |
| Skills | `skills-tools.ts` | `skills_sync`, `skills_list`, `skills_detect` |
| Security | `security-tools.ts` | `security_scan` |
| Performance | `performance-tools.ts` | `perf_benchmark` |
| Metrics | `metrics-tools.ts` | `metrics_snapshot`, `metrics_record_tokens`, `metrics_cost`, `metrics_memory`, `metrics_latency`, `metrics_tools_summary`, `metrics_save`, `metrics_reset` |
| Git Context | `gcc-tools.ts` | `git_context` |
| Statusline | `statusline-tools.ts` | `statusline` |

## Rust NAPI Layer

The Rust crate `aiyoucli-napi` compiles to a platform-specific `.node` binary. It exposes the following engines through N-API:

### VectorDB

High-performance vector storage and similarity search.

- **HNSW index** for approximate nearest neighbor search (logarithmic query time)
- **SIMD acceleration** for distance calculations where available
- **Persistent storage** via redb (embedded key-value store)
- **In-memory mode** for ephemeral workloads
- Cosine similarity metric
- Insert, search, delete, count, and stats operations

### SONA Engine (Self-Optimizing Neural Architecture)

Lightweight on-device learning engine.

- **MicroLoRA** -- low-rank adaptation of embeddings
- **EWC++** (Elastic Weight Consolidation) -- prevents catastrophic forgetting when learning new patterns
- **Loop B** -- background learning on buffered observations
- Observation submission with quality scoring
- Embedding transformation through learned weights

### Attention Router

Scaled dot-product attention for multi-agent coordination.

- Query/key/value computation
- Optional "flash" hint for optimized computation paths
- Used internally for consensus and coordination

### Knowledge Graph

In-memory directed graph for relationship modeling.

- Node and edge CRUD with typed labels
- Neighbor traversal (incoming/outgoing/both)
- k-hop reachability queries
- Graph statistics

### Routing Engine

Q-learning agent for task-to-agent routing.

- **Q-table** with epsilon-greedy exploration
- **Experience replay buffer** for stable learning
- **Semantic routing** using built-in text embeddings
- **Model tier selection** (haiku/sonnet/opus) based on task complexity
- Q-table export/import for persistence across sessions

### Analysis Engine

Code analysis without external dependencies.

- **Diff classification** -- categorizes file changes by type and impact, identifies risk factors
- **Commit classification** -- detects conventional commit types (feat, fix, refactor, etc.)
- **Complexity scoring** -- scores source code complexity from 0.0 to 1.0

### Distiller

Markdown to TOON (Dense Structured Instructions) converter.

- Approximately 52% token reduction
- Preserves semantic content while removing formatting overhead
- File-level and string-level APIs

### Tech Detector

Project technology detection.

- Scans project directory for configuration files, package manifests, and source patterns
- Returns detected technologies, categories, and recommended skills

## Platform Detection

The NAPI loader selects the correct `.node` binary at runtime:

| Platform | Architecture | Package |
|---|---|---|
| macOS | ARM64 (Apple Silicon) | `@aiyou-dev/cli-darwin-arm64` |
| macOS | x64 (Intel) | `@aiyou-dev/cli-darwin-x64` |
| Linux | x64 (glibc) | `@aiyou-dev/cli-linux-x64-gnu` |
| Linux | ARM64 (glibc) | `@aiyou-dev/cli-linux-arm64-gnu` |
| Windows | x64 | `@aiyou-dev/cli-win32-x64-msvc` |

In development, the loader first checks for local build artifacts (`aiyoucli-napi.*.node` files) in the project root. In production (npm install), it resolves the platform-specific optional dependency package.

## Configuration Precedence

Configuration values are resolved in this order (highest priority first):

1. **Environment variables** -- `AIYOUCLI_*` prefixed variables (see [Configuration](configuration.md))
2. **Config file** -- `aiyoucli.config.json` or `.aiyoucli/config.json`
3. **Defaults** -- built-in default values

Environment variables always override file-based configuration, and file-based configuration always overrides defaults.

## Storage Layout

All runtime state is stored under `.aiyoucli/` in the project root:

```
.aiyoucli/
  config.json              # Project configuration
  vectors.redb             # Persistent vector database (redb)
  memory-config.json       # Vector DB settings
  q-table.json             # Routing Q-table (persisted between sessions)
  agents/
    store.json             # Agent registry
  tasks/
    store.json             # Task registry
  swarm/
    state.json             # Swarm state
  sessions/
    <session-id>.json      # Individual session files
  skills/
    <name>.dsi.toon        # TOON-distilled skill files
  metrics/
    <timestamp>.json       # Saved metrics snapshots
```

## Production Reliability

The MCP server includes production-grade reliability patterns:

- **Circuit breaker** -- prevents cascading failures when a downstream engine is unhealthy
- **Rate limiter** -- protects against excessive tool invocations
- **Retry logic** -- automatic retries with exponential backoff for transient failures
- **Structured error handling** -- typed errors with codes and context propagated through MCP responses

## Data Flow Example

A typical vector search request flows through the system as follows:

1. MCP client sends `tools/call` with `name: "memory_search"` and `arguments: { vector: [...], k: 5 }`
2. MCP server validates the input against the tool's JSON Schema
3. `memory_search` handler calls `getDB().search(vector, k)`
4. `getDB()` lazily initializes the NAPI `VectorHandle` (persistent or in-memory)
5. The Rust HNSW index performs approximate nearest neighbor search with SIMD-accelerated distance computation
6. Results are serialized back through NAPI to the TypeScript layer
7. MCP server wraps results in a JSON-RPC response and writes to stdout
