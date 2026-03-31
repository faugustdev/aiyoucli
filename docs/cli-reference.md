# CLI Reference

[Home](../README.md) | [Getting Started](getting-started.md) | **CLI Reference** | [MCP Tools](mcp-tools.md) | [Architecture](architecture.md) | [Configuration](configuration.md)

---

Complete reference for all aiyoucli commands, organized by category.

## Core

### `aiyoucli init`

Interactive project initialization. Creates `AGENTS.md`, writes default settings, and optionally installs community skills from autoskills.sh.

| Option | Description |
|---|---|
| `--skip-skills` | Skip community skill installation |
| `--format json` | Output results as JSON |

```bash
aiyoucli init
aiyoucli init --skip-skills
```

### `aiyoucli status`

System overview showing tool count, memory state, active agents, and configuration.

```bash
aiyoucli status
```

### `aiyoucli doctor`

Health diagnostics. Checks Node.js version, NAPI binding availability, vector DB, and git installation.

```bash
aiyoucli doctor
```

### `aiyoucli config get [key]`

Read a configuration value. Supports dot notation for nested keys. Omit the key to display the full configuration.

```bash
aiyoucli config get
aiyoucli config get memory.dimensions
aiyoucli config get swarm.topology
```

### `aiyoucli config set <key> <value>`

Set a configuration value and persist it to `.aiyoucli/config.json`.

```bash
aiyoucli config set memory.dimensions 512
aiyoucli config set swarm.topology mesh
aiyoucli config set cli.verbosity debug
```

---

## Agents and Orchestration

### `aiyoucli agent spawn`

Spawn a new AI agent with a given type and optional name.

| Option | Description | Default |
|---|---|---|
| `--name <name>` | Agent name | Auto-generated from type |
| `--model <tier>` | Model tier: `haiku`, `sonnet`, `opus` | Varies by type |
| `--type <type>` | Agent type | `coder` |

Agent types and their default models:

| Type | Default Model |
|---|---|
| `coder` | sonnet |
| `researcher` | sonnet |
| `tester` | haiku |
| `reviewer` | sonnet |
| `architect` | opus |
| `security` | opus |
| `debugger` | sonnet |
| `documenter` | haiku |

```bash
aiyoucli agent spawn --name worker --model sonnet
aiyoucli agent spawn --type architect --name lead
```

### `aiyoucli agent list`

List all active agents (excludes stopped agents) with their metrics.

```bash
aiyoucli agent list
```

### `aiyoucli agent status --id <id>`

Get status and metrics for a specific agent.

```bash
aiyoucli agent status --id agent-m1abc-x2y3
```

### `aiyoucli agent stop --id <id>`

Stop an agent by ID.

```bash
aiyoucli agent stop --id agent-m1abc-x2y3
```

### `aiyoucli agent record --id <id> --success`

Record a task outcome for an agent. Updates metrics: success/fail count, duration, success rate.

| Option | Description | Required |
|---|---|---|
| `--id <id>` | Agent ID | Yes |
| `--success` | Whether the task succeeded (boolean) | Yes |
| `--duration-ms <ms>` | Task duration in milliseconds | No |

```bash
aiyoucli agent record --id agent-m1abc-x2y3 --success
aiyoucli agent record --id agent-m1abc-x2y3 --success false --duration-ms 4500
```

### `aiyoucli agent metrics`

Get aggregated metrics across all active agents, grouped by type.

```bash
aiyoucli agent metrics
```

### `aiyoucli swarm init`

Initialize a multi-agent swarm with a topology.

| Option | Description | Default |
|---|---|---|
| `--topology <t>` | `hierarchical`, `mesh`, `ring`, `star`, `hybrid` | `hierarchical` |
| `--max-agents <n>` | Maximum agents | `8` |
| `--strategy <s>` | `specialized`, `balanced`, `adaptive` | `specialized` |

```bash
aiyoucli swarm init --topology mesh --max-agents 12
aiyoucli swarm init --topology star --strategy adaptive
```

### `aiyoucli swarm status`

Get current swarm status including topology, agent count, and state.

```bash
aiyoucli swarm status
```

### `aiyoucli swarm stop`

Stop the active swarm.

```bash
aiyoucli swarm stop
```

### `aiyoucli task create`

