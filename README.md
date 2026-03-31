# aiyoucli

AI agent CLI with Rust-powered vector intelligence. Zero dependencies. Sub-millisecond operations.

[![npm version](https://img.shields.io/npm/v/@aiyou-dev/cli)](https://www.npmjs.com/package/@aiyou-dev/cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![build](https://github.com/faugustdev/aiyoucli/actions/workflows/ci.yml/badge.svg)](https://github.com/faugustdev/aiyoucli/actions/workflows/ci.yml)
[![platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen)](https://www.npmjs.com/package/@aiyou-dev/cli)

---

## Why aiyoucli?

- **65x smaller** than comparable tools -- 6,441 lines of code vs 416,834. Every line earns its place.
- **Zero runtime dependencies.** A single NAPI binary handles vector search, neural learning, graph traversal, and code analysis. No node_modules tree at runtime.
- **Sub-millisecond Rust engines.** Task routing in 0.04ms. Neural learning in 0.18ms. HNSW vector search with SIMD acceleration.
- **22 CLI commands + 56 MCP tools.** Full AI agent orchestration from the terminal or through any MCP-compatible client.

## Quick Start

```sh
npm install -g @aiyou-dev/cli
```

Initialize a project:

```sh
aiyoucli init
```

Search vector memory:

```sh
aiyoucli memory init
aiyoucli memory store --content "deployment requires staging approval"
aiyoucli memory search --query "how do we deploy"
```

Run as an MCP server (Claude Code):

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

## Features

| Category | What it does |
|----------|-------------|
| **Rust NAPI Engines** | 8 native engines -- HNSW vector search, SONA neural learning, attention routing, graph knowledge, code analysis, technology detection, TOON distillation, task routing. All compiled to a single `.node` binary. |
| **MCP Server** | 56 tools exposed via Model Context Protocol for AI agent orchestration. Drop into Claude Code, Cursor, or any MCP client. |
| **Multi-Agent Orchestration** | Spawn agents, manage swarms across 5 topologies (star, mesh, ring, tree, pipeline), route tasks to optimal model tiers. |
| **Vector Memory** | Persistent HNSW vector database with SIMD-accelerated similarity search. Store, query, and manage embeddings locally. |
| **Neural Learning (SONA)** | MicroLoRA adapters with EWC++ consolidation. Continuous learning without catastrophic forgetting. |
| **TOON Distillation** | Convert Markdown instructions to dense structured format. 52% fewer tokens with no information loss. |
| **Technology Detection** | Auto-detect 45+ technologies, frameworks, and tools in any project directory. |
| **Production Hardening** | Circuit breakers, rate limiters, retry with exponential backoff, health diagnostics, cost tracking. |

## CLI Commands

### Core

| Command | Description |
|---------|-------------|
| `init` | Initialize project -- generates AGENTS.md, settings, and skills |
| `status` | System status overview |
| `doctor` | Health diagnostics and environment checks |
| `config` | Get or set configuration values |

### Agents and Orchestration

| Command | Description |
|---------|-------------|
| `agent` | Agent lifecycle -- spawn, list, status, stop, record, metrics |
| `swarm` | Swarm coordination -- init, status, stop |
| `task` | Task management -- create, list, status, complete |
| `session` | Session lifecycle -- start, end, list |
| `route` | AI-powered task routing to optimal model tiers |
| `hooks` | Lifecycle hooks -- route, pre-task, post-task, stats |

### Intelligence

| Command | Description |
|---------|-------------|
| `memory` | Vector memory -- init, store, search, list, stats, delete |
| `neural` | Neural training -- observe, learn, stats |
| `analyze` | Code analysis -- diff, commit, complexity |
| `security` | Security scanning |
| `performance` | Benchmarking suite |

### Utilities

| Command | Description |
|---------|-------------|
| `skills` | Manage project skills -- sync, list, detect |
| `gcc` | Git context extraction |
| `statusline` | Rich status dashboard |
| `completions` | Shell completions for bash and zsh |
| `mcp` | MCP server management -- start, status, tools |

## MCP Tools

56 tools organized across 14 categories. All available through any MCP-compatible client.

| Category | Count | Key Tools |
|----------|------:|-----------|
| Agent Management | 6 | agent_spawn, agent_list, agent_status, agent_stop, agent_record, agent_metrics |
| Vector Memory | 6 | memory_init, memory_store, memory_search, memory_stats, memory_count, memory_delete |
| Metrics and Monitoring | 8 | metrics_snapshot, metrics_cost, metrics_latency, metrics_memory, metrics_record_tokens, metrics_save, metrics_reset, metrics_tools_summary |
| Hooks and Lifecycle | 5 | hooks_route, hooks_model_route, hooks_pre_task, hooks_post_task, hooks_stats |
| Neural Learning | 4 | neural_observe, neural_learn, neural_stats, neural_transform |
| Task Management | 4 | task_create, task_list, task_status, task_complete |
| Code Analysis | 3 | analyze_diff, analyze_commit, analyze_complexity |
| Session | 3 | session_start, session_end, session_list |
| Swarm | 3 | swarm_init, swarm_status, swarm_stop |
| Skills | 3 | skills_sync, skills_list, skills_detect |
| Distiller | 2 | distill_markdown, distill_file |
| Config | 2 | config_get, config_set |
| System | 2 | system_status, system_doctor |
| Other | 5 | perf_benchmark, security_scan, coordination_status, git_context, statusline |

## Architecture

```
+----------------------------------------------------------+
|                      CLI / MCP Server                     |
|                       (TypeScript)                        |
|  22 commands    56 MCP tools    production middleware      |
+---------------------------+------------------------------+
                            |
                      NAPI Bridge
                            |
+---------------------------v------------------------------+
|                     Rust Engines                          |
|                                                           |
|  vector.rs    - HNSW vector search, SIMD acceleration     |
|  sona.rs      - MicroLoRA + EWC++ neural learning         |
|  attention.rs - Flash attention, agent coordination        |
|  routing.rs   - Task routing, model tier selection         |
|  graph.rs     - Knowledge graph, k-hop traversal          |
|  analysis.rs  - Code complexity, diff analysis             |
|  detector.rs  - Technology detection (45+ frameworks)      |
|  distiller.rs - TOON markdown distillation                 |
+----------------------------------------------------------+
```

TypeScript handles CLI parsing, MCP protocol, and production middleware (circuit breakers, rate limiting, retries). All compute-intensive work crosses the NAPI bridge into Rust, where operations complete in microseconds to low milliseconds.

## Performance

Benchmarked on Apple M-series. All operations run in-process with no network calls.

| Operation | Avg Latency | Ops/sec |
|-----------|------------:|--------:|
| Model tier selection | 0.04ms | 23,923 |
| Graph k-hop (100 nodes) | 0.08ms | 13,158 |
| Task routing | 0.11ms | 8,718 |
| Complexity analysis | 0.15ms | 6,631 |
| Neural learn | 0.18ms | 5,445 |
| Neural observe | 0.42ms | 2,398 |
| Vector insert (3D) | 1.87ms | 534 |
| Vector search (100 vectors) | 3.36ms | 297 |

## Platform Support

| Platform | Architecture | Status |
|----------|-------------|--------|
| macOS | ARM64 (Apple Silicon) | Supported |
| macOS | x64 (Intel) | Supported |
| Linux | x64 (glibc) | Supported |
| Linux | ARM64 (glibc) | Supported |
| Windows | x64 | Supported |

Requires Node.js >= 20.0.0. Platform-specific NAPI binaries are distributed as optional dependencies and resolved automatically on install.

## Configuration

Configuration is stored per-project in `.aiyoucli/` and managed through the CLI or MCP tools.

```sh
# Set a value
aiyoucli config set model.default gpt-4

# Read a value
aiyoucli config get model.default
```

Key configuration areas:

- **Model routing** -- default model, tier thresholds, fallback behavior
- **Memory** -- vector dimensions, similarity metric, persistence path
- **Production** -- circuit breaker thresholds, rate limits, retry policy
- **Skills** -- detected technologies, custom skill definitions

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Install dependencies: `npm install`
4. Build: `npm run build` (requires Rust toolchain for NAPI)
5. Run tests: `npm test`
6. Submit a pull request

The build has two stages: `build:rs` compiles the Rust NAPI binary, and `build:ts` compiles TypeScript. You need a working Rust toolchain (stable) to build from source.

## License

MIT. See [LICENSE](LICENSE) for details.

---

Built by [Francisco August](https://github.com/faugustdev).
