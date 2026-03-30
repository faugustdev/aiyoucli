/**
 * CLI command definitions — thin wrappers over MCP tools.
 *
 * Each command parses flags/args, calls the appropriate MCP tool via
 * `callTool`, and formats the result using `output`/`color`.
 */

import { callTool, registry } from "../mcp/client.js";
import { output, color } from "../output.js";
import { registerAllTools } from "../mcp/tools/index.js";
import { startMCPServer } from "../mcp/server.js";
import { generateAgentsMd } from "../init/agentsmd-generator.js";
import { generateSettings } from "../init/settings-generator.js";
import { interactiveInit } from "../init/interactive.js";
import { renderStatusline, generateStatuslineScript } from "../statusline/generator.js";
import type { Command, MCPToolResult } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────

let toolsRegistered = false;
function ensureTools(): void {
  if (!toolsRegistered) {
    registerAllTools();
    toolsRegistered = true;
  }
}

/** Print the text content from a tool result. */
function printResult(result: MCPToolResult): void {
  const text = result.content[0]?.text ?? "";
  if (result.isError) {
    output.error(text);
  } else {
    output.log(text);
  }
}

/** Try to pretty-print JSON, fall back to raw text. */
function printJson(result: MCPToolResult): void {
  const raw = result.content[0]?.text ?? "";
  if (result.isError) {
    output.error(raw);
    return;
  }
  try {
    const data = JSON.parse(raw);
    output.json(data);
  } catch {
    output.log(raw);
  }
}

// ── 1. init ────────────────────────────────────────────────────────

const initCommand: Command = {
  name: "init",
  description: "Initialize project (AGENTS.md, settings, skills)",
  options: [
    { name: "force", short: "f", description: "Overwrite existing files", type: "boolean" },
    { name: "skip-skills", description: "Skip interactive skills setup", type: "boolean" },
  ],
  action: async (ctx) => {
    const cwd = ctx.cwd;
    const spinner = output.spinner("Initializing project...");
    spinner.start();

    const created: string[] = [];

    try {
      const agentsMdPath = await generateAgentsMd(cwd);
      created.push(agentsMdPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already exists") && !ctx.flags.force) {
        output.debug("AGENTS.md already exists, skipping");
      } else {
        spinner.fail(`Failed to generate AGENTS.md: ${msg}`);
        return { success: false, exitCode: 1 };
      }
    }

    try {
      const settingsPaths = await generateSettings(cwd);
      created.push(...settingsPaths);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      spinner.fail(`Failed to generate settings: ${msg}`);
      return { success: false, exitCode: 1 };
    }

    spinner.succeed("Project initialized");
    for (const path of created) {
      output.log(`  ${color.green("+")} ${path.replace(cwd + "/", "")}`);
    }

    // Interactive skills setup (if terminal is interactive)
    if (!ctx.flags["skip-skills"] && ctx.interactive) {
      try {
        const skillPaths = await interactiveInit(cwd);
        created.push(...skillPaths);
      } catch {
        // Non-critical — skills are optional
      }
    }

    output.log("");
    return { success: true };
  },
};

// ── 2. agent ───────────────────────────────────────────────────────