Create a new task with optional assignment and priority.

| Option | Description | Default |
|---|---|---|
| `--description <d>` | Task description | Required |
| `--priority <p>` | `low`, `normal`, `high`, `critical` | `normal` |
| `--assign-to <id>` | Agent ID to assign | None |

```bash
aiyoucli task create --description "Refactor auth module" --priority high
aiyoucli task create --description "Write unit tests" --assign-to agent-m1abc-x2y3
```

### `aiyoucli task list`

List all tasks. Optionally filter by status.

| Option | Description |
|---|---|
| `--status <s>` | Filter: `pending`, `in_progress`, `completed`, `failed` |

```bash
aiyoucli task list
aiyoucli task list --status pending
```

### `aiyoucli task status --id <id>`

Get task status by ID.

```bash
aiyoucli task status --id task-m1abc
```

### `aiyoucli task complete --id <id>`

Mark a task as completed.

```bash
aiyoucli task complete --id task-m1abc
```

### `aiyoucli session start [--id <id>]`

Start a new session or resume an existing one. If no ID is provided, one is auto-generated.

```bash
aiyoucli session start
aiyoucli session start --id my-session
```

### `aiyoucli session end --id <id>`

End an active session.

```bash
aiyoucli session end --id my-session
```

### `aiyoucli session list`

List all sessions with their status and timestamps.

```bash
aiyoucli session list
```

### `aiyoucli route <description>`

Route a task description to the optimal agent type and model tier. Uses Q-learning with experience replay for routing decisions.

```bash
aiyoucli route "refactor the authentication module"
aiyoucli route "write integration tests for the API"
```

### `aiyoucli hooks route`

Show the current hook routing recommendation for a task.

```bash
aiyoucli hooks route --task "optimize database queries"
```

### `aiyoucli hooks pre-task`

Run pre-task hooks. Returns routing recommendation before starting work.

| Option | Description | Required |
|---|---|---|
| `--description <d>` | Task description | Yes |

```bash
aiyoucli hooks pre-task --description "implement caching layer"
```

### `aiyoucli hooks post-task`

Run post-task hooks. Records task outcome for learning and persists the Q-table.

| Option | Description | Required |
|---|---|---|
| `--description <d>` | Task description | Yes |
| `--agent <type>` | Agent type that was used | Yes |
| `--success` | Whether the task succeeded | Yes |

```bash
aiyoucli hooks post-task --description "implement caching layer" --agent coder --success
```

### `aiyoucli hooks stats`

Get routing engine statistics: states learned, total steps, replay buffer status.

```bash
aiyoucli hooks stats
```

---

## Intelligence

### `aiyoucli memory init`

Initialize the vector memory database. Persistent by default (stored in `.aiyoucli/vectors.redb`).

| Option | Description | Default |
|---|---|---|
| `--path <path>` | Storage path. Use `memory` for in-memory only. | `.aiyoucli/vectors.redb` |
| `--dimensions <d>` | Vector dimensions | `384` |
| `--enable-hnsw` | Enable HNSW index for fast search | `true` |

```bash
aiyoucli memory init
aiyoucli memory init --dimensions 512 --enable-hnsw
aiyoucli memory init --path memory
```

### `aiyoucli memory store`

Store a vector with optional ID and metadata.

| Option | Description | Required |
|---|---|---|
| `--vector <v>` | Comma-separated vector values | Yes |
| `--id <id>` | Vector ID | No (auto-generated) |
| `--metadata <json>` | JSON metadata | No |

```bash
aiyoucli memory store --vector "1,0,0" --id "doc-1"
aiyoucli memory store --vector "0.5,0.3,0.2" --id "doc-2" --metadata '{"source":"readme"}'
```

### `aiyoucli memory search`

Search for similar vectors using the HNSW index.

| Option | Description | Default |
|---|---|---|
| `--vector <v>` | Query vector (comma-separated) | Required |
| `--k <n>` | Number of results | `5` |

```bash
aiyoucli memory search --vector "0.9,0.1,0" --k 3
```

### `aiyoucli memory list`

Get the number of vectors currently stored.

```bash
aiyoucli memory list
```

### `aiyoucli memory stats`

Get database statistics: total vectors, dimensions, metric, index type, storage bytes.

```bash
aiyoucli memory stats
```

