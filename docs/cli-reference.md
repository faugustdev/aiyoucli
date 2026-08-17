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
| `--with-mcp` | Also wire the MCP server (`.mcp.json` / opencode.json). **Off by default** — agents use the `aiyoucli` CLI directly via shell, avoiding the standing token cost of loading ~60 MCP tool schemas into every turn |
| `--with-hooks` | Wire Claude Code PreToolUse/PostToolUse hooks into `.claude/settings.json` for `Edit\|Write\|MultiEdit`. **Off by default** — OpenCode already gets lifecycle hooks via `@aiyou-dev/team`; this brings Claude Code to parity |
| `--with-agents` | Write `.claude/agents/*.md` for the 8 aiyou-team agents so Claude Code's `task` tool can dispatch to them. **Off by default** — OpenCode already gets the agents via the `@aiyou-dev/team` plugin entry in `opencode.json` |
| `--format json` | Output results as JSON |

```bash
aiyoucli init
aiyoucli init --skip-skills
aiyoucli init --with-mcp --force   # opt into MCP (e.g. for a shell-less client like Claude Desktop)
aiyoucli init --tool claude --with-agents   # opt into Claude Code agent delegation
aiyoucli init --tool claude --with-hooks --with-agents   # full Claude Code wiring parity
```

### `aiyoucli status`

System overview showing tool count, memory state, and configuration.

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
```

### `aiyoucli config set <key> <value>`

Set a configuration value and persist it to `.aiyoucli/config.json`.

```bash
aiyoucli config set memory.dimensions 512
aiyoucli config set cli.verbosity debug
```

---

## Agent Team

Agent orchestration is owned by the `@aiyou-dev/team` OpenCode plugin and is not duplicated as `agent`, `swarm`, `task`, or `session` commands in aiyoucli.

```bash
aiyoucli setup
aiyoucli team doctor
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
| `--file <path>`, `-f` | File path (from Claude Code `tool_input.file_path`); appended to the description before routing | No |
| `--edit-kind <mod\|new\|delete>`, `-k` | Edit classification; appended to the description in parens | No |

```bash
aiyoucli hooks pre-task --description "implement caching layer"
# Claude Code PreToolUse hook fires automatically when --with-hooks is enabled:
aiyoucli hooks pre-task --description Edit --file src/cache.ts --edit-kind mod
```

### `aiyoucli hooks post-task`

Run post-task hooks. Records task outcome for learning and persists the Q-table.

| Option | Description | Required |
|---|---|---|
| `--description <d>` | Task description | Yes |
| `--agent <type>`, `-a` | Agent type that was used. Defaults to `claude` (the Claude Code PostToolUse hook sentinel). Override via `--agent` or set `AIYOUCLI_AUTO_AGENT` in the environment | No |
| `--success`, `-s` | Whether the task succeeded. Defaults to `true` (the PostToolUse hook assumes success — `tool_result` is too tool-specific to parse reliably) | No |
| `--file <path>`, `-f` | Optional file context (from Claude Code `tool_input.file_path`); appended to the description | No |

```bash
aiyoucli hooks post-task --description "implement caching layer" --agent coder --success
# Claude Code PostToolUse hook fires automatically when --with-hooks is enabled:
aiyoucli hooks post-task --description Edit --file src/cache.ts
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

### `aiyoucli memory export`

Export every stored vector as JSON (`{id, vector, metadata}[]`), for backup/migration.

| Option | Description |
|---|---|
| `--out`, `-o` | Write output to a file instead of stdout |

```bash
aiyoucli memory export --out dump.json
```

### `aiyoucli memory import <file.json>`

Import vectors from a JSON file produced by `memory export`. Every entry's
vector must match the current database's dimensions.

```bash
aiyoucli memory import dump.json
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

### `aiyoucli pdf2md`

Convert a local PDF file to Markdown (native/selectable text only, no OCR). Pure Rust (`pdfrs`), no Poppler/PDFium/Python.

| Option | Description |
|---|---|
| `--out`, `-o` | Write output to a file instead of stdout |

```bash
aiyoucli pdf2md report.pdf
aiyoucli pdf2md report.pdf --out report.md
```

### `aiyoucli gcc`

Git context controller. Shows current branch, status, recent commits, staged and unstaged changes.

```bash
aiyoucli gcc
```

### `aiyoucli statusline`

Rich terminal status dashboard showing git, vectors, sessions, and tools.

| Option | Description | Default |
|---|---|---|
| `--format <f>` | `text`, `json`, `compact` | `json` |

```bash
aiyoucli statusline
aiyoucli statusline --format compact
```

### `aiyoucli completions <shell>`

Generate shell completions for your shell. Supports `bash`, `zsh`, `fish`, and `powershell` (alias `pwsh`).

```bash
# Bash
aiyoucli completions bash >> ~/.bashrc

# Zsh
aiyoucli completions zsh >> ~/.zshrc

# Fish
aiyoucli completions fish > ~/.config/fish/completions/aiyoucli.fish

# PowerShell
aiyoucli completions powershell >> $PROFILE
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

### `aiyoucli daemon start` / `status` / `stop`

Background worker daemon — a foreground polling loop over an in-process task
queue (`WorkerDaemon`/`WorkerQueue`, `src/services/`), the same shape as
`aiyoucli mcp start`. `start` blocks in the foreground until `Ctrl+C`
(`SIGINT`/`SIGTERM`), writing `.aiyoucli/daemon.pid` so a separate `status`/
`stop` invocation can find it. There's no IPC channel back into the running
process, so `status` only reports whether the PID is alive, not live queue
stats — and note nothing currently enqueues tasks into the queue by default
(`WorkerDaemon.dispatch()` is available for callers that wire it up).

```bash
aiyoucli daemon start
aiyoucli daemon start --poll-interval 500

# from another terminal
aiyoucli daemon status
aiyoucli daemon stop
```

### `aiyoucli update check` / `install`

Check npm for a newer `@aiyou-dev/cli` version, or install it.

```bash
aiyoucli update check
aiyoucli update install
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
