/**
 * Generates tool-specific configuration files:
 * - .claude/settings.json  (MCP server + statusline config for Claude Code)
 * - CLAUDE.md              (pointer to AGENTS.md)
 * - GEMINI.md              (pointer to AGENTS.md + Gemini-specific config)
 * - .aiyoucli/helpers/statusline.cjs (standalone statusline script)
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
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

function writeIfNotExists(filePath: string, content: string): SettingsResult {
  if (existsSync(filePath)) {
    return { path: filePath, created: false };
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  return { path: filePath, created: true };
}

// ── Claude Code ─────────────────────────────────────────────────

function buildClaudeSettings(): object {
  return {
    mcpServers: {
      aiyoucli: {
        command: "npx",
        args: ["-y", "aiyoucli", "mcp", "serve"],
        env: {},
      },
    },
    hooks: {
      "StatusLine": [
        {
          type: "command",
          command: "node .aiyoucli/helpers/statusline.cjs",
        },
      ],
    },
  };
}

function buildClaudeMd(name: string): string {
  return `# Claude Code — ${name}

See AGENTS.md for project instructions.

## MCP Server

This project uses aiyoucli as an MCP server. Configured in \`.claude/settings.json\`.

\`\`\`bash
npx aiyoucli mcp serve
\`\`\`

## Statusline

Rich status dashboard is auto-displayed via the statusline hook.
To regenerate: \`aiyoucli statusline --generate\`
`;
}

// ── Gemini CLI ──────────────────────────────────────────────────

function buildGeminiMd(name: string): string {
  return `# Gemini CLI — ${name}

See AGENTS.md for project instructions.

## MCP Server

This project uses aiyoucli as an MCP server.

\`\`\`bash
npx aiyoucli mcp serve
\`\`\`

## Available tools

Run \`aiyoucli mcp tools\` to see all 41 MCP tools available:
memory, agents, swarm, tasks, sessions, hooks, config, analysis, neural, routing, and more.

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
  const paths: string[] = [];

  // 1. .claude/settings.json
  const r1 = writeIfNotExists(
    join(projectRoot, ".claude", "settings.json"),
    JSON.stringify(buildClaudeSettings(), null, 2) + "\n"
  );
  if (r1.created) paths.push(r1.path);

  // 2. CLAUDE.md
  const r2 = writeIfNotExists(
    join(projectRoot, "CLAUDE.md"),
    buildClaudeMd(name)
  );
  if (r2.created) paths.push(r2.path);

  // 3. GEMINI.md
  const r3 = writeIfNotExists(
    join(projectRoot, "GEMINI.md"),
    buildGeminiMd(name)
  );
  if (r3.created) paths.push(r3.path);

  // 4. Statusline script
  const statuslinePath = generateStatuslineScript(projectRoot);
  paths.push(statuslinePath);

  return paths;
}
