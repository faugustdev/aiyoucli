/**
 * Configuration loader — file, env vars, defaults.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./types.js";

const DEFAULT_CONFIG: Config = {
  version: "0.1.0",
  projectRoot: process.cwd(),
  memory: {
    backend: "aiyouvector",
    storagePath: ".aiyoucli/memory",
    dimensions: 384,
    enableHNSW: true,
  },
  swarm: {
    topology: "hierarchical",
    maxAgents: 8,
    strategy: "specialized",
  },
  mcp: {
    transport: "stdio",
    port: 3100,
    autoStart: false,
  },
  cli: {
    color: true,
    interactive: process.stdin.isTTY ?? false,
    verbosity: "normal",
    format: "text",
  },
};

export function loadConfig(configPath?: string): Config {
  const cwd = process.cwd();

  // Try explicit path first
  if (configPath && existsSync(configPath)) {
    return mergeConfig(readJsonFile(configPath));
  }

  // Try default locations
  const candidates = [
    join(cwd, "aiyoucli.config.json"),
    join(cwd, ".aiyoucli", "config.json"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return mergeConfig(readJsonFile(path));
    }
  }

  // Env var overrides
  return applyEnvOverrides({ ...DEFAULT_CONFIG, projectRoot: cwd });
}

function readJsonFile(path: string): Partial<Config> {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Partial<Config>;
  } catch {
    return {};
  }
}

function mergeConfig(partial: Partial<Config>): Config {
  const merged: Config = {
    ...DEFAULT_CONFIG,
    ...partial,
    memory: { ...DEFAULT_CONFIG.memory, ...partial.memory },
    swarm: { ...DEFAULT_CONFIG.swarm, ...partial.swarm },
    mcp: { ...DEFAULT_CONFIG.mcp, ...partial.mcp },
    cli: { ...DEFAULT_CONFIG.cli, ...partial.cli },
  };
  return applyEnvOverrides(merged);
}

function applyEnvOverrides(config: Config): Config {
  const env = process.env;

  if (env.AIYOUCLI_MEMORY_BACKEND)
    config.memory.backend = env.AIYOUCLI_MEMORY_BACKEND as Config["memory"]["backend"];
  if (env.AIYOUCLI_MEMORY_PATH)
    config.memory.storagePath = env.AIYOUCLI_MEMORY_PATH;
  if (env.AIYOUCLI_MEMORY_DIMENSIONS)
    config.memory.dimensions = parseInt(env.AIYOUCLI_MEMORY_DIMENSIONS, 10);
  if (env.AIYOUCLI_SWARM_TOPOLOGY)
    config.swarm.topology = env.AIYOUCLI_SWARM_TOPOLOGY as Config["swarm"]["topology"];
  if (env.AIYOUCLI_SWARM_MAX_AGENTS)
    config.swarm.maxAgents = parseInt(env.AIYOUCLI_SWARM_MAX_AGENTS, 10);
  if (env.AIYOUCLI_MCP_PORT)
    config.mcp.port = parseInt(env.AIYOUCLI_MCP_PORT, 10);
  if (env.AIYOUCLI_VERBOSITY)
    config.cli.verbosity = env.AIYOUCLI_VERBOSITY as Config["cli"]["verbosity"];
  if (env.NO_COLOR) config.cli.color = false;

  return config;
}
