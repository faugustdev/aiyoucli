# MCP Tools Reference

[Home](../README.md) | [Getting Started](getting-started.md) | [CLI Reference](cli-reference.md) | **MCP Tools** | [Architecture](architecture.md) | [Configuration](configuration.md)

---

## What is MCP?

The Model Context Protocol (MCP) is a standard for connecting AI models to external tools and data sources. aiyoucli implements an MCP server that exposes its full toolkit over JSON-RPC 2.0 via stdio transport.

When running as an MCP server, aiyoucli provides 40+ tools that AI agents can call directly -- vector search, agent orchestration, code analysis, task routing, and more.

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

---

## Tool Catalog

### System Tools

#### `system_status`

Get system status overview: version, platform, initialization state, and uptime.

**Parameters:** None

**Returns:** JSON with version, cwd, node version, platform, arch, initialization state, and uptime.

---

#### `system_doctor`

Run health diagnostics. Checks Node.js version, NAPI binding, and git availability.

**Parameters:** None

**Returns:** JSON with `healthy` boolean and array of check results.

---

### Configuration Tools

#### `config_get`

Get current configuration. Supports dot-notation key paths.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | No | Config key path (e.g., `memory.dimensions`). Omit for full config. |

---

#### `config_set`

Set a configuration value and persist to `.aiyoucli/config.json`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Config key path (e.g., `swarm.topology`) |
| `value` | any | Yes | New value |

---

### Agent Tools

#### `agent_spawn`

Spawn a new AI agent with a given type and optional name.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | Agent type: `coder`, `researcher`, `tester`, `reviewer`, `architect`, `security`, `debugger`, `documenter` |
| `name` | string | No | Agent name (auto-generated if omitted) |
| `model` | string | No | Model override: `haiku`, `sonnet`, `opus` |

**Returns:** JSON with `id`, `type`, `name`, `model`, `status`.

---

#### `agent_list`

List all active agents with their metrics. Excludes stopped agents.

**Parameters:** None

---

#### `agent_status`

Get status and metrics of a specific agent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Agent ID |

---

#### `agent_stop`

Stop an agent by ID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Agent ID |

---

#### `agent_record`

Record a task outcome for an agent. Updates metrics: success/fail count, duration, success rate.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Agent ID |
| `success` | boolean | Yes | Whether the task succeeded |
| `duration_ms` | number | No | Task duration in milliseconds |

**Returns:** JSON with agent name, tasks completed, success rate, and average duration.

---

#### `agent_metrics`

Get aggregated metrics across all active agents, grouped by type.

**Parameters:** None

**Returns:** JSON with total agents, total tasks, success rates, and per-type breakdown.

---

### Memory Tools

#### `memory_init`

Initialize the vector memory database. Persistent by default.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | No | Storage path. Use `memory` for in-memory only. Default: `.aiyoucli/vectors.redb` |
| `dimensions` | number | No | Vector dimensions (default: 384) |
| `enable_hnsw` | boolean | No | Enable HNSW index (default: true) |

---

#### `memory_store`

Store a vector with optional ID and metadata.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `vector` | number[] | Yes | Vector to store |
| `id` | string | No | Vector ID (auto-generated if omitted) |
| `metadata` | object | No | Arbitrary metadata |

---

#### `memory_search`

Search for similar vectors using the HNSW index.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `vector` | number[] | Yes | Query vector |
| `k` | number | No | Number of results (default: 5, max: 1000) |

**Returns:** Array of `{ id, score, vector?, metadata? }` sorted by similarity.

---

#### `memory_count`

Get the number of vectors stored in memory.

**Parameters:** None

---

#### `memory_stats`

Get database statistics: total vectors, dimensions, metric, index type, storage bytes.

**Parameters:** None

---

#### `memory_delete`

Delete a vector by ID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Vector ID to delete |

---

### Task Tools

#### `task_create`

