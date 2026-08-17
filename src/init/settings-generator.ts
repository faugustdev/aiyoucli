/**
 * Generates tool-specific configuration files.
 *
 * Supported targets:
 *   - claude:   .mcp.json, .claude/settings.json, CLAUDE.md
 *   - gemini:   GEMINI.md
 *   - opencode: opencode.json, OPENCODE.md
 *
 * Common to all:
 *   - .aiyoucli/helpers/statusline.cjs
 *   - .aiyoucli/agents.dsi.toon (distilled AGENTS.md)
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { generateStatuslineScript } from "../statusline/generator.js";
import { distillMarkdown } from "../napi/index.js";
import { AGENT_DEFS, buildClaudeAgentFile, getAgentDir } from "./claude-agents.js";

// ── Types ───────────────────────────────────────────────────────

export type ToolTarget = "claude" | "gemini" | "opencode";

export type FileWriteStatus = "created" | "merged" | "updated" | "skipped";

export interface FileWriteResult {
  path: string;
  status: FileWriteStatus;
  /** When status === "updated" or "merged", diff stats vs. previous content */
  diff?: { previousBytes: number; newBytes: number };
}

// ── Helpers ─────────────────────────────────────────────────────

function detectProjectName(projectRoot: string): string {
  const pkgPath = join(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    } catch {}
  }
  return basename(projectRoot);
}

function detectGitAuthor(): { name: string; email: string } {
  try {
    const name = execSync("git config user.name", { encoding: "utf-8" }).trim();
    const email = execSync("git config user.email", { encoding: "utf-8" }).trim();
    return { name: name || "Author", email: email || "author@example.com" };
  } catch {
    return { name: "Author", email: "author@example.com" };
  }
}

/**
 * Deep-merge `incoming` into `base`. Arrays of primitives are de-duplicated
 * (preserving order). Plain objects are merged recursively. Non-object
 * values in `incoming` overwrite `base`.
 *
 * Returns a new object — neither input is mutated.
 */
function deepMerge<T extends Record<string, unknown>>(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>
): T {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(incoming)) {
    const baseVal = base[key];
    const incomingVal = incoming[key];
    if (
      baseVal && incomingVal &&
      typeof baseVal === "object" && !Array.isArray(baseVal) &&
      typeof incomingVal === "object" && !Array.isArray(incomingVal)
    ) {
      out[key] = deepMerge(baseVal as Record<string, unknown>, incomingVal as Record<string, unknown>);
    } else if (Array.isArray(baseVal) && Array.isArray(incomingVal)) {
      // Deduplicate primitive arrays, preserving base order, then appending new entries.
      const seen = new Set<string>();
      const merged: unknown[] = [];
      for (const v of [...baseVal, ...incomingVal]) {
        const k = JSON.stringify(v);
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(v);
        }
      }
      out[key] = merged;
    } else {
      out[key] = incomingVal;
    }
  }
  return out as T;
}

/**
 * Read a JSON file or return `{}` if missing/malformed.
 * Used for graceful merge when the existing file is hand-edited and broken.
 */
function readJsonSafe(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return {};
}

/**
 * Create-or-merge a JSON file.
 *
 *   - "create":  file does not exist → write `additions`, return "created"
 *   - "merge":   file exists → deep-merge `additions`, return "merged" only
 *                if at least one key actually changed
 *   - "skip":    file exists and merge produced no changes
 *   - "overwrite": force=true, file exists → replace, return "updated"
 */
