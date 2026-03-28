/**
 * Generates an AGENTS.md file following the agents.md universal standard.
 * Detects project metadata from package.json when available.
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";

interface ProjectInfo {
  name: string;
  description: string;
  scripts: Record<string, string>;
}

function detectProject(projectRoot: string): ProjectInfo {
  const pkgPath = join(projectRoot, "package.json");
  const fallbackName = basename(projectRoot);

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return {
        name: pkg.name ?? fallbackName,
        description: pkg.description ?? "",
        scripts: pkg.scripts ?? {},
      };
    } catch {
      // Malformed package.json — fall through
    }
  }

  return { name: fallbackName, description: "", scripts: {} };
}

function buildContent(project: ProjectInfo): string {
  const { name, description, scripts } = project;

  const buildCmd = scripts.build ?? "# no build step detected";
  const testCmd = scripts.test ?? "# no test command detected";
  const lintCmd = scripts.lint ?? "# no lint command detected";
  const devCmd = scripts.dev ?? scripts.start ?? "# no dev command detected";

  const header = `# AGENTS.md — ${name}\n`;
  const desc = description ? `\n${description}\n` : "";

  const buildSection = `
## Build & Run

\`\`\`bash
# Build
${buildCmd.startsWith("#") ? buildCmd : `npm run build   # ${buildCmd}`}

# Dev
${devCmd.startsWith("#") ? devCmd : `npm run dev     # ${devCmd}`}

# Test
${testCmd.startsWith("#") ? testCmd : `npm test        # ${testCmd}`}

# Lint
${lintCmd.startsWith("#") ? lintCmd : `npm run lint    # ${lintCmd}`}
\`\`\`
`;

  const codeStyle = `
## Code Style

- TypeScript strict mode, ES2022 target
- Use \`node:\` protocol for built-in imports (\`import { readFileSync } from "node:fs"\`)
- Prefer \`const\` over \`let\`; avoid \`var\`
- Use explicit return types on exported functions
- Keep files under 500 lines
- Use meaningful names; avoid abbreviations
- Handle errors explicitly — no silent \`catch {}\` blocks in production paths
`;

  const agentInstructions = `
## Agent Instructions

### Memory

Store and retrieve knowledge across sessions using aiyoucli memory tools:
- \`memory_store\` — persist key-value pairs with optional namespace and tags
- \`memory_search\` — semantic search across stored knowledge
- \`memory_retrieve\` — fetch a specific key

### Hooks

Lifecycle hooks for task orchestration:
- \`hooks_pre_task\` — run before starting a task (validation, context loading)
- \`hooks_post_task\` — run after task completion (cleanup, learning storage)
- \`hooks_route\` — determine which model tier handles a task

### Routing

3-tier model routing for cost/latency optimization:
| Tier | Handler | Use Case |
|------|---------|----------|
| 1 | WASM Agent Booster | Simple transforms (<1ms, $0) |
| 2 | Fast model | Low-complexity tasks |
| 3 | Reasoning model | Architecture, security, complex logic |
`;

  const mcpTools = `
## Available MCP Tools

| Category | Tools |
|----------|-------|
| Memory | store, search, retrieve, list, delete |
| Agent | spawn, list, terminate, status |
| Swarm | init, status, scale, terminate |
| Task | create, list, status, cancel |
| Session | start, resume, list, end |
| Hooks | pre-task, post-task, route, worker list |
| Config | get, set, reset |
| System | health, version, doctor |
| Analyze | code, dependencies, complexity |
| Neural | embed, similarity, cluster |
| Security | scan, audit, validate |
| Performance | profile, benchmark, optimize |
| Coordination | consensus, broadcast, sync |
`;

  const conventions = `
## Conventions

- Configuration lives in \`aiyoucli.config.json\` or \`.aiyoucli/config.json\`
- Memory is stored in \`.aiyoucli/memory/\` by default
- Never commit secrets, \`.env\` files, or API keys
- Validate all inputs at system boundaries
- Run tests after code changes; verify build before committing
`;

  return [header, desc, buildSection, codeStyle, agentInstructions, mcpTools, conventions]
    .join("")
    .trimEnd() + "\n";
}

/**
 * Generate an AGENTS.md file in the given project root.
 * Will not overwrite an existing file unless the caller has
 * confirmed via a --force flag (not handled here).
 *
 * @returns Absolute path to the generated file.
 */
export async function generateAgentsMd(projectRoot: string): Promise<string> {
  const outPath = join(projectRoot, "AGENTS.md");

  if (existsSync(outPath)) {
    throw new Error(
      `AGENTS.md already exists at ${outPath}. Use --force to overwrite.`
    );
  }

  const project = detectProject(projectRoot);
  const content = buildContent(project);

  // Ensure the directory exists (no-op for project root, but safe)
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, "utf-8");

  return outPath;
}
