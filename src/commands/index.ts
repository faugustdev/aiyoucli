/**
 * CLI command definitions — thin wrappers over MCP tools.
 *
 * Each command parses flags/args, calls the appropriate MCP tool via
 * `callTool`, and formats the result using `output`/`color`.
 */

import { spawnSync } from "node:child_process";

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
    { name: "skip-watcher", description: "Skip aiyouvector daemon watch hook (Phase 3.11)", type: "boolean" },
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
    const skipWatcher = ctx.flags.skipWatcher as boolean;

    // Warmup runs for every target. Vector memory, the knowledge graph, the
    // Q-table and project indexing are tool-agnostic — gating them on
    // `opencode` meant a Claude Code user got an uninitialized memory and a
    // "Run `aiyoucli init` to initialize" hint that could never come true.
    try {
      ensureTools();
      warmupReport = await warmup({
        cwd,
        skipIndex,
        skipTeam,
        skipProxy,
        skipWatcher,
      });
      renderWarmupReport(warmupReport);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      output.warn(`Phase 3 (warmup) crashed: ${msg}`);
    }

    // 4. Interactive skills setup (if terminal is interactive)
    // parser.ts camelCases every flag, so the kebab-case key this used to
    // read never matched and --skip-skills was silently ignored.
    if (!ctx.flags.skipSkills && ctx.interactive) {
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

// ── 1b. team register / install / uninstall / doctor ─────────────────

const teamRegisterCommand: Command = {
  name: "register",
  description: "Register the aiyou-team plugin in the OpenCode config (idempotent)",
  options: [
    { name: "dry-run", description: "Show what would be done without making changes", type: "boolean" },
    { name: "verbose", short: "v", description: "Show detailed output", type: "boolean" },
  ],
  examples: [
    { command: "aiyoucli team register", description: "Ensure the aiyou-team plugin is registered globally" },
    { command: "aiyoucli team register --verbose", description: "Verbose registration" },
  ],
  action: async (ctx) => {
    const result = await setupAiyouTeam({
      dryRun: ctx.flags["dry-run"] as boolean,
      verbose: ctx.flags.verbose as boolean,
    });

    if (result.failurePhase !== null) {
      output.log(`${color.red("✕")} ${result.message}`);
      return { success: false };
    }

    output.log(`${color.green("✓")} ${result.message}`);
    if (result.teamsConfigured.length > 0) {
      output.log(`  Teams: ${result.teamsConfigured.join(", ")}`);
    }
    return { success: true };
  },
};

const teamDoctorCommand: Command = {
  name: "doctor",
  description: "Run aiyou-team doctor for diagnostics",
  options: [
    { name: "config-path", description: "Path to the OpenCode config file", type: "string" },
  ],
  action: async (ctx) => {
    const args = ["aiyou-team", "doctor"];
    if (ctx.flags["config-path"]) {
      args.push("--config-path", String(ctx.flags["config-path"]));
    }
    const result = spawnSync("npx", args, {
      shell: process.platform === "win32",
      stdio: "inherit",
      timeout: 60_000,
    });
    if (result.error) {
      output.log(`${color.red("✕")} ${result.error.message}`);
      return { success: false };
    }
    return { success: result.status === 0 };
  },
};

const teamCommand: Command = {
  name: "team",
  description: "aiyou-team plugin management",
  subcommands: [teamRegisterCommand, teamDoctorCommand],
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
      description: "Search similar vectors by text query, or by a raw vector",
      options: [
        { name: "vector", description: "Comma-separated query vector (skips embedding)", type: "string" },
        { name: "k", short: "k", description: "Number of results (default: 5)", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const rawVector = ctx.flags.vector as string | undefined;
        const query = ctx.args[0];

        let vector: number[];
        if (rawVector) {
          const cleaned = String(rawVector).replace(/[\[\]\s]/g, "");
          vector = cleaned.split(",").map(Number);
          if (vector.some(Number.isNaN)) {
            output.error("--vector must be numeric, e.g. --vector '1.0,2.0,3.0'");
            return;
          }
        } else if (query) {
          // The indexer stores keyword embeddings, so a text query has to go
          // through the same embedder to be comparable. Previously this path
          // split the text on commas and produced [NaN], which the store
          // rejected as a 1-dimensional vector.
          const embedded = await callTool("embed", { type: "keyword", text: query });
          if (embedded.isError) {
            output.error(`Could not embed query: ${embedded.content[0]?.text ?? "unknown error"}`);
            return;
          }
          try {
            vector = JSON.parse(embedded.content[0]?.text ?? "");
          } catch {
            output.error("Embedder returned an unexpected payload");
            return;
          }
        } else {
          output.error("Query required: `aiyoucli memory search \"some text\"` or --vector '1.0,2.0'");
          return;
        }

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

// ── 4b. codebase ───────────────────────────────────────────────────
//
// Primary interface for codebase indexing/search/graph-query (mcp2cli
// principle: CLI over always-loaded MCP schemas — see
// codebase-project-tools.ts's header comment). Every action below calls
// the exact same MCP tool (`codebase_project`/`codebase_query`/
// `codebase_maintenance`) that the MCP-protocol path uses — zero
// duplicated logic, same pattern memoryCommand already uses for
// `memory_search` etc.

const codebaseCommand: Command = {
  name: "codebase",
  description: "Codebase indexing, search and graph queries (replaces the old `aiyouvector mcp` server)",
  subcommands: [
    {
      name: "index",
      description: "Index a repository into the knowledge graph",
      options: [
        {
          name: "mode",
          description: "Indexing depth: full, moderate, fast, cross-repo-intelligence",
          type: "string",
          choices: ["full", "moderate", "fast", "cross-repo-intelligence"],
        },
      ],
      action: async (ctx) => {
        ensureTools();
        const repoPath = ctx.args[0];
        if (!repoPath) { output.error("Repo path required: aiyoucli codebase index <path>"); return; }
        const result = await callTool("codebase_project", { mode: "index", repo_path: repoPath, index_mode: ctx.flags.mode });
        printJson(result);
      },
    },
    {
      name: "list",
      description: "List indexed projects",
      action: async () => {
        ensureTools();
        const result = await callTool("codebase_project", { mode: "list" });
        printJson(result);
      },
    },
    {
      name: "delete",
      description: "Remove a project's index",
      action: async (ctx) => {
        ensureTools();
        const project = ctx.args[0];
        if (!project) { output.error("Project name required: aiyoucli codebase delete <project>"); return; }
        const result = await callTool("codebase_project", { mode: "delete", project });
        printJson(result);
      },
    },
    {
      name: "status",
      description: "Show a project's node/edge counts and schema",
      action: async (ctx) => {
        ensureTools();
        const project = ctx.args[0];
        if (!project) { output.error("Project name required: aiyoucli codebase status <project>"); return; }
        const result = await callTool("codebase_query", { mode: "status", project });
        printJson(result);
      },
    },
    {
      name: "search",
      description: "BM25 or name-pattern search over a project",
      options: [
        { name: "query", short: "q", description: "BM25 search query", type: "string" },
        { name: "name-pattern", description: "Regex name pattern (alternative to --query)", type: "string" },
        { name: "label", description: "Node label filter, used with --name-pattern", type: "string" },
        { name: "limit", description: "Result cap (default 200)", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const project = ctx.args[0];
        if (!project) { output.error("Project name required: aiyoucli codebase search <project> --query ..."); return; }
        const result = await callTool("codebase_query", {
          mode: "search",
          project,
          query: ctx.flags.query || ctx.flags.q,
          name_pattern: ctx.flags.namePattern,
          label: ctx.flags.label,
          limit: ctx.flags.limit,
        });
        printJson(result);
      },
    },
    {
      name: "trace",
      description: "Trace a call graph from a function",
      options: [
        { name: "direction", description: "callers, callees, or both (default both)", type: "string", choices: ["callers", "callees", "both"] },
        { name: "depth", description: "Trace depth (default 3)", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const [project, functionName] = ctx.args;
        if (!project || !functionName) {
          output.error("Usage: aiyoucli codebase trace <project> <function_name>");
          return;
        }
        const result = await callTool("codebase_query", {
          mode: "trace",
          project,
          function_name: functionName,
          direction: ctx.flags.direction,
          depth: ctx.flags.depth,
        });
        printJson(result);
      },
    },
    {
      name: "changes",
      description: "Count files with a tracked hash for a project (not a git diff)",
      action: async (ctx) => {
        ensureTools();
        const project = ctx.args[0];
        if (!project) { output.error("Project name required: aiyoucli codebase changes <project>"); return; }
        const result = await callTool("codebase_query", { mode: "changes", project });
        printJson(result);
      },
    },
    {
      name: "query",
      description: "Run a Cypher-like query: MATCH (a:Label)-[:EDGE]->(b:Label) ... RETURN ...",
      options: [
        { name: "max-rows", description: "Row cap (default 1000)", type: "number" },
      ],
      action: async (ctx) => {
        ensureTools();
        const [project, cypher] = ctx.args;
        if (!project || !cypher) {
          output.error('Usage: aiyoucli codebase query <project> "<cypher>"');
          return;
        }
        const result = await callTool("codebase_query", {
          mode: "cypher",
          project,
          query: cypher,
          max_rows: ctx.flags.maxRows,
        });
        printJson(result);
      },
    },
    {
      name: "schema",
      description: "Show node labels and edge types for a project",
      action: async (ctx) => {
        ensureTools();
        const project = ctx.args[0];
        if (!project) { output.error("Project name required: aiyoucli codebase schema <project>"); return; }
        const result = await callTool("codebase_query", { mode: "schema", project });
        printJson(result);
      },
    },
    {
      name: "snippet",
      description: "Show the source of a fully qualified symbol",
      action: async (ctx) => {
        ensureTools();
        const [project, qualifiedName] = ctx.args;
        if (!project || !qualifiedName) {
          output.error("Usage: aiyoucli codebase snippet <project> <qualified_name>");
          return;
        }
        const result = await callTool("codebase_query", { mode: "snippet", project, qualified_name: qualifiedName });
        printJson(result);
      },
    },
    {
      name: "architecture",
      description: "Clustered architecture overview for a project",
      options: [
        { name: "aspects", description: "Comma-separated aspect filter (currently unused upstream)", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const project = ctx.args[0];
        if (!project) { output.error("Project name required: aiyoucli codebase architecture <project>"); return; }
        const aspects = ctx.flags.aspects ? String(ctx.flags.aspects).split(",") : undefined;
        const result = await callTool("codebase_query", { mode: "architecture", project, aspects });
        printJson(result);
      },
    },
    {
      name: "verify",
      description: "Verify the on-disk manifest against actual files",
      options: [
        { name: "init", description: "Generate the manifest from current disk state", type: "boolean" },
        { name: "strict", description: "Also fail on untracked files", type: "boolean" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("codebase_maintenance", { mode: "verify", init: ctx.flags.init, strict: ctx.flags.strict });
        printJson(result);
      },
    },
    {
      name: "export",
      description: "Archive a project",
      options: [
        { name: "out-dir", description: "Archive output directory", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const project = ctx.args[0];
        if (!project) { output.error("Project name required: aiyoucli codebase export <project>"); return; }
        const result = await callTool("codebase_project", { mode: "export", project, out_dir: ctx.flags.outDir });
        printJson(result);
      },
    },
    {
      name: "import",
      description: "Restore a project from an archive",
      action: async (ctx) => {
        ensureTools();
        const archive = ctx.args[0];
        if (!archive) { output.error("Archive path required: aiyoucli codebase import <archive>"); return; }
        const result = await callTool("codebase_project", { mode: "import", archive });
        printJson(result);
      },
    },
    {
      name: "observe",
      description: "Run an observer/SONA/profile learning pass over a repo without re-indexing it",
      action: async (ctx) => {
        ensureTools();
        const repoPath = ctx.args[0];
        if (!repoPath) { output.error("Repo path required: aiyoucli codebase observe <path>"); return; }
        const result = await callTool("codebase_maintenance", { mode: "observe", repo_path: repoPath });
        printJson(result);
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

// ── 25. pdf2md ─────────────────────────────────────────────────────

const pdfCommand: Command = {
  name: "pdf2md",
  description: "Convert a PDF file to Markdown (native text only, no OCR)",
  options: [
    { name: "out", short: "o", description: "Write output to file instead of stdout", type: "string" },
  ],
  action: async (ctx) => {
    ensureTools();
    const path = ctx.args[0];
    if (!path) {
      output.error("Path required: aiyoucli pdf2md <file.pdf>");
      return;
    }
    const result = await callTool("pdf_to_markdown", { path });
    const out = ctx.flags.out || ctx.flags.o;
    if (out && !result.isError) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(String(out), result.content[0]?.text ?? "");
      output.log(`Written to ${out}`);
    } else {
      printResult(result);
    }
  },
};

// ── Export ──────────────────────────────────────────────────────────

export const commands: Command[] = [
  initCommand,
  setupCommand,
  teamCommand,
  memoryCommand,
  codebaseCommand,
  mcpCommand,
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
  skillsCommand,
  pdfCommand,
];