function mergeJsonFile(
  filePath: string,
  additions: Record<string, unknown>,
  opts: { force?: boolean } = {}
): FileWriteResult {
  mkdirSync(dirname(filePath), { recursive: true });

  if (!existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify(additions, null, 2) + "\n", "utf-8");
    return { path: filePath, status: "created" };
  }

  const previousBytes = statSafe(filePath);
  const current = readJsonSafe(filePath);

  if (opts.force) {
    writeFileSync(filePath, JSON.stringify(additions, null, 2) + "\n", "utf-8");
    return {
      path: filePath,
      status: "updated",
      diff: { previousBytes, newBytes: statSafe(filePath) },
    };
  }

  const merged = deepMerge(current, additions);
  const mergedStr = JSON.stringify(merged, null, 2) + "\n";
  const currentStr = JSON.stringify(current, null, 2) + "\n";

  if (mergedStr === currentStr) {
    return { path: filePath, status: "skipped" };
  }

  writeFileSync(filePath, mergedStr, "utf-8");
  return {
    path: filePath,
    status: "merged",
    diff: { previousBytes, newBytes: statSafe(filePath) },
  };
}

function statSafe(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Write a plain-text file only if it doesn't exist (idempotent on content).
 * Returns "created" if written, "skipped" if file already exists.
 */
function writeTextIfNotExists(filePath: string, content: string): FileWriteResult {
  if (existsSync(filePath)) {
    return { path: filePath, status: "skipped" };
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  return { path: filePath, status: "created" };
}

// ── .mcp.json (Claude Code) ──────────────────────────────────────
// Disabled by default — see `aiyoucli init --with-mcp`. Wiring the MCP
// server unconditionally means its ~60 tool schemas get loaded into every
// turn's context whether or not they're ever called; the CLI covers the
// same functionality via Bash at zero standing token cost.

function buildMcpJson(): object {
  return {
    mcpServers: {
      aiyoucli: {
        command: "aiyoucli-mcp",
        args: [],
        env: {},
      },
    },
  };
}

// ── Claude Code ─────────────────────────────────────────────────

function buildClaudeSettings(withHooks: boolean): object {
  const base = {
    statusLine: {
      type: "command",
      command: "aiyoucli statusline --compact",
    },
  };
  if (!withHooks) return base;
  return {
    ...base,
    // Wire PreToolUse/PostToolUse hooks for Edit|Write|MultiEdit so Claude
    // Code gets the same lifecycle coverage that OpenCode already gets via
    // the @aiyou-dev/team plugin (tool.execute.before/after). Each hook is
    // an inline `node -e` script that reads Claude Code's JSON stdin payload,
    // extracts tool_name + tool_input.file_path, and shells out to the
    // existing `aiyoucli hooks pre-task` / `aiyoucli hooks post-task` CLI
    // subcommands — those already wire to hooks_pre_task/hooks_post_task MCP
    // tools, which run routing and persist the Q-table. Exit code 0 always
    // (informational — does NOT block the Edit; matches hooks_pre_task's
    // existing non-blocking semantics).
    hooks: {
      PreToolUse: [
        {
          matcher: "Edit|Write|MultiEdit",
          hooks: [
            {
              type: "command",
              command:
                "node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')||'{}');" +
                "const f=(d.tool_input&&d.tool_input.file_path)||'';" +
                "const args=['hooks','pre-task','--description',d.tool_name||'edit'];" +
                "if(f){args.push('--file',f)}" +
                "if(d.tool_input&&d.tool_input.old_string!==undefined){args.push('--edit-kind','mod')}" +
                "else if(d.tool_input&&d.tool_input.content!==undefined){args.push('--edit-kind','new')}" +
                "const{spawnSync}=require('child_process');" +
                "const r=spawnSync('aiyoucli',args,{stdio:'inherit'});" +
                "process.exit(r.status||0)\"",
              timeout: 15,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Edit|Write|MultiEdit",
          hooks: [
            {
              type: "command",
              command:
                "node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')||'{}');" +
                "const args=['hooks','post-task','--description',d.tool_name||'edit'," +
                "'--agent',(process.env.AIYOUCLI_AUTO_AGENT||'claude'),'--success'];" +
                "if(d.tool_input&&d.tool_input.file_path)args.push('--file',d.tool_input.file_path);" +
                "const{spawnSync}=require('child_process');" +
                "spawnSync('aiyoucli',args,{stdio:'inherit'})\"",
              timeout: 15,
            },
          ],
        },
      ],
    },
  };
}

function buildClaudeMd(name: string, author: { name: string; email: string }, withMcp: boolean): string {
  const mcpLine = withMcp
    ? "MCP: aiyoucli-mcp (configured in .mcp.json) — secondary; prefer the aiyoucli CLI (see AGENTS.md)"
    : "MCP: disabled by default — use the aiyoucli CLI directly (see AGENTS.md); enable with `aiyoucli init --with-mcp --force`";
  return `@.aiyoucli/agents.dsi.toon

Commits: ${author.name} <${author.email}>
${mcpLine}
Team: Use \`task\` tool with \`subagent_type\` to delegate to aiyou-team agents (run \`aiyoucli init --with-agents\` to enable — agents work once .claude/agents/*.md exist)
  - coding-leader, coordination-leader, coding-executor, codebase-explorer, web-researcher, reviewer, principal-advisor, multimodal-looker
Discovery: \`aiyoucli status\` first (or \`capabilities\` if MCP is enabled)
Search: \`aiyoucli codebase search|trace|query\` over the knowledge graph instead of reading many files
Build: npm install && npm run build
Test: npm test
`;
}

function generateClaude(
  projectRoot: string,
  name: string,
  author: { name: string; email: string },
  force: boolean,
  withMcp: boolean,
  withHooks: boolean,
  withAgents: boolean
): FileWriteResult[] {
  const results: FileWriteResult[] = [];

  // .mcp.json — disabled by default (see `aiyoucli init --with-mcp`). Only
  // written/merged when explicitly requested; left untouched otherwise so
  // an existing hand-edited file isn't silently disturbed.
  if (withMcp) {
    results.push(
      mergeJsonFile(join(projectRoot, ".mcp.json"), buildMcpJson() as Record<string, unknown>, { force })
    );
  }

  // .claude/settings.json — MERGE (preserve user's statusLine if present;
  // deepMerge deduplicates the hooks.PreToolUse array by JSON.stringify so
  // re-running `init --with-hooks` does NOT double up the entries).
  results.push(
    mergeJsonFile(
      join(projectRoot, ".claude", "settings.json"),
      buildClaudeSettings(withHooks) as Record<string, unknown>,
      { force }
    )
  );

  // CLAUDE.md — create only (it's documentation, replacing would lose content)
  results.push(
    writeTextIfNotExists(join(projectRoot, "CLAUDE.md"), buildClaudeMd(name, author, withMcp))
  );

  // .claude/agents/*.md — opt-in via `--with-agents`. Writes one markdown
  // file per aiyou-team agent so Claude Code's `task` tool can dispatch to
  // them. OpenCode already gets this via the `@aiyou-dev/team` plugin entry.
  if (withAgents) {
    results.push(...generateClaudeAgents(projectRoot, force));
  }

  return results;
}

/**
 * Write `.claude/agents/<name>.md` for each aiyou-team agent. Mirrors the
 * `writeTextIfNotExists` pattern used by CLAUDE.md — first run creates, re-run
 * skips. `--force` overwrites (returns "updated").
 */
function generateClaudeAgents(projectRoot: string, force: boolean): FileWriteResult[] {
  const agentDir = getAgentDir(projectRoot);
  mkdirSync(agentDir, { recursive: true });

  const results: FileWriteResult[] = [];
  for (const def of AGENT_DEFS) {
    const filePath = join(agentDir, `${def.name}.md`);
    const content = buildClaudeAgentFile(def);

    if (force && existsSync(filePath)) {
      const previousBytes = statSafe(filePath);
      writeFileSync(filePath, content, "utf-8");
      results.push({
        path: filePath,
        status: "updated",
        diff: { previousBytes, newBytes: statSafe(filePath) },
      });
    } else if (force) {
      writeFileSync(filePath, content, "utf-8");
      results.push({ path: filePath, status: "created" });
    } else {
      // writeTextIfNotExists returns "skipped" if the file already exists.
      results.push(writeTextIfNotExists(filePath, content));
    }
  }
  return results;
}

// ── Gemini CLI ──────────────────────────────────────────────────

function buildGeminiMd(name: string, author: { name: string; email: string }, withMcp: boolean): string {
  const mcpLine = withMcp
    ? "MCP: aiyoucli-mcp — secondary; prefer the aiyoucli CLI (see AGENTS.md)"
    : "MCP: disabled by default — use the aiyoucli CLI directly (see AGENTS.md); enable with `aiyoucli init --with-mcp --force`";
  return `See .aiyoucli/agents.dsi.toon for project instructions (dense format).

Commits: ${author.name} <${author.email}>
${mcpLine}
Team: aiyou-team agents available via task delegation
Discovery: \`aiyoucli status\` (or \`capabilities\` if MCP is enabled)
Search: \`aiyoucli codebase search|trace|query\` over the knowledge graph instead of reading many files
Status: aiyoucli statusline
Skills: TOON-distilled in .aiyoucli/skills/
`;
}

function generateGemini(
  projectRoot: string,
  name: string,
  author: { name: string; email: string },
  withMcp: boolean
): FileWriteResult[] {
  return [
    writeTextIfNotExists(join(projectRoot, "GEMINI.md"), buildGeminiMd(name, author, withMcp)),
  ];
}

// ── OpenCode ────────────────────────────────────────────────────

// `mcp.aiyoucli.enabled` defaults to false (see `aiyoucli init --with-mcp`).
// Unlike `.mcp.json`, OpenCode's schema has an explicit `enabled` toggle, so
// we keep the server entry self-documenting rather than omitting it.
function buildOpenCodeJson(withMcp: boolean): object {
  return {
    $schema: "https://opencode.ai/config.json",
    mcp: {
      aiyoucli: {
        type: "local",
        command: ["aiyoucli-mcp"],
        enabled: withMcp,
      },
    },
    plugin: ["aiyou-team"],
    instructions: ["AGENTS.md"],
  };
}

function buildOpenCodeMd(name: string, author: { name: string; email: string }, withMcp: boolean): string {
  const mcpLine = withMcp
    ? "MCP: aiyoucli-mcp (configured in opencode.json) — secondary; prefer the aiyoucli CLI (see AGENTS.md)"
    : "MCP: disabled by default (opencode.json mcp.aiyoucli.enabled=false) — use the aiyoucli CLI directly (see AGENTS.md); enable with `aiyoucli init --with-mcp --force`";
  return `See AGENTS.md for project instructions.

Commits: ${author.name} <${author.email}>
${mcpLine}
Team: @aiyou-dev/team plugin — 8 coding-team agents for delegation
Discovery: \`aiyoucli status\` (or \`capabilities\` if MCP is enabled)
Search: \`aiyoucli codebase search|trace|query\` over the knowledge graph instead of reading many files
Status: aiyoucli statusline
Skills: TOON-distilled in .aiyoucli/skills/
`;
}

function generateOpenCode(
  projectRoot: string,
  name: string,
  author: { name: string; email: string },
  force: boolean,
  withMcp: boolean
): FileWriteResult[] {
  const results: FileWriteResult[] = [];

  // opencode.json — MERGE (preserve user's $schema, providers, models)
  results.push(
    mergeJsonFile(
      join(projectRoot, "opencode.json"),
      buildOpenCodeJson(withMcp) as Record<string, unknown>,
      { force }
    )
  );

  // OPENCODE.md — create only
  results.push(
    writeTextIfNotExists(join(projectRoot, "OPENCODE.md"), buildOpenCodeMd(name, author, withMcp))
  );

  return results;
}

// ── Common (all targets) ────────────────────────────────────────

function generateCommon(projectRoot: string): FileWriteResult[] {
  const results: FileWriteResult[] = [];

  // Statusline script — always overwrite (it's a generated helper, no user content)
  const statuslinePath = generateStatuslineScript(projectRoot);
  results.push({ path: statuslinePath, status: "updated" });

  // DSI TOON — distill AGENTS.md if it exists (always regenerate from source)
  const agentsMdPath = join(projectRoot, "AGENTS.md");
  if (existsSync(agentsMdPath)) {
    try {
      const md = readFileSync(agentsMdPath, "utf-8");
      const toon = distillMarkdown(md);
      const toonPath = join(projectRoot, ".aiyoucli", "agents.dsi.toon");
      mkdirSync(dirname(toonPath), { recursive: true });
      writeFileSync(toonPath, toon, "utf-8");
      results.push({ path: toonPath, status: "updated" });
    } catch {
      // Non-critical — NAPI might not be available in all environments
    }
  }

  return results;
}

// ── Main ────────────────────────────────────────────────────────

/**
 * Generate tool-specific configuration files for selected targets.
 *
 * @param projectRoot  Root directory of the project.
 * @param targets      Which tools to configure. Defaults to all.
 * @param force        Overwrite all files (used by `aiyoucli init --force`).
 * @param withMcp      Wire up the MCP server (`.mcp.json` / opencode.json `mcp.aiyoucli.enabled`).
 *                     Disabled by default — see `aiyoucli init --with-mcp`: agents use the CLI
 *                     via shell instead, avoiding the standing token cost of ~60 MCP tool schemas.
 * @param withHooks    Emit Claude Code PreToolUse/PostToolUse hooks into `.claude/settings.json`
 *                     for `Edit|Write|MultiEdit`. Disabled by default — OpenCode already gets
 *                     lifecycle hooks via `@aiyou-dev/team`. See `aiyoucli init --with-hooks`.
 * @param withAgents   Emit `.claude/agents/<name>.md` for the 8 aiyou-team agents so Claude Code's
 *                     `task` tool can dispatch to them. Disabled by default — OpenCode already gets
 *                     these agents via the `@aiyou-dev/team` plugin entry in `opencode.json`.
 *                     See `aiyoucli init --with-agents`.
 * @returns Array of write results (created / merged / updated / skipped).
 */
export async function generateSettings(
  projectRoot: string,
  targets?: ToolTarget[],
  force = false,
  withMcp = false,
  withHooks = false,
  withAgents = false
): Promise<FileWriteResult[]> {
  const effectiveTargets: ToolTarget[] = targets ?? ["claude", "gemini", "opencode"];
  const name = detectProjectName(projectRoot);
  const author = detectGitAuthor();
  const results: FileWriteResult[] = [];

  for (const target of effectiveTargets) {
    switch (target) {
      case "claude":
        results.push(...generateClaude(projectRoot, name, author, force, withMcp, withHooks, withAgents));
        break;
      case "gemini":
        results.push(...generateGemini(projectRoot, name, author, withMcp));
        break;
      case "opencode":
        results.push(...generateOpenCode(projectRoot, name, author, force, withMcp));
        break;
    }
  }

  results.push(...generateCommon(projectRoot));

  return results;
}

/**
 * Parse a comma-separated tool string into ToolTarget[].
 * Accepts: "claude", "gemini", "opencode", "all", "claude,opencode", etc.
 * Returns undefined for "all" (meaning all targets).
 */
export function parseToolTargets(input: string | undefined): ToolTarget[] | undefined {
  if (!input || input === "all") return undefined;

  const valid = new Set<string>(["claude", "gemini", "opencode"]);
  const parsed = input
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => valid.has(s));

  if (parsed.length === 0) return undefined;
  return parsed as ToolTarget[];
}