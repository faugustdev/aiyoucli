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
import {
  generateSettings,
  parseToolTargets,
  type ToolTarget,
  type FileWriteResult,
  type FileWriteStatus,
} from "../init/settings-generator.js";
import { interactiveInit } from "../init/interactive.js";
import { renderStatusline, generateStatuslineScript } from "../statusline/generator.js";
import { startInteractive, stopInteractive, showStatus } from "../models/manager.js";
import { ask } from "../init/interactive.js";
import { setupAiyouTeam, checkAiyouTeamStatus } from "../init/team-setup.js";
import { runWireValidation } from "../init/wire-validate.js";
import {
  runVerification,
  renderInitSummary,
  renderWireReport,
  type VerifyReport,
} from "../init/verify.js";
import { warmup, renderWarmupReport, type WarmupReport } from "../init/warmup.js";
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

const STATUS_SYMBOL: Record<FileWriteStatus, string> = {
  created: "+",
  merged: "~",
  updated: "↻",
  skipped: "·",
};

const STATUS_COLOR: Record<FileWriteStatus, (s: string) => string> = {
  created: color.green,
  merged: color.cyan,
  updated: color.yellow,
  skipped: color.dim,
};

function renderFileResult(result: FileWriteResult, cwd: string): string {
  const sym = STATUS_COLOR[result.status](STATUS_SYMBOL[result.status]);
  const rel = result.path.replace(cwd + "/", "");
  const suffix = result.status === "skipped" ? color.dim(" (preserved)") : "";
  return `  ${sym} ${rel}${suffix}`;
}

const TOOL_LABELS: Record<ToolTarget, string> = {
  claude: "Claude Code",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};

async function selectTargetsInteractively(): Promise<ToolTarget[]> {
  console.log(`\n${color.bold("Select tools to configure:")}\n`);
  console.log(`  ${color.cyan("1")}  Claude Code`);
  console.log(`  ${color.cyan("2")}  Gemini CLI`);
  console.log(`  ${color.cyan("3")}  OpenCode`);
  console.log(`  ${color.cyan("4")}  ${color.bold("All")}\n`);

  const answer = await ask(`  Enter numbers (e.g. 1,3) or 4 for all: `);

  if (answer === "4" || answer === "") {
    return ["claude", "gemini", "opencode"];
  }

  const map: Record<string, ToolTarget> = { "1": "claude", "2": "gemini", "3": "opencode" };
  const selected = answer
    .split(",")
    .map((s) => s.trim())
    .map((s) => map[s])
    .filter((t): t is ToolTarget => !!t);

  return selected.length > 0 ? selected : ["claude", "gemini", "opencode"];
}

