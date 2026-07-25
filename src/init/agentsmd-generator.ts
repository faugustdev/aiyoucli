/**
 * Generates an AGENTS.md file following the agents.md universal standard.
 * Detects project metadata from package.json (root, or monorepo sub-package).
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join, basename, dirname, sep } from "node:path";
import { checkAiyouTeamStatus } from "./team-setup.js";

// ── Types ───────────────────────────────────────────────────────

export interface ProjectInfo {
  name: string;
  description: string;
  scripts: Record<string, string>;
  /** Absolute path to the package.json that was detected (root or sub-package). */
  source: "root" | "monorepo";
  /** Relative path from project root to the package.json (only when source === "monorepo"). */
  packageRelPath?: string;
}

export interface GenerateAgentsMdOptions {
  /** Force overwrite if AGENTS.md already exists. */
  force?: boolean;
  /** Project root for monorepo detection (defaults to projectRoot). */
  cwd?: string;
}

export interface GenerateAgentsMdResult extends FileWriteResultLite {
  /** True if aiyou-team plugin was detected (affects content of AGENTS.md). */
  aiyouTeamInstalled: boolean;
}

interface FileWriteResultLite {
  path: string;
  status: "created" | "updated" | "skipped";
  diff?: { previousBytes: number; newBytes: number };
}

// ── Monorepo detection ──────────────────────────────────────────

const MONOREPO_HINTS = ["apps", "packages", "services", "modules", "libs", "tools"];

/**
 * Walk into common monorepo directories looking for the first package.json with
 * build/test/dev/lint scripts. Bounded depth and breadth to avoid pathological walks.
 */
function detectMonorepoPackage(projectRoot: string): ProjectInfo | null {
  for (const hint of MONOREPO_HINTS) {
    const base = join(projectRoot, hint);
    if (!existsSync(base)) continue;

    let entries: string[];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const subdir = join(base, entry);
      // Only consider direct child directories (depth 2 from projectRoot)
      try {
        if (!statSync(subdir).isDirectory()) continue;
      } catch {
        continue;
      }

      const pkgPath = join(subdir, "package.json");
      if (!existsSync(pkgPath)) continue;

      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const scripts = pkg.scripts ?? {};
        // Prefer packages with at least one meaningful script
        if (pkg.name && (scripts.build || scripts.test || scripts.dev || scripts.lint)) {
          return {
            name: pkg.name,
            description: pkg.description ?? "",
            scripts,
            source: "monorepo",
            packageRelPath: pkgPath
              .replace(projectRoot + sep, "")
              .replace(/\/package\.json$/, ""),
          };
        }
      } catch {
        // Skip malformed package.json
      }
    }
  }
  return null;
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
        source: "root",
      };
    } catch {
      // Malformed root package.json — fall through to monorepo detection
    }
  }

  const monorepo = detectMonorepoPackage(projectRoot);
  if (monorepo) return monorepo;

  return { name: fallbackName, description: "", scripts: {}, source: "root" };
}

// ── Content builders ────────────────────────────────────────────

