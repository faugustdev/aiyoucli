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

// ── .mcp.json (shared — used by Claude Code and OpenCode) ───────

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

function buildClaudeSettings(): object {
  return {
    statusLine: {
      type: "command",
      command: "aiyoucli statusline --compact",
    },
  };
}

function buildClaudeMd(name: string, author: { name: string; email: string }): string {
  return `@.aiyoucli/agents.dsi.toon

Commits: ${author.name} <${author.email}>
MCP: aiyoucli-mcp (configured in .mcp.json) — 60 tools (8 consolidated + 2 discovery + 50 individual)
Team: Use \`task\` tool with \`subagent_type\` to delegate to aiyou-team agents
  - coding-leader, coding-executor, codebase-explorer, reviewer, web-researcher, principal-advisor, multimodal-looker
Discovery: Call \`capabilities\` first to see NAPI features, aiyouvector, aiyou-team status
Build: npm install && npm run build
Test: npm test
`;
}

function generateClaude(
  projectRoot: string,
  name: string,
  author: { name: string; email: string },
  force: boolean
): FileWriteResult[] {
  const results: FileWriteResult[] = [];

  // .mcp.json — MERGE (preserve existing servers like supabase)
  results.push(
    mergeJsonFile(join(projectRoot, ".mcp.json"), buildMcpJson() as Record<string, unknown>, { force })
  );

  // .claude/settings.json — MERGE (preserve user's statusLine if present)
  results.push(
    mergeJsonFile(
      join(projectRoot, ".claude", "settings.json"),
      buildClaudeSettings() as Record<string, unknown>,
      { force }
    )
  );

  // CLAUDE.md — create only (it's documentation, replacing would lose content)
  results.push(
    writeTextIfNotExists(join(projectRoot, "CLAUDE.md"), buildClaudeMd(name, author))
  );

  return results;
}

// ── Gemini CLI ──────────────────────────────────────────────────

function buildGeminiMd(name: string, author: { name: string; email: string }): string {
  return `See .aiyoucli/agents.dsi.toon for project instructions (dense format).

Commits: ${author.name} <${author.email}>
MCP: aiyoucli-mcp — 60 tools (8 consolidated + 2 discovery + 50 individual)
Team: aiyou-team agents available via task delegation
Discovery: Call \`capabilities\` to see NAPI features, aiyouvector, aiyou-team status
Status: aiyoucli statusline
Skills: TOON-distilled in .aiyoucli/skills/
`;
}

function generateGemini(
  projectRoot: string,
  name: string,
  author: { name: string; email: string }
): FileWriteResult[] {
  return [
    writeTextIfNotExists(join(projectRoot, "GEMINI.md"), buildGeminiMd(name, author)),
  ];
}

// ── OpenCode ────────────────────────────────────────────────────

function buildOpenCodeJson(): object {
  return {
    $schema: "https://opencode.ai/config.json",
    mcp: {
      aiyoucli: {
        type: "local",
        command: ["aiyoucli-mcp"],
        enabled: true,
      },
    },
    plugin: ["aiyou-team"],
    instructions: ["AGENTS.md"],
  };
}

function buildOpenCodeMd(name: string, author: { name: string; email: string }): string {
  return `See AGENTS.md for project instructions.

Commits: ${author.name} <${author.email}>
MCP: aiyoucli-mcp (configured in opencode.json) — 60 tools (8 consolidated + 2 discovery + 50 individual)
Team: @aiyou-dev/team plugin — 8 coding-team agents for delegation
Discovery: Call \`capabilities\` to see NAPI features, aiyouvector, aiyou-team status
Status: aiyoucli statusline
Skills: TOON-distilled in .aiyoucli/skills/
`;
}

function generateOpenCode(
  projectRoot: string,
  name: string,
  author: { name: string; email: string },
  force: boolean
): FileWriteResult[] {
  const results: FileWriteResult[] = [];

  // opencode.json — MERGE (preserve user's $schema, providers, models)
  results.push(
    mergeJsonFile(
      join(projectRoot, "opencode.json"),
      buildOpenCodeJson() as Record<string, unknown>,
      { force }
    )
  );

  // OPENCODE.md — create only
  results.push(
    writeTextIfNotExists(join(projectRoot, "OPENCODE.md"), buildOpenCodeMd(name, author))
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
 * @returns Array of write results (created / merged / updated / skipped).
 */
export async function generateSettings(
  projectRoot: string,
  targets?: ToolTarget[],
  force = false
): Promise<FileWriteResult[]> {
  const effectiveTargets: ToolTarget[] = targets ?? ["claude", "gemini", "opencode"];
  const name = detectProjectName(projectRoot);
  const author = detectGitAuthor();
  const results: FileWriteResult[] = [];

  for (const target of effectiveTargets) {
    switch (target) {
      case "claude":
        results.push(...generateClaude(projectRoot, name, author, force));
        break;
      case "gemini":
        results.push(...generateGemini(projectRoot, name, author));
        break;
      case "opencode":
        results.push(...generateOpenCode(projectRoot, name, author, force));
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