/**
 * Generates tool-specific configuration files:
 * - .mcp.json                (MCP server config for Claude Code)
 * - .claude/settings.json    (statusLine hook for Claude Code)
 * - CLAUDE.md                (pointer to AGENTS.md)
 * - GEMINI.md                (pointer to AGENTS.md + Gemini-specific config)
 * - .aiyoucli/helpers/statusline.cjs (standalone statusline script)
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { generateStatuslineScript } from "../statusline/generator.js";

interface SettingsResult {
  path: string;
  created: boolean;
}

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

// ── .mcp.json (MCP server for Claude Code) ─────────────────────

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

// ── .claude/settings.json (statusLine hook) ────────────────────

function buildClaudeSettings(): object {
  return {
    statusLine: {
      type: "command",
      command: "aiyoucli statusline --compact",
    },
  };
}

// ── CLAUDE.md ──────────────────────────────────────────────────

function buildClaudeMd(name: string, author: { name: string; email: string }): string {
  return `# Claude Code — ${name}

See AGENTS.md for project instructions.

## Author

All commits and PRs should be authored by:
\`\`\`
${author.name} <${author.email}>
\`\`\`

## MCP Server

This project uses aiyoucli as an MCP server (51 tools).
Configured in \`.mcp.json\`.

Available tools: memory, agents, swarm, tasks, sessions, hooks, config, analysis, neural, routing, metrics, and more.
Run \`aiyoucli mcp tools\` to see the full list.

## Statusline

Rich status dashboard via statusline hook in \`.claude/settings.json\`.
To regenerate: \`aiyoucli statusline --generate\`
`;
}

// ── GEMINI.md ──────────────────────────────────────────────────

function buildGeminiMd(name: string, author: { name: string; email: string }): string {
  return `# Gemini CLI — ${name}

See AGENTS.md for project instructions.

## Author

All commits and PRs should be authored by:
\`\`\`
${author.name} <${author.email}>
\`\`\`

## MCP Server

This project uses aiyoucli as an MCP server (51 tools).

\`\`\`bash
aiyoucli-mcp
\`\`\`

## Available tools

Run \`aiyoucli mcp tools\` to see all 51 MCP tools:
memory, agents, swarm, tasks, sessions, hooks, config, analysis, neural, routing, metrics, and more.

## Statusline

View project status: \`aiyoucli statusline\`
JSON output: \`aiyoucli statusline --json\`
`;
}

// ── Main ────────────────────────────────────────────────────────

/**
 * Generate tool-specific configuration files.
 * Supports: Claude Code, Gemini CLI.
 * Will not overwrite existing files.
 *
 * @returns Array of absolute paths to generated files.
 */
export async function generateSettings(projectRoot: string): Promise<string[]> {
  const name = detectProjectName(projectRoot);
  const author = detectGitAuthor();
  const paths: string[] = [];

  // 1. .mcp.json (MCP server for Claude Code)
  const r0 = writeIfNotExists(
    join(projectRoot, ".mcp.json"),
    JSON.stringify(buildMcpJson(), null, 2) + "\n"
  );
  if (r0.created) paths.push(r0.path);

  // 2. .claude/settings.json (statusLine hook)
  const r1 = writeIfNotExists(
    join(projectRoot, ".claude", "settings.json"),
    JSON.stringify(buildClaudeSettings(), null, 2) + "\n"
  );
  if (r1.created) paths.push(r1.path);

  // 3. CLAUDE.md
  const r2 = writeIfNotExists(
    join(projectRoot, "CLAUDE.md"),
    buildClaudeMd(name, author)
  );
  if (r2.created) paths.push(r2.path);

  // 4. GEMINI.md
  const r3 = writeIfNotExists(
    join(projectRoot, "GEMINI.md"),
    buildGeminiMd(name, author)
  );
  if (r3.created) paths.push(r3.path);

  // 5. Statusline script
  const statuslinePath = generateStatuslineScript(projectRoot);
  paths.push(statuslinePath);

  return paths;
}