function buildContent(project: ProjectInfo, aiyouTeamInstalled: boolean): string {
  const { name, description, scripts, source, packageRelPath } = project;

  const buildCmd = scripts.build ?? "# no build step detected";
  const testCmd = scripts.test ?? "# no test command detected";
  const lintCmd = scripts.lint ?? "# no lint command detected";
  const devCmd = scripts.dev ?? scripts.start ?? "# no dev command detected";

  const header = `# AGENTS.md — ${name}\n`;
  const desc = description ? `\n${description}\n` : "";

  const sourceHint =
    source === "monorepo" && packageRelPath
      ? `\n> Detected from monorepo package: \`${packageRelPath}/package.json\`\n`
      : "";

  const buildSection = `
## Build & Run

${source ? "" : ""}\`\`\`bash
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

### Discovery (check what's available)

Before starting work, discover what aiyoucli exposes:
- \`capabilities\` — reports NAPI features, aiyouvector integration, aiyou-team availability, embed server status
- \`version\` — version info for aiyoucli, aiyouvector, aiyou-team, runtime env

### Memory

Persistent vector memory via Rust NAPI (HNSW index, SIMD-accelerated):
- \`memory_init\` — initialize vector DB (persistent at \`.aiyoucli/vectors.redb\`)
- \`memory_store\` — store a vector with optional ID and metadata
- \`memory_search\` — semantic similarity search (top-k, default 5)
- \`memory_count\` — get number of stored vectors
- \`memory_delete\` — delete a vector by ID

### Stats (consolidated)

Get statistics for any subsystem in one tool:
- \`stats\` with \`scope: memory|routing|neural|semantic|cache|full\`

### Neural Learning (SONA)

Continuous learning without catastrophic forgetting via MicroLoRA adapters:
- \`neural_observe\` — submit observation (embedding + quality score)
- \`neural_transform\` — transform embedding through learned LoRA weights
- \`neural_learn\` — force background learning on buffered observations

### Hooks & Routing

Lifecycle hooks with Q-learning task routing:
- \`hooks_pre_task\` — pre-task hook: routing recommendation
- \`hooks_post_task\` — post-task hook: record reward in Q-table, persist to disk
- \`route\` — unified routing: \`action: qlearn|model_tier|keyword|hybrid|enhanced\`

### Status (consolidated)

Get system status in one tool:
- \`status\` with \`scope: system|statusline\`
`;

  const mcpTools = `
## Available MCP Tools

### Consolidated tools (use \`action\` / \`scope\` / \`mode\` / \`type\` param)

| Tool | Dispatch |
|------|----------|
| \`route\` | \`action: qlearn|model_tier|keyword|hybrid|enhanced\` |
| \`status\` | \`scope: system|statusline\` |
| \`stats\` | \`scope: memory|routing|neural|semantic|cache|full\` |
| \`metrics\` | \`action: record_tokens|cost|memory|latency|tools_summary|save|reset\` |
| \`embed\` | \`type: onnx|keyword\` |
| \`analyze\` | \`type: diff|commit|complexity\` |
| \`ast\` | \`mode: analyze|batch|detect\` |

### Discovery tools

| Tool | Description |
|------|-------------|
| \`capabilities\` | Reports NAPI features, aiyouvector integration, aiyou-team availability, embed server status |
| \`version\` | Version info for aiyoucli, aiyouvector, aiyou-team, runtime env |

### Individual tools by category

| Category | Tools |
|----------|-------|
| Memory | memory_init, memory_store, memory_search, memory_count, memory_delete |
| Hooks | hooks_pre_task, hooks_post_task |
| Config | config_get, config_set |
| System | system_doctor |
| Neural | neural_observe, neural_transform, neural_learn |
| Security | security_scan |
| Performance | perf_benchmark |
| Distiller | distill_markdown, distill_file |
| Skills | skills_sync, skills_list, skills_detect |
| Proxy | proxy_health, proxy_chat, proxy_compress, proxy_shield_check, proxy_estimate_cost, proxy_analyze_text, proxy_segment |
| GCC | git_context |
`;

  // Conditional section: only include agent delegation table when the plugin is installed.
  // Otherwise emit a clear warning so AGENTS.md never advertises non-existent agents.
  const aiyouTeam = aiyouTeamInstalled
    ? `
## aiyou-team Agent Delegation

When the \`@aiyou-dev/team\` plugin is active, use the \`task\` tool with \`subagent_type\` to delegate work to specialized team members.

### Coding Team Agents

| Agent | Role | Tier | When to Use |
|-------|------|------|-------------|
| \`coding-leader\` | Execution-first orchestrator | flagship | Complex multi-file tasks, context owner |
| \`coordination-leader\` | Plan-first coordinator | strong | Ambiguous tasks, scope control, delegation |
| \`coding-executor\` | Direct implementation | flagship | Pure coding, minimal delegation |
| \`codebase-explorer\` | Read-only code search | fast | "Where is X?", "Which files contain Y?" |
| \`web-researcher\` | External docs research | balanced | API docs, library docs, best practices |
| \`reviewer\` | Code review gate | strong | Verification, blocker detection |
| \`principal-advisor\` | Strategic advisory | strong | Architecture decisions, trade-offs |
| \`multimodal-looker\` | Visual interpretation | balanced | Screenshots, diagrams, PDFs |

### Delegation Examples

\`\`\`
# Delegate implementation to coding-executor
task(
  description="Implement auth module",
  subagent_type="coding-executor",
  prompt="Add JWT authentication to src/api/auth.ts..."
)

# Delegate research to web-researcher
task(
  description="Research rate limiting",
  subagent_type="web-researcher",
  prompt="Find best practices for API rate limiting..."
)

# Delegate review to reviewer
task(
  description="Review PR #42",
  subagent_type="reviewer",
  prompt="Review changes in src/auth/ for security issues..."
)
\`\`\`
`
    : `
## aiyou-team Agent Delegation

> ⚠️  **The \`@aiyou-dev/team\` plugin is not installed.**
> The agents listed below (coding-leader, coding-executor, etc.) are NOT currently
> available in this OpenCode session. Run \`aiyoucli setup\` to install the plugin,
> then regenerate this file with \`aiyoucli init --force\` to load the agent table.

| Agent | Role | Status |
|-------|------|--------|
| \`coding-leader\` | Execution-first orchestrator | ❌ plugin not installed |
| \`coordination-leader\` | Plan-first coordinator | ❌ plugin not installed |
| \`coding-executor\` | Direct implementation | ❌ plugin not installed |
| \`codebase-explorer\` | Read-only code search | ❌ plugin not installed |
| \`web-researcher\` | External docs research | ❌ plugin not installed |
| \`reviewer\` | Code review gate | ❌ plugin not installed |
| \`principal-advisor\` | Strategic advisory | ❌ plugin not installed |
| \`multimodal-looker\` | Visual interpretation | ❌ plugin not installed |

Install with: \`npm install -g @aiyou-dev/team && aiyou-team setup\`
`;

  const conventions = `
## Conventions

- All state lives in \`.aiyoucli/\` (vectors, Q-table, metrics, skills)
- Config: \`aiyoucli.config.json\` or \`.aiyoucli/config.json\`
- Vector memory: \`.aiyoucli/vectors.redb\` (HNSW + redb persistence)
- Q-learning: \`.aiyoucli/q-table.json\` (auto-saved on post_task)
- Skills: \`.aiyoucli/skills/*.dsi.toon\` (TOON-distilled, ~52% fewer tokens)
- Never commit secrets, \`.env\` files, or API keys
- Validate all inputs at system boundaries
- Run tests after code changes; verify build before committing
`;

  return [header, desc, sourceHint, buildSection, codeStyle, agentInstructions, mcpTools, aiyouTeam, conventions]
    .join("")
    .trimEnd() + "\n";
}

