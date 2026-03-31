# Configuration

[Home](../README.md) | [Getting Started](getting-started.md) | [CLI Reference](cli-reference.md) | [MCP Tools](mcp-tools.md) | [Architecture](architecture.md) | **Configuration**

---

## Config File Locations

aiyoucli looks for configuration in the following locations, in order:

1. Explicit path passed via `--config` flag
2. `aiyoucli.config.json` in the current working directory
3. `.aiyoucli/config.json` in the current working directory

The first file found is used. If no file exists, built-in defaults apply. Environment variables always override file values.

## Configuration Reference

### Full Default Configuration

```json
{
  "version": "0.1.0",
  "projectRoot": ".",
  "memory": {
    "backend": "aiyouvector",
    "storagePath": ".aiyoucli/memory",
    "dimensions": 384,
    "enableHNSW": true
  },
  "swarm": {
    "topology": "hierarchical",
    "maxAgents": 8,
    "strategy": "specialized"
  },
  "mcp": {
    "transport": "stdio",
    "port": 3100,
    "autoStart": false
  },
  "cli": {
    "color": true,
    "interactive": true,
    "verbosity": "normal",
    "format": "text"
  }
}
```

### Memory Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `memory.backend` | `"aiyouvector"` \| `"memory"` | `"aiyouvector"` | Storage backend. `aiyouvector` uses persistent redb storage. `memory` uses in-memory only. |
| `memory.storagePath` | string | `".aiyoucli/memory"` | Path for persistent vector storage, relative to project root. |
| `memory.dimensions` | number | `384` | Number of dimensions for stored vectors. All vectors must match this dimensionality. |
| `memory.enableHNSW` | boolean | `true` | Enable HNSW (Hierarchical Navigable Small World) index for fast approximate nearest neighbor search. |

### Swarm Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `swarm.topology` | `"hierarchical"` \| `"mesh"` \| `"ring"` \| `"star"` \| `"hybrid"` | `"hierarchical"` | Multi-agent swarm topology. Determines how agents communicate and coordinate. |
| `swarm.maxAgents` | number | `8` | Maximum number of agents allowed in a swarm. |
| `swarm.strategy` | `"specialized"` \| `"balanced"` \| `"adaptive"` | `"specialized"` | Agent allocation strategy. `specialized` assigns best-fit agents. `balanced` distributes evenly. `adaptive` adjusts based on load. |

### MCP Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `mcp.transport` | `"stdio"` \| `"http"` | `"stdio"` | MCP server transport protocol. `stdio` is the standard for local tool integration. |
| `mcp.port` | number | `3100` | Port for HTTP transport (only used when `transport` is `"http"`). |
| `mcp.autoStart` | boolean | `false` | Automatically start the MCP server on CLI launch. |

### CLI Preferences

| Key | Type | Default | Description |
|---|---|---|---|
| `cli.color` | boolean | `true` | Enable colored terminal output. Set to `false` or use `NO_COLOR` env var to disable. |
| `cli.interactive` | boolean | auto-detected | Enable interactive prompts. Auto-detected from `process.stdin.isTTY`. |
| `cli.verbosity` | `"quiet"` \| `"normal"` \| `"verbose"` \| `"debug"` | `"normal"` | Output verbosity level. |
| `cli.format` | `"text"` \| `"json"` \| `"table"` | `"text"` | Default output format for command results. |

## Environment Variable Overrides

Environment variables take precedence over all file-based configuration. They are applied after the config file is loaded.

| Variable | Config Key | Type | Description |
|---|---|---|---|
| `AIYOUCLI_MEMORY_BACKEND` | `memory.backend` | string | Storage backend: `aiyouvector` or `memory` |
| `AIYOUCLI_MEMORY_PATH` | `memory.storagePath` | string | Path for persistent vector storage |
| `AIYOUCLI_MEMORY_DIMENSIONS` | `memory.dimensions` | number | Vector dimensions (must be a positive integer) |
| `AIYOUCLI_SWARM_TOPOLOGY` | `swarm.topology` | string | Swarm topology: `hierarchical`, `mesh`, `ring`, `star`, `hybrid` |
| `AIYOUCLI_SWARM_MAX_AGENTS` | `swarm.maxAgents` | number | Maximum agents in swarm (must be a positive integer) |
| `AIYOUCLI_MCP_PORT` | `mcp.port` | number | MCP HTTP transport port (must be a positive integer) |
| `AIYOUCLI_VERBOSITY` | `cli.verbosity` | string | Verbosity: `quiet`, `normal`, `verbose`, `debug` |
| `NO_COLOR` | `cli.color` | presence | When set (any value), disables colored output |

### Examples

```bash
# Use in-memory vector storage
AIYOUCLI_MEMORY_BACKEND=memory aiyoucli memory init

# Increase vector dimensions
AIYOUCLI_MEMORY_DIMENSIONS=512 aiyoucli memory init

# Use mesh topology for swarm
AIYOUCLI_SWARM_TOPOLOGY=mesh aiyoucli swarm init

# Run with debug verbosity
AIYOUCLI_VERBOSITY=debug aiyoucli doctor

# Disable colors (CI environments)
NO_COLOR=1 aiyoucli status
```

## Precedence Chain

Values are resolved in this order. The first defined value wins:

```
Environment Variable  (highest priority)
        |
   Config File        (aiyoucli.config.json or .aiyoucli/config.json)
        |
   Built-in Default   (lowest priority)
```

## Setting Configuration via CLI

Use `aiyoucli config` commands to read and write configuration:

```bash
# Read the full config
aiyoucli config get

# Read a specific key
aiyoucli config get memory.dimensions

# Set a value (persists to .aiyoucli/config.json)
aiyoucli config set memory.dimensions 512
aiyoucli config set swarm.topology mesh
aiyoucli config set cli.verbosity debug
```

Changes made via `config set` are written to `.aiyoucli/config.json`. Environment variables still override these values at runtime.

## Per-Project vs Global Configuration

aiyoucli uses **per-project** configuration exclusively. Each project has its own `.aiyoucli/` directory with independent settings, vector storage, agent state, and routing tables.

There is no global configuration file. To share settings across projects, use environment variables or a shell alias:

```bash
# In .zshrc or .bashrc
alias aiyoucli='AIYOUCLI_MEMORY_DIMENSIONS=512 AIYOUCLI_SWARM_TOPOLOGY=mesh aiyoucli'
```