const initCommand: Command = {
  name: "init",
  description: "Initialize project (AGENTS.md, settings, skills) with full ecosystem bootstrap",
  options: [
    { name: "force", short: "f", description: "Overwrite existing files", type: "boolean" },
    { name: "skip-skills", description: "Skip interactive skills setup", type: "boolean" },
    { name: "skip-verify", description: "Skip Phase 4 verification probes (faster, no MCP calls)", type: "boolean" },
    { name: "skip-index", description: "Skip Phase 3 auto-indexing (faster init)", type: "boolean" },
    { name: "skip-team", description: "Skip Phase 3 team/swarm initialization", type: "boolean" },
    { name: "skip-proxy", description: "Skip Phase 3 proxy health checks", type: "boolean" },
    { name: "tool", short: "t", description: "Tools to configure: claude, gemini, opencode, all (default: all)", type: "string" },
  ],
  examples: [
    { command: "aiyoucli init", description: "Initialize with full 4-phase bootstrap (wire + write + warm + verify)" },
    { command: "aiyoucli init --tool opencode", description: "Initialize for OpenCode only" },
    { command: "aiyoucli init --tool claude,opencode", description: "Initialize for Claude Code and OpenCode" },
    { command: "aiyoucli init --tool all", description: "Initialize for all supported tools" },
    { command: "aiyoucli init --skip-verify", description: "Skip Phase 4 verification (faster init)" },
  ],
  action: async (ctx) => {
    const cwd = ctx.cwd;

    // Resolve which tools to configure
    let targets: ToolTarget[] | undefined;
    const toolFlag = (ctx.flags.tool ?? ctx.flags.t) as string | undefined;

    if (toolFlag) {
      targets = parseToolTargets(toolFlag);
      if (targets && targets.length > 0) {
        output.log(`  Configuring: ${targets.map((t) => TOOL_LABELS[t]).join(", ")}\n`);
      }
    } else if (ctx.interactive) {
      targets = await selectTargetsInteractively();
      output.log(`  Configuring: ${targets.map((t) => TOOL_LABELS[t]).join(", ")}\n`);
    }
    // If not interactive and no flag, targets remains undefined = all

    const spinner = output.spinner("Initializing project...");
    spinner.start();

    const fileResults: FileWriteResult[] = [];

    // 1. Generate AGENTS.md (always)
    try {
      const agentsMdResult = await generateAgentsMd(cwd, {
        force: ctx.flags.force as boolean,
        cwd,
      });
      // Warn when an existing AGENTS.md is being overwritten with significantly different content
      if (agentsMdResult.diff) {
        const { previousBytes, newBytes } = agentsMdResult.diff;
        const ratio = previousBytes > 0 ? newBytes / previousBytes : 1;
        if (ratio > 1.5 || ratio < 0.5) {
          output.warn(
            `AGENTS.md will be replaced: ${previousBytes}B → ${newBytes}B ` +
              `(your customizations will be lost)`
          );
        }
      }
      fileResults.push(agentsMdResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already exists") && !ctx.flags.force) {
        output.debug("AGENTS.md already exists, skipping");
        // Surface at normal verbosity too, so the user understands why their file wasn't updated
        output.info("AGENTS.md already exists (use --force to overwrite)");
      } else {
        spinner.fail(`Failed to generate AGENTS.md: ${msg}`);
        return { success: false, exitCode: 1 };
      }
    }

    // 2. Generate tool-specific configs
    try {
      const settingsResults = await generateSettings(cwd, targets, ctx.flags.force as boolean);
      fileResults.push(...settingsResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      spinner.fail(`Failed to generate settings: ${msg}`);
      return { success: false, exitCode: 1 };
    }

    // Summarize: created/merged/updated = changes, skipped = no-op
    const changes = fileResults.filter((r) => r.status !== "skipped").length;
    const skipped = fileResults.filter((r) => r.status === "skipped").length;

    if (changes === 0 && skipped > 0) {
      spinner.succeed(
        `Project already configured (${skipped} file${skipped === 1 ? "" : "s"} preserved)`
      );
    } else if (changes === 0 && skipped === 0) {
      spinner.succeed("Project initialized");
    } else {
      const parts: string[] = [];
      if (fileResults.some((r) => r.status === "created")) {
        parts.push(`${fileResults.filter((r) => r.status === "created").length} created`);
      }
      if (fileResults.some((r) => r.status === "merged")) {
        parts.push(`${fileResults.filter((r) => r.status === "merged").length} merged`);
      }
      if (fileResults.some((r) => r.status === "updated")) {
        parts.push(`${fileResults.filter((r) => r.status === "updated").length} updated`);
      }
      if (skipped > 0) parts.push(`${skipped} preserved`);
      spinner.succeed(`Project initialized — ${parts.join(", ")}`);
    }

    for (const result of fileResults) {
      output.log(renderFileResult(result, cwd));
    }

    // 2b. Phase 2 — Wire validation: probe dependencies before attempting
    //     any heavy work. Read-only, no installs. Fails fast on missing
    //     binaries but does not abort the init.
    const teamStatus = !targets || targets.includes("opencode")
      ? checkAiyouTeamStatus()
      : undefined;
    const wireReport = runWireValidation({
      cwd,
      aiyouTeam: teamStatus
        ? { installed: teamStatus.installed, via: teamStatus.via }
        : undefined,
    });
    renderWireReport(wireReport);

    if (wireReport.hasFailures) {
      output.log("");
      output.warn(
        "Some required dependencies are missing. The bootstrap will continue " +
          "but later phases may be incomplete. See suggestions above."
      );
    }

    // 3. Auto-install aiyou-team if OpenCode target and not already installed
    if (!targets || targets.includes("opencode")) {
      const teamStatus = checkAiyouTeamStatus();
      if (!teamStatus.installed) {
        output.log("");
        const teamSpinner = output.spinner("Installing aiyou-team (required for OpenCode plugin)...");
        teamSpinner.start();
        try {
          const setupResult = await setupAiyouTeam({
            verbose: ctx.flags.verbose as boolean,
          });
          if (setupResult.setupRan && setupResult.failurePhase === null) {
            teamSpinner.succeed(
              `aiyou-team ${setupResult.installed ? "installed" : "configured"} - ${setupResult.teamsConfigured.join(", ")}`
            );
          } else if (setupResult.installed && setupResult.setupRan) {
            teamSpinner.warn("aiyou-team installed but validation flagged issues");
            output.log(`  ${setupResult.message}`);
          } else if (setupResult.installed) {
            teamSpinner.warn("aiyou-team installed but setup incomplete");
            output.log(`  ${setupResult.message}`);
            output.log(`  ${color.yellow("*")} Run ${color.cyan("aiyou-team setup")} manually to complete.`);
          } else {
            teamSpinner.fail(`aiyou-team auto-install failed at phase: ${setupResult.failurePhase ?? "unknown"}`);
            output.log(`  ${setupResult.message}`);
            const skipTeam = ctx.flags.skipTeam as boolean;
            if (!skipTeam) {
              output.log("");
              output.warn(
                "Without aiyou-team plugin, the 8 agents listed in AGENTS.md " +
                  "(coding-leader, coding-executor, etc.) will NOT be available. " +
                  "Either fix the install above, or re-run with --skip-team to opt out."
              );
            }
          }
        } catch (err) {
          teamSpinner.fail("aiyou-team auto-install crashed");
          const msg = err instanceof Error ? err.message : String(err);
          output.log(`  ${msg}`);
          output.log(`  ${color.yellow("*")} Run ${color.cyan("aiyoucli setup")} manually to enable agent teams.`);
        }
      } else {
        output.log(`  ${color.green("✓")} aiyou-team ${color.dim(`(via ${teamStatus.via})`)}`);
      }
    }

    // 3b. Phase 3 — Warmup: initialize vector memory, graph, q-table, swarm, agents, proxy health
    let warmupReport: WarmupReport | null = null;
    const skipIndex = ctx.flags.skipIndex as boolean;
    const skipTeam = ctx.flags.skipTeam as boolean;
    const skipProxy = ctx.flags.skipProxy as boolean;

    // Warmup runs for opencode target or when no specific target is set
    if (!targets || targets.includes("opencode")) {
      try {
        ensureTools();
        warmupReport = await warmup({
          cwd,
          skipIndex,
          skipTeam,
          skipProxy,
        });
        renderWarmupReport(warmupReport);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.warn(`Phase 3 (warmup) crashed: ${msg}`);
      }
    }

    // 4. Interactive skills setup (if terminal is interactive)
    if (!ctx.flags["skip-skills"] && ctx.interactive) {
      try {
        const skillPaths = await interactiveInit(cwd);
        for (const p of skillPaths) {
          fileResults.push({ path: p, status: "created" });
        }
      } catch {
        // Non-critical — skills are optional
      }
    }

    // 5. Phase 4 — Verify: aggregate health signals from MCP tools.
    //     Read-only. Always runs (unless --skip-verify), even if earlier
    //     phases reported issues, so the user sees the full picture.
    let verifyReport: VerifyReport | null = null;
    if (ctx.flags.skipVerify) {
      output.log("");
      output.info("Phase 4 (verify) skipped via --skip-verify");
    } else {
      try {
        ensureTools();
        verifyReport = await runVerification({
          cwd,
          callTool: async (name, input) => {
            const r = await callTool(name, input);
            const text = r.content[0]?.text ?? "";
            return { ok: !r.isError, text, isError: r.isError };
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.warn(`Phase 4 (verify) crashed: ${msg}`);
      }

      if (verifyReport) {
        renderInitSummary(wireReport, verifyReport);
      }
    }

    // Exit 0 even on degraded — by project policy. The user gets the full
    // report and decides what to do. Only hard failures in Phase 1
    // (AGENTS.md / settings) exit non-zero above.
    output.log("");
    return { success: true };
  },
};

// ── 1b. setup (global) ──────────────────────────────────────────────

const setupCommand: Command = {
  name: "setup",
  description: "Global setup: install and configure aiyou-team for OpenCode",
  options: [
    { name: "dry-run", description: "Show what would be done without making changes", type: "boolean" },
    { name: "verbose", short: "v", description: "Show detailed output", type: "boolean" },
  ],
  examples: [
    { command: "aiyoucli setup", description: "Install and configure aiyou-team globally" },
    { command: "aiyoucli setup --dry-run", description: "Preview what setup would do" },
    { command: "aiyoucli setup --verbose", description: "Show detailed installation output" },
  ],
  action: async (ctx) => {
    const status = checkAiyouTeamStatus();

    if (status.installed) {
      output.log(`  ${color.green("✓")} aiyou-team is already installed globally`);
      output.log(`  Run ${color.cyan("aiyoucli init")} in a project to configure agent teams.\n`);
      return { success: true };
    }

    const spinner = output.spinner("Setting up aiyou-team...");
    spinner.start();

    const result = await setupAiyouTeam({
      dryRun: ctx.flags["dry-run"] as boolean,
      verbose: ctx.flags.verbose as boolean,
    });

    if (result.setupRan) {
      spinner.succeed("aiyou-team configured");
      output.log(`  ${color.cyan("★")} ${result.message}`);
      output.log(`\n  Run ${color.cyan("aiyoucli init")} in a project to enable agent teams.\n`);
    } else if (!result.installed) {
      spinner.fail("Failed to install aiyou-team");
      output.log(`\n${result.message}\n`);
    } else {
      spinner.stop();
      output.log(`  ${color.yellow("★")} aiyou-team installed but setup incomplete`);
      output.log(`  ${result.message}`);
      output.log(`  Run ${color.cyan("aiyou-team setup")} manually.\n`);
    }

    return { success: result.setupRan };
  },
};

// ── 2. agent ───────────────────────────────────────────────────────

const agentCommand: Command = {
  name: "agent",
  description: "Agent lifecycle (spawn, list, stop, record, metrics)",
  examples: [
    { command: "aiyoucli agent spawn --type coder --name worker-1", description: "Spawn a coder agent with a custom name" },
    { command: "aiyoucli agent spawn --type architect --model opus", description: "Spawn an architect agent using opus-tier model" },
    { command: "aiyoucli agent spawn --type researcher --model haiku", description: "Spawn a lightweight researcher agent" },
    { command: "aiyoucli agent list", description: "List all active agents" },
    { command: "aiyoucli agent status --id agent_xxxx", description: "Check status and metrics of a specific agent" },
    { command: "aiyoucli agent stop --id agent_xxxx", description: "Stop an agent by ID" },
    { command: "aiyoucli agent record --id agent_xxxx --success true --duration-ms 15000", description: "Record a successful task outcome" },
  ],
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
        const result = await callTool("stats", { scope: "agents" });
        printJson(result);
      },
    },
  ],
};

// ── 3. swarm ───────────────────────────────────────────────────────

const swarmCommand: Command = {
  name: "swarm",
  description: "Swarm coordination (init, status, stop)",
  examples: [
    { command: "aiyoucli swarm init --topology hierarchical --maxAgents 5 --strategy specialized", description: "Initialize a hierarchical swarm with 5 specialized agents" },
    { command: "aiyoucli swarm init --topology mesh --maxAgents 8 --strategy balanced", description: "Initialize a mesh topology swarm for balanced load distribution" },
    { command: "aiyoucli swarm init --topology star --strategy adaptive", description: "Initialize a star-topology swarm with adaptive agent spawning" },
    { command: "aiyoucli swarm status", description: "Check swarm state and connected agents" },
    { command: "aiyoucli swarm stop", description: "Stop the active swarm" },
  ],
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
        const result = await callTool("status", { scope: "swarm" });
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
        const result = await callTool("stats", { scope: "memory" });
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
        const result = await callTool("route", { action: "qlearn", task });
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
        const result = await callTool("stats", { scope: "routing" });
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
    const result = await callTool("status", { scope: "system" });
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
        const result = await callTool("stats", { scope: "neural" });
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
        const result = await callTool("analyze", { type: "diff", diff });
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
        const result = await callTool("analyze", { type: "commit", message });
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
        const result = await callTool("analyze", { type: "complexity", source });
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
    const result = await callTool("route", { action: "qlearn", task });
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

// ── 22. models ────────────────────────────────────────────────────

const modelsCommand: Command = {
  name: "models",
  description: "Manage local GGUF models (list, optimize, start, stop, status)",
  examples: [
    { command: "aiyoucli models list --path /home/user/models/", description: "List all GGUF files in a directory with quantization details" },
    { command: "aiyoucli models optimize --model llama-3.1-8b", description: "Get Unsloth Dynamic v2.0 upgrade recommendation for a model" },
    { command: "aiyoucli models start", description: "Interactive assistant to select work mode and launch llama-server" },
    { command: "aiyoucli models stop", description: "Stop all running llama-server instances" },
    { command: "aiyoucli models status", description: "Show status of active models" },
    { command: "aiyoucli models list", description: "Scan default .aiyoucli/models/ directory" },
  ],
  subcommands: [
    {
      name: "list",
      description: "Scan for GGUF models and show Unsloth Dynamic v2.0 upgrade recommendations",
      options: [
        { name: "path", short: "p", description: "Directory to scan (default: .aiyoucli/models/)", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("models", { action: "list", path: ctx.flags.path || ctx.flags.p });
        const raw = result.content[0]?.text ?? "{}";
        try {
          const data = JSON.parse(raw);
          output.log(color.bold("\naiyoucli models\n"));
          output.log(`  Scanned: ${data.scanned_path}`);
          if (!data.exists) {
            output.log(color.yellow(`  ${data.message}`));
            output.log("");
            return;
          }
          output.log(`  Models:  ${data.total_models}  Total: ${data.total_size_gb} GB\n`);
          for (const m of data.models) {
            const badge = m.quantization;
            const size = m.size_gb.toFixed(2).padStart(7) + " GB";
            output.log(`  ${color.cyan(m.file)}`);
            output.log(`    Quant: ${badge}  Size: ${size}`);
            if (m.unsloth_upgrade) {
              output.log(`    ${color.green("✦ Unsloth Dynamic v2.0 available:")}`);
              output.log(`      Repo: ${m.unsloth_upgrade.repo}`);
              output.log(`      ${m.unsloth_upgrade.note}`);
            } else {
              output.log(`    ${color.yellow("○ No Unsloth Dynamic v2.0 known for this model")}`);
            }
            output.log("");
          }
        } catch {
          output.log(raw);
        }
      },
    },
    {
      name: "optimize",
      description: "Get Unsloth Dynamic v2.0 recommendation for a specific model",
      options: [
        { name: "model", short: "m", description: "Model name (e.g. llama-3.1-8b)", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const model = ctx.flags.model || ctx.flags.m || ctx.args.join(" ");
        if (!model) { output.error("Model name required: --model <name>"); return; }
        const result = await callTool("models", { action: "optimize", model });
        printJson(result);
      },
    },
    {
      name: "start",
      description: "Interactive assistant to select work mode, models, download from MinIO if needed, validate VRAM, and launch llama-server in background",
      action: async () => {
        const result = await startInteractive();
        if (!result.ok) {
          output.error(result.message);
        } else {
          output.log(color.green(result.message));
        }
      },
    },
    {
      name: "stop",
      description: "Stop all running llama-server instances",
      action: async () => {
        const result = stopInteractive();
        if (result.ok) {
          output.log(color.green(result.message));
        } else {
          output.error(result.message);
        }
      },
    },
    {
      name: "status",
      description: "Show status of active models",
      action: async () => {
        const status = showStatus();
        output.log(status);
      },
    },
  ],
};

// ── 23. rd (deep research) ──────────────────────────────────────────

const rdCommand: Command = {
  name: "rd",
  description: "Deep research (strategies, search, documents, knowledge graph)",
  examples: [
    { command: "aiyoucli rd init --query 'Rust zero-copy deserialization patterns' --strategy langgraph-agent", description: "Start autonomous deep research on a topic" },
    { command: "aiyoucli rd search --query 'HNSW vs IVF index performance' --engine arxiv", description: "Search academic papers on arXiv" },
    { command: "aiyoucli rd strategies", description: "List all available research strategies" },
    { command: "aiyoucli rd status --session-id rd_xxxx", description: "Check research session progress" },
    { command: "aiyoucli rd report --session-id rd_xxxx --format markdown", description: "Generate markdown research report" },
    { command: "aiyoucli rd doc --path paper.pdf --ocr", description: "Queue a scanned PDF for OCR processing" },
  ],
  subcommands: [
    {
      name: "init",
      description: "Initialize a deep research session",
      options: [
        { name: "query", short: "q", description: "Research query", type: "string", required: true },
        { name: "strategy", short: "s", description: "Strategy: langgraph-agent, source-based, focused-iteration, quick", type: "string" },
        { name: "max-iterations", short: "i", description: "Max iterations (default: 50)", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const query = ctx.flags.query || ctx.flags.q || ctx.args.join(" ");
        if (!query) { output.error("Query required: --query <text>"); return; }
        const result = await callTool("rd_init", {
          query,
          strategy: ctx.flags.strategy || ctx.flags.s,
          max_iterations: ctx.flags["max-iterations"] || ctx.flags.i,
        });
        printJson(result);
      },
    },
    {
      name: "search",
      description: "Search the web for research sources",
      options: [
        { name: "query", short: "q", description: "Search query", type: "string", required: true },
        { name: "engine", short: "e", description: "Engine: searxng, arxiv, pubmed, wikipedia", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const query = ctx.flags.query || ctx.flags.q || ctx.args.join(" ");
        if (!query) { output.error("Query required: --query <text>"); return; }
        const result = await callTool("rd_search", {
          query,
          engine: ctx.flags.engine || ctx.flags.e,
        });
        printJson(result);
      },
    },
    {
      name: "strategies",
      description: "List available research strategies",
      action: async () => {
        ensureTools();
        const result = await callTool("rd_strategies", {});
        printJson(result);
      },
    },
    {
      name: "status",
      description: "Check session status",
      options: [
        { name: "session-id", short: "s", description: "Session ID", type: "string", required: true },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags["session-id"] || ctx.flags.s || ctx.args[0];
        if (!id) { output.error("Session ID required: --session-id <id>"); return; }
        const result = await callTool("rd_status", { session_id: id });
        printJson(result);
      },
    },
    {
      name: "report",
      description: "Generate research report from completed session",
      options: [
        { name: "session-id", short: "s", description: "Session ID", type: "string", required: true },
        { name: "format", short: "f", description: "Format: markdown, json, text", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const id = ctx.flags["session-id"] || ctx.flags.s || ctx.args[0];
        if (!id) { output.error("Session ID required: --session-id <id>"); return; }
        const result = await callTool("rd_report", {
          session_id: id,
          format: ctx.flags.format || ctx.flags.f,
        });
        printResult(result);
      },
    },
    {
      name: "doc",
      description: "Queue a document for processing (bgustdown/bgustreadimg)",
      options: [
        { name: "path", short: "p", description: "Document file path", type: "string", required: true },
        { name: "ocr", description: "Enable OCR for scanned documents", type: "boolean" },
      ],
      action: async (ctx) => {
        ensureTools();
        const path = ctx.flags.path || ctx.flags.p || ctx.args[0];
        if (!path) { output.error("Path required: --path <file>"); return; }
        const result = await callTool("rd_document_process", {
          path,
          ocr: ctx.flags.ocr ?? false,
        });
        printJson(result);
      },
    },
  ],
};

// ── 24. skills ────────────────────────────────────────────────────

const skillsCommand: Command = {
  name: "skills",
  description: "Manage project skills (sync, list)",
  subcommands: [
    {
      name: "sync",
      description: "Detect new skills, distill to TOON, clean MDs",
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("skills_sync", { project_dir: ctx.cwd });
        printResult(result);
      },
    },
    {
      name: "list",
      description: "List installed TOON skills",
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("skills_list", { project_dir: ctx.cwd });
        printJson(result);
      },
    },
    {
      name: "detect",
      description: "Detect project technologies",
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("skills_detect", { project_dir: ctx.cwd });
        printJson(result);
      },
    },
  ],
};

// ── Export ──────────────────────────────────────────────────────────

export const commands: Command[] = [
  initCommand,
  setupCommand,
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
  modelsCommand,
  rdCommand,
  skillsCommand,
];
