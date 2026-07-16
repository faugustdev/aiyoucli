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

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { generateStatuslineScript } from "../statusline/generator.js";
import { distillMarkdown } from "../napi/index.js";

// ── Types ───────────────────────────────────────────────────────

export type ToolTarget = "claude" | "gemini" | "opencode";

interface SettingsResult {
  path: string;
  created: boolean;
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

function writeIfNotExists(filePath: string, content: string): SettingsResult {
  if (existsSync(filePath)) {
    return { path: filePath, created: false };
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  return { path: filePath, created: true };
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
MCP: aiyoucli-mcp (configured in .mcp.json) — 87 tools across 23 categories
Team: Use \`task\` tool with \`subagent_type\` to delegate to aiyou-team agents
  - coding-leader, coding-executor, codebase-explorer, reviewer, web-researcher, principal-advisor, multimodal-looker
Build: npm install && npm run build
Test: npm test
`;
}

function generateClaude(projectRoot: string, name: string, author: { name: string; email: string }): string[] {
  const paths: string[] = [];

  // .mcp.json
  const r0 = writeIfNotExists(
    join(projectRoot, ".mcp.json"),
    JSON.stringify(buildMcpJson(), null, 2) + "\n"
  );
  if (r0.created) paths.push(r0.path);

  // .claude/settings.json
  const r1 = writeIfNotExists(
    join(projectRoot, ".claude", "settings.json"),
    JSON.stringify(buildClaudeSettings(), null, 2) + "\n"
  );
  if (r1.created) paths.push(r1.path);

  // CLAUDE.md
  const r2 = writeIfNotExists(
    join(projectRoot, "CLAUDE.md"),
    buildClaudeMd(name, author)
  );
  if (r2.created) paths.push(r2.path);

  return paths;
}

// ── Gemini CLI ──────────────────────────────────────────────────

function buildGeminiMd(name: string, author: { name: string; email: string }): string {
  return `See .aiyoucli/agents.dsi.toon for project instructions (dense format).

Commits: ${author.name} <${author.email}>
MCP: aiyoucli-mcp — 87 tools across 23 categories
Team: aiyou-team agents available via task delegation
Status: aiyoucli statusline
Skills: TOON-distilled in .aiyoucli/skills/
`;
}

function generateGemini(projectRoot: string, name: string, author: { name: string; email: string }): string[] {
  const paths: string[] = [];

  const r0 = writeIfNotExists(
    join(projectRoot, "GEMINI.md"),
    buildGeminiMd(name, author)
  );
  if (r0.created) paths.push(r0.path);

  return paths;
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
MCP: aiyoucli-mcp (configured in opencode.json) — 87 tools across 23 categories
Team: @aiyou-dev/team plugin — 8 coding-team agents for delegation
Status: aiyoucli statusline
Skills: TOON-distilled in .aiyoucli/skills/
`;
}

function generateOpenCode(projectRoot: string, name: string, author: { name: string; email: string }): string[] {
  const paths: string[] = [];

  // opencode.json
  const r0 = writeIfNotExists(
    join(projectRoot, "opencode.json"),
    JSON.stringify(buildOpenCodeJson(), null, 2) + "\n"
  );
  if (r0.created) paths.push(r0.path);

  // OPENCODE.md
  const r1 = writeIfNotExists(
    join(projectRoot, "OPENCODE.md"),
    buildOpenCodeMd(name, author)
  );
  if (r1.created) paths.push(r1.path);

  return paths;
}

// ── Common (all targets) ────────────────────────────────────────

function generateCommon(projectRoot: string): string[] {
  const paths: string[] = [];

  // Statusline script
  const statuslinePath = generateStatuslineScript(projectRoot);
  paths.push(statuslinePath);

  // DSI TOON — distill AGENTS.md if it exists
  const agentsMdPath = join(projectRoot, "AGENTS.md");
  if (existsSync(agentsMdPath)) {
    try {
      const md = readFileSync(agentsMdPath, "utf-8");
      const toon = distillMarkdown(md);
      const toonPath = join(projectRoot, ".aiyoucli", "agents.dsi.toon");
      mkdirSync(dirname(toonPath), { recursive: true });
      writeFileSync(toonPath, toon, "utf-8");
      paths.push(toonPath);
    } catch {
      // Non-critical — NAPI might not be available in all environments
    }
  }

  return paths;
}

// ── Main ────────────────────────────────────────────────────────

/**
 * Generate tool-specific configuration files for selected targets.
 *
 * @param projectRoot  Root directory of the project.
 * @param targets      Which tools to configure. Defaults to all.
 * @returns Array of absolute paths to generated files.
 */
export async function generateSettings(
  projectRoot: string,
  targets?: ToolTarget[]
): Promise<string[]> {
  const effectiveTargets: ToolTarget[] = targets ?? ["claude", "gemini", "opencode"];
  const name = detectProjectName(projectRoot);
  const author = detectGitAuthor();
  const paths: string[] = [];

  // Generate per-target configs
  for (const target of effectiveTargets) {
    switch (target) {
      case "claude":
        paths.push(...generateClaude(projectRoot, name, author));
        break;
      case "gemini":
        paths.push(...generateGemini(projectRoot, name, author));
        break;
      case "opencode":
        paths.push(...generateOpenCode(projectRoot, name, author));
        break;
    }
  }

  // Common files (statusline, TOON distillation)
  paths.push(...generateCommon(projectRoot));

  return paths;
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