Create a new task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `description` | string | Yes | Task description |
| `priority` | string | No | `low`, `normal`, `high`, `critical` (default: `normal`) |
| `assignTo` | string | No | Agent ID to assign |

**Returns:** JSON with `id` and `status`.

---

#### `task_list`

List all tasks. Optionally filter by status.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | string | No | Filter: `pending`, `in_progress`, `completed`, `failed` |

---

#### `task_status`

Get task status by ID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Task ID |

---

#### `task_complete`

Mark a task as completed.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Task ID |

---

### Session Tools

#### `session_start`

Start a new session or resume an existing one.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | No | Session ID (auto-generated if omitted) |

**Returns:** JSON with `id`, `status` (`started` or `resumed`), and `startedAt` timestamp.

---

#### `session_end`

End an active session.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Session ID |

---

#### `session_list`

List all sessions with their status and timestamps.

**Parameters:** None

---

### Hooks and Routing Tools

#### `hooks_pre_task`

Pre-task hook. Returns a routing recommendation before starting work.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `description` | string | Yes | Task description |

**Returns:** JSON with `recommended_agent`, `model_tier`, `confidence`, and `alternatives`.

---

#### `hooks_post_task`

Post-task hook. Records outcome for Q-learning and persists the Q-table to disk.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `description` | string | Yes | Task description |
| `agent` | string | Yes | Agent type that was used |
| `success` | boolean | Yes | Whether the task succeeded |

---

#### `hooks_route`

Route a task to the optimal agent type using Q-learning.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | Task description |

**Returns:** JSON with `route`, `confidence`, `model_tier`, `explored`, `method`, and `alternatives`.

---

#### `hooks_model_route`

Select the optimal model tier (haiku/sonnet/opus) for a task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | Task description |

**Returns:** JSON with `model` field.

---

#### `hooks_stats`

Get routing engine statistics: states learned, total steps, replay buffer status.

**Parameters:** None

---

### Swarm Tools

#### `swarm_init`

Initialize a multi-agent swarm with a topology.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `topology` | string | No | `hierarchical`, `mesh`, `ring`, `star`, `hybrid` (default: `hierarchical`) |
| `maxAgents` | number | No | Maximum agents (default: 8) |
| `strategy` | string | No | `specialized`, `balanced`, `adaptive` (default: `specialized`) |

---

#### `swarm_status`

Get current swarm status.

**Parameters:** None

---

#### `swarm_stop`

Stop the active swarm.

**Parameters:** None

---

### Coordination Tools

#### `coordination_status`

Get coordination status: swarm state, active agent count, and task breakdown by status.

**Parameters:** None

**Returns:** JSON with swarm info, agent counts (total/active), and task counts (total/pending/in_progress/completed).

---

### Neural Tools (SONA)

#### `neural_observe`

Submit an observation to the SONA learning engine. Observations accumulate within an MCP session but reset per CLI invocation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `embedding` | number[] | Yes | Observation embedding vector |
| `quality` | number | Yes | Quality score (0.0 to 1.0) |
| `kind` | string | No | Observation kind: `commit`, `test`, `edit` |

---

#### `neural_transform`

Transform an embedding through learned LoRA weights.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `embedding` | number[] | Yes | Input embedding |

**Returns:** Transformed embedding as number array.

---

#### `neural_learn`

Force a background learning cycle (Loop B) on buffered observations.

**Parameters:** None

**Returns:** Number of trajectories processed.

---

#### `neural_stats`

Get SONA engine statistics: signals processed, trajectories buffered, enabled state.

**Parameters:** None

---

### Analysis Tools

#### `analyze_diff`