// ── Main ────────────────────────────────────────────────────────

/**
 * Generate an AGENTS.md file in the given project root.
 *
 * Behaviour:
 *   - If AGENTS.md does not exist → write generated content, return "created".
 *   - If AGENTS.md exists and `force` is true → overwrite, return "updated".
 *   - If AGENTS.md exists and `force` is false → throw (caller catches & skips).
 *
 * The aiyou-team section is conditionally rendered based on plugin availability,
 * so AGENTS.md never lies about installed agents.
 */
export async function generateAgentsMd(
  projectRoot: string,
  opts: GenerateAgentsMdOptions = {}
): Promise<GenerateAgentsMdResult> {
  const outPath = join(projectRoot, "AGENTS.md");
  const previousBytes = existsSync(outPath) ? safeStat(outPath) : 0;

  if (existsSync(outPath) && !opts.force) {
    throw new Error(
      `AGENTS.md already exists at ${outPath}. Use --force to overwrite.`
    );
  }

  const project = detectProject(projectRoot);
  const aiyouTeamInstalled = checkAiyouTeamStatus().installed;
  const content = buildContent(project, aiyouTeamInstalled);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, "utf-8");

  return {
    path: outPath,
    status: previousBytes === 0 ? "created" : "updated",
    diff: previousBytes === 0 ? undefined : { previousBytes, newBytes: safeStat(outPath) },
    aiyouTeamInstalled,
  };
}

function safeStat(p: string): number {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}