const agentCommand: Command = {
  name: "agent",
  description: "Agent lifecycle (spawn, list, stop, record, metrics)",
  subcommands: [
    {
      name: "spawn",
      description: "Spawn a new agent",
      options: [
        { name: "type", short: "t", description: "Agent type", type: "string" },
        { name: "name", short: "n", description: "Agent name", type: "string" },
        { name: "model", short: "m", description: "Model: haiku, sonnet, opus", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("agent_spawn", {
          type: ctx.flags.type || ctx.flags.t || ctx.args[0] || "coder",
          name: ctx.flags.name || ctx.flags.n || ctx.args[1],
          model: ctx.flags.model || ctx.flags.m,
        });
        printJson(result);
      },
    },
    {
      name: "list",
      description: "List active agents",
      action: async () => {
        ensureTools();
        const result = await callTool("agent_list", {});
        printJson(result);
      },
    },
    {
      name: "status",
      description: "Get agent status",
      options: [
        { name: "id", description: "Agent ID", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags.id || ctx.args[0];
        if (!id) { output.error("Agent ID required: --id <id>"); return; }
        const result = await callTool("agent_status", { id });
        printJson(result);
      },
    },
    {
      name: "stop",
      description: "Stop an agent",
      options: [
        { name: "id", description: "Agent ID", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags.id || ctx.args[0];
        if (!id) { output.error("Agent ID required: --id <id>"); return; }
        const result = await callTool("agent_stop", { id });
        printResult(result);
      },
    },
    {
      name: "record",
      description: "Record a task outcome for an agent",
      options: [
        { name: "id", description: "Agent ID", type: "string", required: true },
        { name: "success", description: "Task succeeded (true/false)", type: "string", required: true },
        { name: "duration-ms", description: "Task duration in ms", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags.id || ctx.args[0];
        if (!id) { output.error("Agent ID required: --id <id>"); return; }
        const success = String(ctx.flags.success ?? ctx.args[1]).toLowerCase() === "true";
        const result = await callTool("agent_record", {
          id,
          success,
          duration_ms: ctx.flags["duration-ms"] ?? 0,
        });
        printJson(result);
      },
    },
    {
      name: "metrics",
      description: "Get aggregated metrics across all agents",
      action: async () => {
        ensureTools();
        const result = await callTool("agent_metrics", {});
        printJson(result);
      },
    },
  ],
};

// ── 3. swarm ───────────────────────────────────────────────────────

const swarmCommand: Command = {
  name: "swarm",
  description: "Swarm coordination (init, status, stop)",
  subcommands: [
    {
      name: "init",
      description: "Initialize a multi-agent swarm",
      options: [
        { name: "topology", description: "hierarchical, mesh, ring, star, hybrid", type: "string" },
        { name: "maxAgents", description: "Maximum agents (default: 8)", type: "number" },
        { name: "strategy", description: "specialized, balanced, adaptive", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("swarm_init", {
          topology: ctx.flags.topology || "hierarchical",
          maxAgents: ctx.flags.maxAgents || 8,
          strategy: ctx.flags.strategy || "specialized",
        });
        printJson(result);
      },
    },
    {
      name: "status",
      description: "Get swarm status",
      action: async () => {
        ensureTools();
        const result = await callTool("swarm_status", {});
        printJson(result);
      },
    },
    {
      name: "stop",
      description: "Stop the active swarm",
      action: async () => {
        ensureTools();
        const result = await callTool("swarm_stop", {});
        printResult(result);
      },
    },
  ],
};

// ── 4. memory ──────────────────────────────────────────────────────

const memoryCommand: Command = {
  name: "memory",
  description: "Vector memory (store, search, list)",
  subcommands: [
    {
      name: "init",
      description: "Initialize memory database",
      options: [
        { name: "path", short: "p", description: "Storage path (omit for in-memory)", type: "string" },
        { name: "dimensions", short: "d", description: "Vector dimensions (default: 384)", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("memory_init", {
          path: ctx.flags.path || ctx.flags.p,
          dimensions: ctx.flags.dimensions || ctx.flags.d,
        });
        printResult(result);
      },
    },
    {
      name: "store",
      description: "Store a vector",
      options: [
        { name: "vector", description: "Comma-separated vector values", type: "string", required: true },
        { name: "id", description: "Optional vector ID", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const raw = (ctx.flags.vector as string) || ctx.args[0];
        if (!raw) { output.error("Vector required: --vector '1.0,2.0,3.0'"); return; }
        const cleaned = String(raw).replace(/[\[\]\s]/g, "");
        const vector = cleaned.split(",").map(Number);
        const result = await callTool("memory_store", {
          vector,
          id: ctx.flags.id,
        });
        printResult(result);
      },
    },
    {
      name: "search",
      description: "Search similar vectors",
      options: [
        { name: "vector", description: "Comma-separated query vector", type: "string", required: true },
        { name: "k", short: "k", description: "Number of results (default: 5)", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const raw = (ctx.flags.vector as string) || ctx.args[0];
        if (!raw) { output.error("Query vector required: --vector '1.0,2.0,3.0'"); return; }
        const cleaned = String(raw).replace(/[\[\]\s]/g, "");
        const vector = cleaned.split(",").map(Number);
        const result = await callTool("memory_search", {
          vector,
          k: ctx.flags.k || 5,
        });
        printJson(result);
      },
    },
    {
      name: "list",
      description: "Show vector count",
      action: async () => {
        ensureTools();
        const result = await callTool("memory_count", {});
        printResult(result);
      },
    },
    {
      name: "stats",
      description: "Show memory statistics",
      action: async () => {
        ensureTools();
        const result = await callTool("memory_stats", {});
        printJson(result);
      },
    },
    {
      name: "delete",
      description: "Delete a vector by ID",
      options: [
        { name: "id", description: "Vector ID", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags.id || ctx.args[0];
        if (!id) { output.error("Vector ID required: --id <id>"); return; }
        const result = await callTool("memory_delete", { id });
        printResult(result);
      },
    },
  ],
};

// ── 5. mcp ─────────────────────────────────────────────────────────

const mcpCommand: Command = {
  name: "mcp",
  description: "MCP server management",
  subcommands: [
    {
      name: "start",
      description: "Start MCP stdio server",
      action: async () => {
        startMCPServer();
      },
    },
    {
      name: "status",
      description: "Show MCP server info",
      action: async () => {
        ensureTools();
        const tools = registry.list();
        output.log(color.bold("MCP Server"));
        output.log(`  Transport: stdio`);
        output.log(`  Protocol:  2024-11-05`);
        output.log(`  Tools:     ${tools.length} registered`);
      },
    },
    {
      name: "tools",
      description: "List available MCP tools",
      action: async () => {
        ensureTools();
        const tools = registry.listForMCP();
        const rows = tools.map((t) => [t.name, t.description]);
        output.table(["Tool", "Description"], rows);
      },
    },
  ],
};

// ── 6. task ────────────────────────────────────────────────────────

const taskCommand: Command = {
  name: "task",
  description: "Task management",
  subcommands: [
    {
      name: "create",
      description: "Create a new task",
      options: [
        { name: "description", short: "d", description: "Task description", type: "string", required: true },
        { name: "priority", short: "p", description: "low, normal, high, critical", type: "string" },
        { name: "assignTo", short: "a", description: "Agent ID to assign", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const description = ctx.flags.description || ctx.flags.d || ctx.args.join(" ");
        if (!description) { output.error("Description required: --description <text>"); return; }
        const result = await callTool("task_create", {
          description,
          priority: ctx.flags.priority || ctx.flags.p,
          assignTo: ctx.flags.assignTo || ctx.flags.a,
        });
        printJson(result);
      },
    },
    {
      name: "list",
      description: "List all tasks",
      options: [
        { name: "status", short: "s", description: "Filter by status", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("task_list", {
          status: ctx.flags.status || ctx.flags.s,
        });
        printJson(result);
      },
    },
    {
      name: "status",
      description: "Get task status",
      options: [
        { name: "id", description: "Task ID", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags.id || ctx.args[0];
        if (!id) { output.error("Task ID required: --id <id>"); return; }
        const result = await callTool("task_status", { id });
        printJson(result);
      },
    },
    {
      name: "complete",
      description: "Mark a task as completed",
      options: [
        { name: "id", description: "Task ID", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags.id || ctx.args[0];
        if (!id) { output.error("Task ID required: --id <id>"); return; }
        const result = await callTool("task_complete", { id });
        printResult(result);
      },
    },
  ],
};

// ── 7. session ─────────────────────────────────────────────────────

const sessionCommand: Command = {
  name: "session",
  description: "Session management",
  subcommands: [
    {
      name: "start",
      description: "Start a new session",
      options: [
        { name: "id", description: "Session ID (auto-generated if omitted)", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("session_start", {
          id: ctx.flags.id || ctx.args[0],
        });
        printJson(result);
      },
    },
    {
      name: "end",
      description: "End a session",
      options: [
        { name: "id", description: "Session ID", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags.id || ctx.args[0];
        if (!id) { output.error("Session ID required: --id <id>"); return; }
        const result = await callTool("session_end", { id });
        printResult(result);
      },
    },
    {
      name: "list",
      description: "List all sessions",
      action: async () => {
        ensureTools();
        const result = await callTool("session_list", {});
        printJson(result);
      },
    },
  ],
};

// ── 8. hooks ───────────────────────────────────────────────────────

const hooksCommand: Command = {
  name: "hooks",
  description: "Lifecycle hooks + workers",
  subcommands: [
    {
      name: "route",
      description: "Route a task to optimal agent",
      options: [
        { name: "task", short: "t", description: "Task description", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const task = ctx.flags.task || ctx.flags.t || ctx.args.join(" ");
        if (!task) { output.error("Task description required: --task <text>"); return; }
        const result = await callTool("hooks_route", { task });
        printJson(result);
      },
    },
    {
      name: "pre-task",
      description: "Pre-task hook (routing recommendation)",
      options: [
        { name: "description", short: "d", description: "Task description", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const description = ctx.flags.description || ctx.flags.d || ctx.args.join(" ");
        if (!description) { output.error("Description required: --description <text>"); return; }
        const result = await callTool("hooks_pre_task", { description });
        printJson(result);
      },
    },
    {
      name: "post-task",
      description: "Post-task hook (record outcome)",
      options: [
        { name: "description", short: "d", description: "Task description", type: "string", required: true },
        { name: "agent", short: "a", description: "Agent type used", type: "string", required: true },
        { name: "success", short: "s", description: "Whether task succeeded", type: "boolean", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const description = ctx.flags.description || ctx.flags.d;
        const agent = ctx.flags.agent || ctx.flags.a;
        const success = ctx.flags.success ?? ctx.flags.s ?? true;
        if (!description || !agent) {
          output.error("Required: --description <text> --agent <type> --success");
          return;
        }
        const result = await callTool("hooks_post_task", {
          description,
          agent,
          success: success === true || success === "true",
        });
        printResult(result);
      },
    },
    {
      name: "stats",
      description: "Routing engine statistics",
      action: async () => {
        ensureTools();
        const result = await callTool("hooks_stats", {});
        printJson(result);
      },
    },
  ],
};

// ── 9. config ──────────────────────────────────────────────────────

const configCommand: Command = {
  name: "config",
  description: "Configuration",
  subcommands: [
    {
      name: "get",
      description: "Get configuration value",
      options: [
        { name: "key", short: "k", description: "Config key path (omit for full config)", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("config_get", {
          key: ctx.flags.key || ctx.flags.k || ctx.args[0],
        });
        printJson(result);
      },
    },
    {
      name: "set",
      description: "Set configuration value",
      options: [
        { name: "key", short: "k", description: "Config key path", type: "string", required: true },
        { name: "value", short: "v", description: "New value", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const key = ctx.flags.key || ctx.flags.k || ctx.args[0];
        const value = ctx.flags.value || ctx.flags.v || ctx.args[1];
        if (!key || value === undefined) {
          output.error("Required: --key <path> --value <val>");
          return;
        }
        const result = await callTool("config_set", { key, value });
        printResult(result);
      },
    },
  ],
};

// ── 10. status ─────────────────────────────────────────────────────

const statusCommand: Command = {
  name: "status",
  description: "System status",
  action: async () => {
    ensureTools();
    const result = await callTool("system_status", {});
    printJson(result);
  },
};

// ── 11. doctor ─────────────────────────────────────────────────────

const doctorCommand: Command = {
  name: "doctor",
  description: "Health diagnostics",
  action: async () => {
    ensureTools();
    const result = await callTool("system_doctor", {});
    const raw = result.content[0]?.text ?? "{}";
    try {
      const data = JSON.parse(raw) as {
        healthy: boolean;
        checks: Array<{ name: string; status: string; detail?: string }>;
      };
      output.log(color.bold("\naiyoucli doctor\n"));
      for (const check of data.checks) {
        const icon = check.status === "ok" ? color.green("OK") : color.red("FAIL");
        const detail = check.detail ? ` (${check.detail})` : "";
        output.log(`  ${check.name.padEnd(16)}${icon}${detail}`);
      }
      output.log("");
    } catch {
      printJson(result);
    }
  },
};

// ── 12. neural ─────────────────────────────────────────────────────

const neuralCommand: Command = {
  name: "neural",
  description: "Neural training + prediction",
  subcommands: [
    {
      name: "observe",
      description: "Submit observation to SONA engine",
      options: [
        { name: "embedding", description: "Comma-separated embedding vector", type: "string", required: true },
        { name: "quality", short: "q", description: "Quality score 0.0-1.0", type: "number", required: true },
        { name: "kind", short: "k", description: "Kind: commit, test, edit", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const raw = ctx.flags.embedding as string;
        const quality = ctx.flags.quality || ctx.flags.q;
        if (!raw || quality === undefined) {
          output.error("Required: --embedding '1,2,3' --quality 0.8");
          return;
        }
        const embedding = String(raw).split(",").map(Number);
        const result = await callTool("neural_observe", {
          embedding,
          quality,
          kind: ctx.flags.kind || ctx.flags.k,
        });
        printResult(result);
      },
    },
    {
      name: "learn",
      description: "Force background learning on buffered observations",
      action: async () => {
        ensureTools();
        const result = await callTool("neural_learn", {});
        printResult(result);
      },
    },
    {
      name: "stats",
      description: "SONA engine statistics",
      action: async () => {
        ensureTools();
        const result = await callTool("neural_stats", {});
        printJson(result);
      },
    },
  ],
};

// ── 13. security ───────────────────────────────────────────────────

const securityCommand: Command = {
  name: "security",
  description: "Security scanning",
  subcommands: [
    {
      name: "scan",
      description: "Run security scan",
      action: async () => {
        ensureTools();
        const spinner = output.spinner("Running security scan...");
        spinner.start();
        const result = await callTool("security_scan", {});
        spinner.stop();
        printJson(result);
      },
    },
  ],
};

// ── 14. analyze ────────────────────────────────────────────────────

const analyzeCommand: Command = {
  name: "analyze",
  description: "Code analysis",
  subcommands: [
    {
      name: "diff",
      description: "Classify a git diff",
      options: [
        { name: "diff", short: "d", description: "Git diff content (reads stdin if omitted)", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const diff = ctx.flags.diff || ctx.flags.d || ctx.args.join(" ");
        if (!diff) { output.error("Diff content required: --diff <content> or pipe via stdin"); return; }
        const result = await callTool("analyze_diff", { diff });
        printJson(result);
      },
    },
    {
      name: "commit",
      description: "Classify a commit message",
      options: [
        { name: "message", short: "m", description: "Commit message", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const message = ctx.flags.message || ctx.flags.m || ctx.args.join(" ");
        if (!message) { output.error("Commit message required: --message <text>"); return; }
        const result = await callTool("analyze_commit", { message });
        printResult(result);
      },
    },
    {
      name: "complexity",
      description: "Score code complexity",
      options: [
        { name: "source", short: "s", description: "Source code content", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const source = ctx.flags.source || ctx.flags.s || ctx.args.join(" ");
        if (!source) { output.error("Source code required: --source <code>"); return; }
        const result = await callTool("analyze_complexity", { source });
        printJson(result);
      },
    },
  ],
};

// ── 15. route ──────────────────────────────────────────────────────

const routeCommand: Command = {
  name: "route",
  description: "Task routing",
  options: [
    { name: "task", short: "t", description: "Task description", type: "string", required: true },
  ],
  action: async (ctx) => {
    ensureTools();
    const task = ctx.flags.task || ctx.flags.t || ctx.args.join(" ");
    if (!task) { output.error("Task description required: --task <text>"); return; }
    const result = await callTool("hooks_route", { task });
    printJson(result);
  },
};

// ── 16. gcc ────────────────────────────────────────────────────────

const gccCommand: Command = {
  name: "gcc",
  description: "Git context",
  action: async () => {
    ensureTools();
    const result = await callTool("git_context", {});
    printJson(result);
  },
};

// ── 17. daemon ─────────────────────────────────────────────────────

const daemonCommand: Command = {
  name: "daemon",
  description: "Background workers",
  action: async () => {
    output.log(color.yellow("daemon not yet implemented"));
  },
};

// ── 18. completions ────────────────────────────────────────────────

const completionsCommand: Command = {
  name: "completions",
  description: "Shell completions",
  options: [
    { name: "shell", short: "s", description: "Shell type: bash, zsh", type: "string" },
  ],
  action: async (ctx) => {
    const shell = (ctx.flags.shell || ctx.flags.s || ctx.args[0] || "bash") as string;
    const cmdNames = commands.map((c) => c.name).join(" ");

    if (shell === "zsh") {
      output.log(`#compdef aiyoucli
_aiyoucli() {
  local -a commands
  commands=(${commands.map((c) => `'${c.name}:${c.description.replace(/'/g, "")}'`).join(" ")})
  _describe 'command' commands
}
compdef _aiyoucli aiyoucli`);
    } else {
      output.log(`# bash completion for aiyoucli
_aiyoucli() {
  local cur=\${COMP_WORDS[COMP_CWORD]}
  COMPREPLY=( $(compgen -W "${cmdNames}" -- "$cur") )
}
complete -F _aiyoucli aiyoucli`);
    }
  },
};

// ── 19. update ─────────────────────────────────────────────────────

const updateCommand: Command = {
  name: "update",
  description: "Self-update",
  action: async () => {
    output.log(color.yellow("update not yet implemented"));
  },
};

// ── 20. performance ────────────────────────────────────────────────

const performanceCommand: Command = {
  name: "performance",
  description: "Performance profiling",
  subcommands: [
    {
      name: "benchmark",
      description: "Run vector search benchmark",
      options: [
        { name: "vectors", short: "n", description: "Number of vectors (default: 1000)", type: "number" },
        { name: "dimensions", short: "d", description: "Dimensions (default: 128)", type: "number" },
        { name: "queries", short: "q", description: "Number of queries (default: 100)", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const spinner = output.spinner("Running benchmark...");
        spinner.start();
        const result = await callTool("perf_benchmark", {
          vectors: ctx.flags.vectors || ctx.flags.n,
          dimensions: ctx.flags.dimensions || ctx.flags.d,
          queries: ctx.flags.queries || ctx.flags.q,
        });
        spinner.stop();
        printJson(result);
      },
    },
  ],
};

// ── 21. statusline ────────────────────────────────────────────────

const statuslineCommand: Command = {
  name: "statusline",
  description: "Display rich status dashboard",
  options: [
    { name: "json", description: "Output as JSON", type: "boolean" },
    { name: "compact", description: "Compact JSON output", type: "boolean" },
    { name: "generate", description: "Generate standalone script to .aiyoucli/helpers/", type: "boolean" },
  ],
  action: async (ctx) => {
    if (ctx.flags.generate) {
      const path = generateStatuslineScript(ctx.cwd);
      output.success(`Generated statusline script: ${path}`);
      return;
    }
    const result = renderStatusline(ctx.cwd, {
      json: ctx.flags.json as boolean,
      compact: ctx.flags.compact as boolean,
    });
    console.log(result);
  },
};

// ── Export ──────────────────────────────────────────────────────────

export const commands: Command[] = [
  initCommand,
  agentCommand,
  swarmCommand,
  memoryCommand,
  mcpCommand,
  taskCommand,
  sessionCommand,
  hooksCommand,
  configCommand,
  statusCommand,
  doctorCommand,
  neuralCommand,
  securityCommand,
  analyzeCommand,
  routeCommand,
  gccCommand,
  daemonCommand,
  completionsCommand,
  updateCommand,
  performanceCommand,
  statuslineCommand,
];