Classify a git diff. Returns file-level classification, impact assessment, and risk factors.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diff` | string | Yes | Git diff content (from `git diff`) |

**Returns:** JSON with per-file classification (`path`, `additions`, `deletions`, `classification`, `impact`), overall assessment, stats, and risk factors.

---

#### `analyze_commit`

Classify a commit message using conventional commit detection.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | string | Yes | Commit message |

**Returns:** Classification string (e.g., `feat`, `fix`, `refactor`).

---

#### `analyze_complexity`

Score code complexity on a 0.0 to 1.0 scale.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `source` | string | Yes | Source code content |

**Returns:** JSON with `score` (number) and `level` (`low`, `medium`, `high`).

---

### Distiller Tools

#### `distill_markdown`

Convert Markdown to TOON format (Dense Structured Instructions). Achieves approximately 52% token reduction for the same semantic content.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `markdown` | string | Yes | Markdown content to distill |

**Returns:** TOON-formatted string.

---

#### `distill_file`

Distill a Markdown file to TOON format. Reads the file and returns dense instructions. Path must be within the project root.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Path to the `.md` file |

---

### Skills Tools

#### `skills_sync`

Scan for new `SKILL.md` files in `.agents/skills/` and `.claude/skills/`, distill them to TOON format, and clean up originals.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_dir` | string | No | Project root (default: cwd) |

---

#### `skills_list`

List all TOON-distilled skills in the project with file sizes and estimated token counts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_dir` | string | No | Project root (default: cwd) |

**Returns:** JSON with `skills` array and `total` count.

---

#### `skills_detect`

Detect technologies in the project directory and show recommended skills.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_dir` | string | No | Project root (default: cwd) |

**Returns:** JSON with detected technologies, categories, recommended skills, and totals.

---

### Security Tools

#### `security_scan`

Run a security scan: npm audit and checks for tracked secret files in git.

**Parameters:** None

**Returns:** JSON with `clean` boolean and array of check results (`check`, `status`, `detail`).

---

### Performance Tools

#### `perf_benchmark`

Run a vector search benchmark measuring NAPI insert and search performance.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `vectors` | number | No | Number of vectors to insert (default: 1000, max: 100,000) |
| `dimensions` | number | No | Vector dimensions (default: 128, max: 4096) |
| `queries` | number | No | Number of search queries (default: 100, max: 10,000) |

**Returns:** JSON with insert and search timing (total ms, per-operation microseconds).

---

### Metrics Tools

#### `metrics_snapshot`

Get a full metrics snapshot: tokens, cost, tool call stats, memory usage, latency percentiles.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model_tier` | string | No | Model tier for cost calculation (`opus`/`sonnet`/`haiku`). Auto-detected if omitted. |

---

#### `metrics_record_tokens`

Record token usage from an LLM response.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `input_tokens` | number | No | Input tokens consumed |
| `output_tokens` | number | No | Output tokens generated |
| `cache_read_tokens` | number | No | Tokens read from cache |
| `cache_write_tokens` | number | No | Tokens written to cache |

---

#### `metrics_cost`

Calculate estimated cost based on recorded token usage.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model_tier` | string | No | Model tier (`opus`/`sonnet`/`haiku`). Auto-detected if omitted. |

**Returns:** JSON with input cost, output cost, and total in USD.

---

#### `metrics_memory`

Get current process memory usage: heap, RSS, external.

**Parameters:** None

---

#### `metrics_latency`

Get tool call latency statistics: avg, p50, p95, p99, max.

**Parameters:** None

---

#### `metrics_tools_summary`

Get per-tool call statistics: count, average latency, error rate.

**Parameters:** None

---

#### `metrics_save`

Persist current session metrics to `.aiyoucli/metrics/`.

**Parameters:** None

**Returns:** File path of the saved metrics snapshot.

---

#### `metrics_reset`

Reset all accumulated metrics for a fresh session.

**Parameters:** None

---

### Git Context Tools

#### `git_context`

Get current git context: branch, status, recent commits, staged and unstaged changes.

**Parameters:** None

**Returns:** JSON with `branch`, `modified_files`, `status`, `recent_commits`, `unstaged_changes`, `staged_changes`.

---

### Statusline Tools

#### `statusline`

Get a rich status dashboard covering swarm state, agents, memory, git, and tasks.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `format` | string | No | Output format: `text`, `json`, `compact` (default: `json`) |