### `aiyoucli memory delete --id <id>`

Delete a vector by ID.

```bash
aiyoucli memory delete --id doc-1
```

### `aiyoucli neural observe`

Submit an observation to the SONA learning engine.

| Option | Description | Required |
|---|---|---|
| `--input <json>` | Observation with `embedding` (number array), `quality` (0.0-1.0), and optional `kind` (commit/test/edit) | Yes |

```bash
aiyoucli neural observe --input '{"embedding":[0.1,0.2,0.3],"quality":0.85,"kind":"commit"}'
```

Note: SONA state is in-memory. In MCP mode (persistent server), observations accumulate across tool calls. In CLI mode, each invocation starts fresh.

### `aiyoucli neural learn`

Force a background learning cycle on buffered observations.

```bash
aiyoucli neural learn
```

### `aiyoucli neural stats`

Get SONA engine statistics: signals processed, trajectories buffered, enabled state.

```bash
aiyoucli neural stats
```

### `aiyoucli analyze diff`

Classify the current git diff. Returns file-level classification, impact assessment, and risk factors.

```bash
aiyoucli analyze diff
```

### `aiyoucli analyze commit [hash]`

Classify a commit message using conventional commit detection.

```bash
aiyoucli analyze commit HEAD
aiyoucli analyze commit abc1234
```

### `aiyoucli analyze complexity <path>`

Score code complexity for a file or directory. Returns a score from 0.0 (simple) to 1.0 (very complex).

```bash
aiyoucli analyze complexity ./src
aiyoucli analyze complexity ./src/config.ts
```

### `aiyoucli security scan`

Run a security scan: npm audit results plus checks for tracked secret files.

```bash
aiyoucli security scan
```

### `aiyoucli performance benchmark`

Run a vector search benchmark measuring NAPI performance.

| Option | Description | Default |
|---|---|---|
| `--vectors <n>` | Number of vectors to insert | `1000` |
| `--dimensions <d>` | Vector dimensions | `128` |
| `--queries <n>` | Number of search queries | `100` |

```bash
aiyoucli performance benchmark
aiyoucli performance benchmark --vectors 5000 --dimensions 256 --queries 500
```

---

## Utilities

### `aiyoucli skills sync`

Scan for new `SKILL.md` files, distill them to TOON format, and clean up originals. Run after installing skills outside of `aiyoucli init`.

| Option | Description | Default |
|---|---|---|
| `--project-dir <d>` | Project root directory | Current directory |

```bash
aiyoucli skills sync
aiyoucli skills sync --project-dir /path/to/project
```

### `aiyoucli skills list`

List all TOON-distilled skills in the project, with file sizes and estimated token counts.

```bash
aiyoucli skills list
```

### `aiyoucli skills detect`

Detect technologies in the project and show recommended skills.

```bash
aiyoucli skills detect
```

### `aiyoucli gcc`

Git context controller. Shows current branch, status, recent commits, staged and unstaged changes.

```bash
aiyoucli gcc
```

### `aiyoucli statusline`

Rich terminal status dashboard showing swarm state, agents, memory, git, and tasks.

| Option | Description | Default |
|---|---|---|
| `--format <f>` | `text`, `json`, `compact` | `json` |

```bash
aiyoucli statusline
aiyoucli statusline --format compact
```

### `aiyoucli completions <shell>`

Generate shell completions for your shell.

```bash
# Bash
aiyoucli completions bash >> ~/.bashrc

# Zsh
aiyoucli completions zsh >> ~/.zshrc
```

### `aiyoucli mcp start`

Start the MCP server over stdio. Used for integration with Claude Code and other MCP-compatible clients.

```bash
aiyoucli mcp start
```

### `aiyoucli mcp status`

Check MCP server status.

```bash
aiyoucli mcp status
```

### `aiyoucli mcp tools`

List all available MCP tools with their descriptions.

```bash
aiyoucli mcp tools
```

---

## Global Options

These options apply to all commands:

| Option | Description |
|---|---|
| `--format <f>` | Output format: `text`, `json`, `table` |
| `--no-color` | Disable colored output |
| `--verbose` | Increase output verbosity |
| `--quiet` | Suppress non-essential output |
| `--help` | Show help for a command |
| `--version` | Show version |
