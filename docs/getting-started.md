# Getting Started

[Home](../README.md) | **Getting Started** | [CLI Reference](cli-reference.md) | [MCP Tools](mcp-tools.md) | [Architecture](architecture.md) | [Configuration](configuration.md)

---

## Prerequisites

- **Node.js 20+** (check with `node -v`)
- **Git** (for code analysis features)
- A terminal that supports ANSI colors (optional, but recommended)

## Installation

Install globally from npm:

```bash
npm install -g @aiyou-dev/cli
```

Or use the unscoped package name:

```bash
npm install -g aiyoucli
```

Verify the installation:

```bash
aiyoucli doctor
```

This runs health diagnostics to confirm NAPI bindings, vector DB, and git are working.

## First Run

Initialize aiyoucli in your project directory:

```bash
cd your-project
aiyoucli init
```

The interactive setup will:

1. Create an `AGENTS.md` file with project context
2. Write default settings to `.aiyoucli/config.json`
3. Install community skills from autoskills.sh (skip with `--skip-skills`)

## Basic Usage

### Check system health

```bash
aiyoucli doctor
```

Reports the status of Node.js, NAPI bindings, and git.

### View system status

```bash
aiyoucli status
```

Shows an overview of tools, memory, agents, and configuration state.

### Initialize and use vector memory

```bash
# Initialize the vector database (persistent by default)
aiyoucli memory init

# Store a vector with an ID
aiyoucli memory store --vector "1,0,0" --id "doc-1"

# Search for nearest neighbors
aiyoucli memory search --vector "0.9,0.1,0" --k 3

# View database statistics
aiyoucli memory stats
```

### Spawn and manage agents

```bash
# Spawn an agent with a specific model tier
aiyoucli agent spawn --name worker --model sonnet

# List active agents
aiyoucli agent list

# Record task outcomes for learning
aiyoucli agent record --id <agent-id> --success
```

### Analyze code

```bash
# Score code complexity for a directory
aiyoucli analyze complexity ./src

# Classify the current git diff
aiyoucli analyze diff

# Classify a specific commit
aiyoucli analyze commit HEAD
```

### Route tasks to agents

```bash
# Get a routing recommendation for a task
aiyoucli route "refactor the authentication module"
```

### Start MCP server

```bash
aiyoucli mcp start
```

Starts the MCP server over stdio, exposing all tools to compatible clients.

### Multi-agent swarms

```bash
# Initialize a swarm with a topology
aiyoucli swarm init --topology mesh

# Check swarm status
aiyoucli swarm status

# Stop the swarm
aiyoucli swarm stop
```

### Security scanning

```bash
aiyoucli security scan
```

Runs npm audit and checks for tracked secret files.

### Run benchmarks

```bash
aiyoucli performance benchmark --vectors 5000 --dimensions 128
```

Measures NAPI vector insert and search performance.

## MCP Integration with Claude Code

To use aiyoucli as an MCP server inside Claude Code, add the following to your `.mcp.json` file (project root or `~/.claude/.mcp.json`):

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

Once configured, Claude Code can call any aiyoucli tool directly -- vector search, agent management, code analysis, task routing, and more. See [MCP Tools Reference](mcp-tools.md) for the full catalog.

## Project Structure

After initialization, your project will contain:

```
your-project/
  .aiyoucli/
    config.json          # Project configuration
    vectors.redb         # Persistent vector database
    agents/store.json    # Agent registry
    tasks/store.json     # Task registry
    swarm/state.json     # Swarm state
    sessions/            # Session persistence
    skills/              # TOON-distilled skills
    metrics/             # Saved metrics snapshots
    q-table.json         # Routing Q-table (learned preferences)
  AGENTS.md              # Project context for AI agents
```

## Next Steps

- [CLI Reference](cli-reference.md) -- complete command documentation
- [MCP Tools](mcp-tools.md) -- MCP tool catalog with parameters
- [Architecture](architecture.md) -- how aiyoucli works under the hood
- [Configuration](configuration.md) -- all config keys and environment variables
