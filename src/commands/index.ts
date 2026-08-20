/**
 * CLI command definitions — thin wrappers over MCP tools.
 *
 * Each command parses flags/args, calls the appropriate MCP tool via
 * `callTool`, and formats the result using `output`/`color`.
 */

import { spawnSync, execSync } from "node:child_process";
import { join, dirname } from "node:path";

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
import { packageVersion } from "../version.js";
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
    { name: "with-mcp", description: "Also wire the MCP server (.mcp.json / opencode.json). Disabled by default — agents use the aiyoucli CLI directly via shell, avoiding the standing token cost of ~60 MCP tool schemas", type: "boolean" },
    { name: "with-hooks", description: "Wire Claude Code PreToolUse/PostToolUse hooks into .claude/settings.json for Edit|Write|MultiEdit (forwarded to `aiyoucli hooks pre-task` / `post-task`). Disabled by default — OpenCode already gets lifecycle hooks via @aiyou-dev/team; this brings Claude Code to parity when opted in", type: "boolean" },
    { name: "with-agents", description: "(Kept for backward compatibility — this is now the default for --tool claude.) Write .claude/agents/*.md for the 8 aiyou-team agents.", type: "boolean" },
    { name: "skip-agents", description: "Skip writing .claude/agents/*.md — by default `init` writes them for --tool claude so Claude Code's `task` tool can delegate to aiyou-team agents immediately, no extra step", type: "boolean" },
    { name: "skip-plugin", description: "Skip generating .aiyou-team-plugin/ (the Claude Code Plugin — same roster plus SessionStart/UserPromptSubmit routing hooks) — on by default for --tool claude alongside --skip-agents", type: "boolean" },
  ],
  examples: [
    { command: "aiyoucli init", description: "Initialize with full 4-phase bootstrap (wire + write + warm + verify)" },
    { command: "aiyoucli init --tool opencode", description: "Initialize for OpenCode only" },
    { command: "aiyoucli init --tool claude,opencode", description: "Initialize for Claude Code and OpenCode" },
    { command: "aiyoucli init --tool all", description: "Initialize for all supported tools" },
    { command: "aiyoucli init --skip-verify", description: "Skip Phase 4 verification (faster init)" },
    { command: "aiyoucli init --with-mcp", description: "Also wire the MCP server (off by default)" },
    { command: "aiyoucli init --tool claude", description: "Indexes memory, writes .claude/agents/*.md, and generates .aiyou-team-plugin/ — all by default" },
    { command: "aiyoucli init --tool claude --skip-agents --skip-plugin", description: "Just the base settings — opt out of agents/plugin generation" },
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
    const withMcp = ctx.flags.withMcp as boolean;
    const withHooks = ctx.flags.withHooks as boolean;
    // Default ON for --tool claude (was opt-in via --with-agents; that flag
    // still works but is redundant now). Claude Code has no equivalent of
    // OpenCode's automatic @aiyou-dev/team plugin wiring, so without this a
    // fresh `aiyoucli init` leaves Claude Code unable to see any aiyou-team
    // agent at all — "aiyoucli reconoce mis agentes" only holds if init
    // actually writes them. --skip-agents opts back out.
    const withAgents = !(ctx.flags["skip-agents"] as boolean);
    const withPlugin = !(ctx.flags["skip-plugin"] as boolean);
    const claudeTargeted = !targets || targets.includes("claude");

    // 1. Generate AGENTS.md (always)
    try {
      const agentsMdResult = await generateAgentsMd(cwd, {
        force: ctx.flags.force as boolean,
        cwd,
        withMcp,
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
      const settingsResults = await generateSettings(cwd, targets, ctx.flags.force as boolean, withMcp, withHooks, withAgents);
      fileResults.push(...settingsResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      spinner.fail(`Failed to generate settings: ${msg}`);
      return { success: false, exitCode: 1 };
    }

    // 2c. Claude Code Plugin (.aiyou-team-plugin/) — on by default alongside
    // .claude/agents/*.md (see withPlugin above). Always overwrites (the
    // plugin is meant to be regenerated, not hand-edited — see
    // plugin-generator.ts), so status here is "created" vs "updated" based
    // on whether each file existed before this run, same convention as
    // every other writer above.
    if (withPlugin && claudeTargeted) {
      try {
        const { buildPluginFiles } = await import("../init/plugin-generator.js");
        const { existsSync, mkdirSync, writeFileSync, statSync } = await import("node:fs");
        const pluginDir = join(cwd, ".aiyou-team-plugin");
        for (const [relativePath, content] of Object.entries(buildPluginFiles())) {
          const absolutePath = join(pluginDir, relativePath);
          const existed = existsSync(absolutePath);
          const previousBytes = existed ? statSync(absolutePath).size : 0;
          mkdirSync(dirname(absolutePath), { recursive: true });
          writeFileSync(absolutePath, content, "utf-8");
          fileResults.push({
            path: absolutePath,
            status: existed ? "updated" : "created",
            ...(existed ? { diff: { previousBytes, newBytes: statSync(absolutePath).size } } : {}),
          });
        }
      } catch (e) {
        // Non-fatal — the standalone .claude/ files above already give a
        // working setup; the plugin is the "nicer" path, not the only one.
        output.warn(`Skipped .aiyou-team-plugin/ generation: ${e instanceof Error ? e.message : String(e)}`);
      }
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

    if (withPlugin && claudeTargeted) {
      output.log("");
      output.log(color.dim(`  Load the plugin:  claude --plugin-dir ${join(cwd, ".aiyou-team-plugin")}`));
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
  description: "Vector memory (store, search, list, export/import)",
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
    {
      name: "export",
      description: "Export every stored vector as JSON, for backup/migration",
      options: [
        { name: "out", short: "o", description: "Write output to file instead of stdout", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const result = await callTool("memory_export", {});
        const out = ctx.flags.out || ctx.flags.o;
        if (out && !result.isError) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(String(out), result.content[0]?.text ?? "");
          output.log(`Written to ${out}`);
        } else {
          printJson(result);
        }
      },
    },
    {
      name: "import",
      description: "Import vectors from a JSON file produced by `memory export`",
      action: async (ctx) => {
        ensureTools();
        const path = ctx.args[0];
        if (!path) { output.error("Path required: aiyoucli memory import <file.json>"); return; }
        const { readFileSync } = await import("node:fs");
        let entries: unknown;
        try {
          entries = JSON.parse(readFileSync(path, "utf-8"));
        } catch (e) {
          output.error(`Could not read/parse ${path}: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        const result = await callTool("memory_import", { entries });
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
        { name: "file", short: "f", description: "File path (from Claude Code tool_input.file_path)", type: "string" },
        { name: "edit-kind", short: "k", description: "mod|new|delete (Claude Code edit classification)", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const description = ctx.flags.description || ctx.flags.d || ctx.args.join(" ");
        const file  = ctx.flags.file as string | undefined;
        const kind  = ctx.flags["edit-kind"] as string | undefined;
        if (!description) { output.error("Description required: --description <text>"); return; }
        // Compose: "Edit src/foo.ts (mod)" gives the router a richer keyword than
        // the bare word "edit" — file path + edit kind both feed the Q-table's
        // hash bucket without inflating it (we deliberately do NOT include
        // tool_input.old_string / new_string — they're often multi-MB).
        const composed = file ? `${description} ${file}${kind ? " (" + kind + ")" : ""}` : description;
        const result = await callTool("hooks_pre_task", { description: composed });
        printJson(result);
      },
    },
    {
      name: "post-task",
      description: "Post-task hook (record outcome)",
      options: [
        { name: "description", short: "d", description: "Task description", type: "string", required: true },
        { name: "agent", short: "a", description: "Agent type used (default: 'claude' for Claude Code PostToolUse hooks; set AIYOUCLI_AUTO_AGENT to override)", type: "string" },
        { name: "success", short: "s", description: "Whether task succeeded", type: "boolean" },
        { name: "file", short: "f", description: "Optional file context (from Claude Code tool_input.file_path)", type: "string" },
      ],
      action: async (ctx) => {
        ensureTools();
        const description = ctx.flags.description || ctx.flags.d;
        const agent = (ctx.flags.agent || ctx.flags.a || "claude");
        const success = ctx.flags.success ?? ctx.flags.s ?? true;
        const file  = ctx.flags.file as string | undefined;
        if (!description) {
          output.error("Required: --description <text>");
          return;
        }
        const composed = file ? `${description} ${file}` : description;
        const result = await callTool("hooks_post_task", {
          description: composed,
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
    {
      name: "session-start",
      description: "SessionStart hook — print a short aiyou-team roster reminder as initial context",
      action: async () => {
        const { AGENT_DEFS } = await import("../init/claude-agents.js");
        const { buildSessionStartReminder } = await import("../init/session-hooks.js");
        output.log(buildSessionStartReminder(AGENT_DEFS));
      },
    },
    {
      name: "user-prompt-submit",
      description: "UserPromptSubmit hook — emit a routing hint as additionalContext when confidence is high enough",
      options: [
        { name: "prompt", description: "The user's prompt text", type: "string" },
        { name: "min-confidence", description: "Stay silent below this confidence (0-1, default 0.6) — avoids noise on every prompt", type: "number" },
      ],
      action: async (ctx) => {
        const { buildUserPromptSubmitHint, MIN_PROMPT_LENGTH_FOR_ROUTING_HINT } = await import("../init/session-hooks.js");
        const promptText = ((ctx.flags.prompt as string | undefined) ?? ctx.args.join(" ")).trim();
        if (promptText.length < MIN_PROMPT_LENGTH_FOR_ROUTING_HINT) return;

        ensureTools();
        const result = await callTool("hooks_pre_task", { description: promptText });
        let parsed: { recommended_agent?: string; confidence?: number } = {};
        try {
          parsed = JSON.parse(result.content[0]?.text ?? "{}");
        } catch {
          return;
        }

        const minConfidence = ctx.flags["min-confidence"] as number | undefined;
        const hint = buildUserPromptSubmitHint(promptText, parsed, minConfidence);
        if (hint) output.log(hint);
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

// ── 9b. agent ──────────────────────────────────────────────────────

// Sugar over `config get/set agents.<name>.model` — no new MCP tool, reuses
// config_get/config_set. See init/claude-agents.ts:AGENT_DEFS for the roster
// and modelFromTier() for the tier-based default a pinned model overrides.

const agentCommand: Command = {
  name: "agent",
  description: "Per-agent configuration (model overrides)",
  subcommands: [
    {
      name: "list",
      description: "List the aiyou-team roster with each agent's effective model",
      action: async () => {
        ensureTools();
        const { AGENT_DEFS, modelFromTier } = await import("../init/claude-agents.js");
        const result = await callTool("config_get", { key: "agents" });
        const raw = result.content[0]?.text ?? "{}";
        let overrides: Record<string, { model?: string }> = {};
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") overrides = parsed;
        } catch {}

        for (const def of AGENT_DEFS) {
          const pinned = overrides[def.name]?.model;
          const effective = pinned ?? modelFromTier(def.tier);
          const source = pinned ? "pinned" : `tier default (${def.tier})`;
          output.log(`${color.bold(def.name.padEnd(20))} ${effective.padEnd(10)} ${color.dim(source)}`);
        }
      },
    },
    {
      name: "set-model",
      description: "Pin a model for one agent, overriding its tier default",
      examples: [
        { command: "aiyoucli agent set-model coding-leader opus", description: "Pin coding-leader to opus" },
      ],
      action: async (ctx) => {
        ensureTools();
        const agent = ctx.args[0];
        const model = ctx.args[1];
        if (!agent || !model) {
          output.error("Usage: aiyoucli agent set-model <agent> <model>");
          return;
        }
        const { AGENT_DEFS } = await import("../init/claude-agents.js");
        if (!AGENT_DEFS.some((d) => d.name === agent)) {
          output.error(`Unknown agent: ${agent}. Known: ${AGENT_DEFS.map((d) => d.name).join(", ")}`);
          return;
        }
        const result = await callTool("config_set", { key: `agents.${agent}.model`, value: model });
        printResult(result);
        output.log(color.dim("Re-run `aiyoucli init --tool claude --force` to regenerate .claude/agents/ with this model."));
      },
    },
  ],
};

// ── 9c. a2a ────────────────────────────────────────────────────────
//
// A2A (Agent2Agent) protocol. `card`/`call` (client direction, consuming a
// remote A2A agent) follow the mcp2cli principle — see codebase-project-
// tools.ts's header comment — and go through the same `a2a` MCP tool the
// MCP-protocol path uses. `serve` (server direction, exposing aiyou-team's
// own agents) talks to services/a2a/server.ts directly — long-running
// processes don't fit the request/response `callTool()` shape the other
// subcommands use (same reason `mcp start` calls startMCPServer() directly
// instead of going through a tool).
//
// `serve --runtime claude` (default) dispatches via `claude -p --agent
// <skill>` (executors/claude-headless.ts). `serve --runtime opencode`
// dispatches via a running `opencode serve`'s HTTP API — not the `opencode
// run` CLI, which can't address a specific aiyou-team subagent directly
// (see executors/opencode-headless.ts's header for why, confirmed
// empirically during the Fase 3 spike). Without --opencode-server-url, it
// spawns and manages its own `opencode serve` child process.

const a2aCommand: Command = {
  name: "a2a",
  description: "A2A (Agent2Agent) protocol — client (card/call) and server (serve)",
  subcommands: [
    {
      name: "card",
      description: "Fetch a remote agent's Agent Card",
      examples: [
        { command: "aiyoucli a2a card http://localhost:4173", description: "Show what a remote A2A agent offers" },
      ],
      action: async (ctx) => {
        ensureTools();
        const url = ctx.args[0];
        if (!url) { output.error("Usage: aiyoucli a2a card <url>"); return; }
        const result = await callTool("a2a", { mode: "card", url });
        printJson(result);
      },
    },
    {
      name: "call",
      description: "Send a message to a remote A2A agent and wait for the task to complete",
      options: [
        { name: "skill", short: "s", description: "Target skill/agent id on the remote card", type: "string" },
        { name: "auth-token", description: "Bearer token, if the remote server requires one", type: "string" },
        { name: "timeout", description: "Poll timeout in ms (default 120000)", type: "number" },
      ],
      examples: [
        {
          command: 'aiyoucli a2a call http://localhost:4173 "review this diff" --skill reviewer',
          description: "Delegate to a specific remote skill and wait for the result",
        },
      ],
      action: async (ctx) => {
        ensureTools();
        const url = ctx.args[0];
        const message = ctx.args[1];
        if (!url || !message) {
          output.error('Usage: aiyoucli a2a call <url> "<message>" [--skill <id>] [--auth-token <token>]');
          return;
        }
        const result = await callTool("a2a", {
          mode: "call",
          url,
          message,
          skill_id: ctx.flags.skill,
          auth_token: ctx.flags["auth-token"],
          timeout_ms: ctx.flags.timeout,
        });
        printJson(result);
      },
    },
    {
      name: "serve",
      description: "Serve aiyou-team's agents over A2A",
      options: [
        { name: "port", short: "p", description: "Port to listen on (default: 4173)", type: "number" },
        { name: "host", description: "Host to bind (default: 127.0.0.1 — do not change without --auth-token)", type: "string" },
        { name: "auth-token", description: "Require this bearer token on every route except the Agent Card", type: "string" },
        { name: "agent", short: "a", description: "Publish only this agent as a skill (repeatable). Default: all 8.", type: "array" },
        {
          name: "runtime",
          description: "Which host actually executes a skill: claude (default) or opencode",
          type: "string",
          choices: ["claude", "opencode"],
        },
        {
          name: "opencode-server-url",
          description: "Attach to an already-running `opencode serve` instead of spawning/managing one (runtime=opencode only)",
          type: "string",
        },
      ],
      examples: [
        { command: "aiyoucli a2a serve", description: "Publish all 8 aiyou-team agents on :4173, localhost-only, no auth (Claude Code)" },
        { command: "aiyoucli a2a serve --agent reviewer --auth-token $(openssl rand -hex 16)", description: "Publish just reviewer, with auth" },
        { command: "aiyoucli a2a serve --runtime opencode", description: "Same, but dispatch through a managed `opencode serve` instead of `claude -p`" },
      ],
      action: async (ctx) => {
        const { AGENT_DEFS } = await import("../init/claude-agents.js");
        const { startA2AServer } = await import("../services/a2a/server.js");
        const { buildAgentCard } = await import("../services/a2a/registry.js");

        const requested = ([] as unknown[]).concat(ctx.flags.agent ?? []).map(String);
        const agents = requested.length > 0 ? AGENT_DEFS.filter((d) => requested.includes(d.name)) : AGENT_DEFS;
        if (agents.length === 0) {
          output.error(`Unknown agent(s): ${requested.join(", ")}. Known: ${AGENT_DEFS.map((d) => d.name).join(", ")}`);
          return;
        }

        const authToken = ctx.flags["auth-token"] as string | undefined;
        const host = (ctx.flags.host as string | undefined) ?? "127.0.0.1";
        if (!authToken) {
          output.log(color.yellow("⚠ No --auth-token set.") + " Every route except the Agent Card is unauthenticated. Do not bind beyond localhost like this.");
        }
        if (host !== "127.0.0.1" && host !== "localhost" && !authToken) {
          output.error("Refusing to bind a non-localhost host without --auth-token — this would let anyone on the network run aiyou-team agents (including Bash/Edit/Write-capable ones) unauthenticated.");
          return;
        }

        const runtime = ((ctx.flags.runtime as string | undefined) ?? "claude") as "claude" | "opencode";
        let executor: import("../services/a2a/server.js").TaskExecutor;
        let stopManagedRuntime: (() => Promise<void>) | undefined;
        let runtimeDescription: string;

        if (runtime === "claude") {
          const { createClaudeHeadlessExecutor } = await import("../services/a2a/executors/claude-headless.js");
          executor = createClaudeHeadlessExecutor({ cwd: ctx.cwd });
          runtimeDescription = "Claude Code headless (claude -p --agent <skill>)";
        } else {
          const { createOpenCodeHeadlessExecutor } = await import("../services/a2a/executors/opencode-headless.js");
          const explicitUrl = ctx.flags["opencode-server-url"] as string | undefined;

          let serverUrl = explicitUrl;
          if (!serverUrl) {
            const { spawnOpenCodeServe } = await import("../services/a2a/opencode-process.js");
            output.log(color.dim("Starting a managed `opencode serve`..."));
            const managed = await spawnOpenCodeServe({ cwd: ctx.cwd });
            serverUrl = managed.url;
            stopManagedRuntime = managed.stop;
          }

          executor = createOpenCodeHeadlessExecutor({ serverUrl, password: process.env.OPENCODE_SERVER_PASSWORD });
          runtimeDescription = explicitUrl
            ? `OpenCode via existing server at ${explicitUrl}`
            : `OpenCode via a managed \`opencode serve\` at ${serverUrl}`;
        }

        let handle: Awaited<ReturnType<typeof startA2AServer>>;
        try {
          handle = await startA2AServer({
            port: (ctx.flags.port as number | undefined) ?? 4173,
            host,
            authToken,
            buildAgentCard: (url) => buildAgentCard({ url, agents }),
            executor,
          });
        } catch (err) {
          await stopManagedRuntime?.();
          throw err;
        }

        const shutdown = async () => {
          await handle.close().catch(() => {});
          await stopManagedRuntime?.();
        };
        process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
        process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));

        output.log(color.bold(`aiyou-team A2A server listening at ${handle.url}`));
        output.log(`  Agent Card: ${handle.url}/.well-known/agent-card.json`);
        output.log(`  Skills:     ${agents.map((a) => a.name).join(", ")}`);
        output.log(color.dim(`  Runtime:    ${runtimeDescription}`));
        output.log(color.dim("  Ctrl+C to stop."));
      },
    },
  ],
};

// ── 9d. plugin ─────────────────────────────────────────────────────
//
// Packages the aiyou-team roster as a real Claude Code Plugin (plan Fase 4)
// — see init/plugin-generator.ts's header for what this adds beyond the
// standalone `.claude/` path (`aiyoucli init --with-agents`), which stays
// unchanged for quick, no-plugin use.

const pluginCommand: Command = {
  name: "plugin",
  description: "Package aiyou-team as a Claude Code Plugin",
  subcommands: [
    {
      name: "build",
      description: "Generate/refresh the plugin directory (agents, hooks, MCP server)",
      options: [
        { name: "out", short: "o", description: "Output directory (default: <project>/.aiyou-team-plugin)", type: "string" },
      ],
      examples: [
        { command: "aiyoucli plugin build", description: "Generate .aiyou-team-plugin/ from the current roster + model overrides" },
        { command: "claude --plugin-dir ./.aiyou-team-plugin", description: "Load it in Claude Code (test before sharing)" },
      ],
      action: async (ctx) => {
        const { generatePlugin } = await import("../init/plugin-generator.js");
        const outDir = (ctx.flags.out as string | undefined) ?? join(ctx.cwd, ".aiyou-team-plugin");
        const result = generatePlugin({ outDir });

        output.log(color.bold(`Plugin written to ${result.pluginDir}`));
        for (const file of result.files) {
          output.log(`  ${color.dim(file.replace(result.pluginDir + "/", ""))}`);
        }
        output.log("");
        output.log(`Test it:   claude --plugin-dir ${result.pluginDir}`);
        output.log("Share it:  see https://code.claude.com/docs/en/plugin-marketplaces");
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

/**
 * Not an MCP tool, unlike the rest of this file: `WorkerDaemon` is a
 * foreground, long-running EventEmitter loop (like `mcp start`), which
 * doesn't fit the MCP request/response model. It's imported directly from
 * `../services/worker-daemon.js`.
 *
 * Cross-process status/stop use a PID file (`.aiyoucli/daemon.pid`) — there
 * is no IPC channel back into a running daemon, so `status` only reports
 * "running (pid N)", not live queue stats. Note the daemon's queue has no
 * producer wired up yet (nothing calls `WorkerDaemon.dispatch()` outside its
 * own tests) — `start` gives you the polling loop, not a populated queue.
 */
function daemonPidFile(): string {
  return join(process.cwd(), ".aiyoucli", "daemon.pid");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // exists, just not ours
  }
}

const daemonCommand: Command = {
  name: "daemon",
  description: "Background worker daemon (foreground polling loop over the in-process task queue)",
  subcommands: [
    {
      name: "start",
      description: "Start the daemon in the foreground (like `mcp start`) — Ctrl+C to stop",
      options: [
        { name: "poll-interval", description: "Poll interval in ms (default: 1000)", type: "number" },
      ],
      action: async (ctx) => {
        const { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } = await import("node:fs");
        const pidFile = daemonPidFile();

        if (existsSync(pidFile)) {
          const existingPid = Number(readFileSync(pidFile, "utf-8").trim());
          if (existingPid && isProcessAlive(existingPid)) {
            output.error(`Daemon already running (pid ${existingPid}). Run \`aiyoucli daemon stop\` first.`);
            return;
          }
        }

        const { WorkerDaemon } = await import("../services/worker-daemon.js");
        const pollInterval = ctx.flags.pollInterval as number | undefined;
        const daemon = new WorkerDaemon({ pollInterval });

        mkdirSync(dirname(pidFile), { recursive: true });
        writeFileSync(pidFile, String(process.pid));

        const shutdown = () => {
          daemon.stop();
          try {
            unlinkSync(pidFile);
          } catch {
            // already gone — fine
          }
          output.log("Daemon stopped");
          process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        daemon.start();
        output.log(
          `Daemon started (pid ${process.pid}). Ctrl+C to stop. ` +
            `Note: nothing currently enqueues tasks into it — see WorkerDaemon.dispatch().`
        );

        // Keep the process alive; the interval timer inside WorkerDaemon
        // already does this in practice, but be explicit.
        await new Promise(() => {});
      },
    },
    {
      name: "status",
      description: "Check whether the daemon is running",
      action: async () => {
        const { existsSync, readFileSync } = await import("node:fs");
        const pidFile = daemonPidFile();
        if (!existsSync(pidFile)) {
          output.log("Daemon not running (no pid file)");
          return;
        }
        const pid = Number(readFileSync(pidFile, "utf-8").trim());
        output.log(
          pid && isProcessAlive(pid)
            ? `Daemon running (pid ${pid})`
            : "Daemon not running (stale pid file)"
        );
      },
    },
    {
      name: "stop",
      description: "Stop a running daemon",
      action: async () => {
        const { existsSync, readFileSync, unlinkSync } = await import("node:fs");
        const pidFile = daemonPidFile();
        if (!existsSync(pidFile)) {
          output.log("Daemon not running (no pid file)");
          return;
        }
        const pid = Number(readFileSync(pidFile, "utf-8").trim());
        if (pid && isProcessAlive(pid)) {
          process.kill(pid, "SIGTERM");
          output.log(`Sent SIGTERM to daemon (pid ${pid})`);
        } else {
          output.log("Daemon not running (stale pid file)");
          try {
            unlinkSync(pidFile);
          } catch {
            // fine
          }
        }
      },
    },
  ],
};

// ── 18. completions ────────────────────────────────────────────────

const completionsCommand: Command = {
  name: "completions",
  description: "Shell completions",
  options: [
    { name: "shell", short: "s", description: "Shell type: bash, zsh, fish, powershell", type: "string" },
  ],
  examples: [
    { command: "aiyoucli completions bash >> ~/.bashrc", description: "Bash" },
    { command: "aiyoucli completions zsh >> ~/.zshrc", description: "Zsh" },
    { command: "aiyoucli completions fish > ~/.config/fish/completions/aiyoucli.fish", description: "Fish" },
    { command: "aiyoucli completions powershell >> $PROFILE", description: "PowerShell" },
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
    } else if (shell === "fish") {
      const lines = commands
        .map((c) => `complete -c aiyoucli -f -n "__fish_use_subcommand" -a "${c.name}" -d "${c.description.replace(/"/g, "'")}"`)
        .join("\n");
      output.log(`# fish completion for aiyoucli
${lines}`);
    } else if (shell === "powershell" || shell === "pwsh") {
      output.log(`# PowerShell completion for aiyoucli
Register-ArgumentCompleter -Native -CommandName aiyoucli -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $commands = @(${commands.map((c) => `'${c.name}'`).join(", ")})
    $commands | Where-Object { $_ -like "$wordToComplete*" } |
        ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}`);
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

const NPM_PACKAGE_NAME = "@aiyou-dev/cli";

const updateCommand: Command = {
  name: "update",
  description: "Check for / install aiyoucli updates from npm",
  subcommands: [
    {
      name: "check",
      description: "Check npm for a newer version than the one currently installed",
      action: async () => {
        const current = packageVersion();
        let latest: string;
        try {
          latest = execSync(`npm view ${NPM_PACKAGE_NAME} version`, { encoding: "utf-8" }).trim();
        } catch (e) {
          output.error(`Could not reach the npm registry: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        if (latest === current) {
          output.log(`Up to date (v${current})`);
        } else {
          output.log(`Update available: v${current} → v${latest}`);
          output.log(`Run \`aiyoucli update install\` to upgrade.`);
        }
      },
    },
    {
      name: "install",
      description: "Install the latest version globally via npm",
      action: async () => {
        output.log(`Running: npm install -g ${NPM_PACKAGE_NAME}@latest`);
        try {
          execSync(`npm install -g ${NPM_PACKAGE_NAME}@latest`, { stdio: "inherit" });
          output.log(color.green("Updated."));
        } catch (e) {
          output.error(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    },
  ],
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
  agentCommand,
  a2aCommand,
  pluginCommand,
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
