/**
 * Core type definitions for aiyoucli.
 */

// ── Command System ──────────────────────────────────────────────

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  subcommands?: Command[];
  options?: CommandOption[];
  examples?: CommandExample[];
  action?: CommandAction;
  hidden?: boolean;
}

export interface CommandOption {
  name: string;
  short?: string;
  description: string;
  type: "string" | "boolean" | "number" | "array";
  default?: unknown;
  required?: boolean;
  choices?: string[];
}

export interface CommandExample {
  command: string;
  description: string;
}

export type CommandAction = (ctx: CommandContext) => Promise<CommandResult | void>;

export interface CommandContext {
  args: string[];
  flags: ParsedFlags;
  config: Config;
  cwd: string;
  interactive: boolean;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  exitCode?: number;
}

export interface ParsedFlags {
  [key: string]: string | boolean | number | string[];
  _: string[];
}

export interface ParseResult {
  command: string[];
  flags: ParsedFlags;
  positional: string[];
  raw: string[];
}

// ── Configuration ───────────────────────────────────────────────

export interface Config {
  version: string;
  projectRoot: string;
  memory: MemoryConfig;
  swarm: SwarmConfig;
  mcp: MCPConfig;
  cli: CLIPreferences;
}

export interface MemoryConfig {
  backend: "aiyouvector" | "memory";
  storagePath: string;
  dimensions: number;
  enableHNSW: boolean;
}

export interface SwarmConfig {
  topology: "hierarchical" | "mesh" | "ring" | "star" | "hybrid";
  maxAgents: number;
  strategy: "specialized" | "balanced" | "adaptive";
}

export interface MCPConfig {
  transport: "stdio" | "http";
  port: number;
  autoStart: boolean;
}

export interface CLIPreferences {
  color: boolean;
  interactive: boolean;
  verbosity: Verbosity;
  format: "text" | "json" | "table";
}

export type Verbosity = "quiet" | "normal" | "verbose" | "debug";

// ── MCP Tools ───────────────────────────────────────────────────

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
  handler: (
    input: Record<string, unknown>
  ) => Promise<MCPToolResult>;
}

export interface MCPToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

// ── Errors ──────────────────────────────────────────────────────

export class CLIError extends Error {
  constructor(
    message: string,
    public code: string,
    public exitCode: number = 1,
    public details?: unknown
  ) {
    super(message);
    this.name = "CLIError";
  }
}

export class CommandNotFoundError extends CLIError {
  constructor(name: string) {
    super(`Unknown command: ${name}`, "COMMAND_NOT_FOUND", 127);
    this.name = "CommandNotFoundError";
  }
}
