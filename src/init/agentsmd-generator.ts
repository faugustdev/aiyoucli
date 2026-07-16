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
- \`stats\` with \`scope: memory|agents|routing|neural|semantic|cache|full\`

### Neural Learning (SONA)

Continuous learning without catastrophic forgetting via MicroLoRA adapters:
- \`neural_observe\` — submit observation (embedding + quality score)
- \`neural_transform\` — transform embedding through learned LoRA weights
- \`neural_learn\` — force background learning on buffered observations

### Hooks & Routing

Lifecycle hooks with Q-learning task routing:
- \`hooks_pre_task\` — pre-task hook: routing recommendation, auto-start local models
- \`hooks_post_task\` — post-task hook: record reward in Q-table, persist to disk
- \`route\` — unified routing: \`action: qlearn|model_tier|keyword|hybrid|enhanced\`

### Status (consolidated)

Get system status in one tool:
- \`status\` with \`scope: system|coordination|statusline|swarm\`

### Deep Research (NAPI-powered)

Multi-engine web research with Rust NAPI orchestration:
- \`rd_init\` — start research session (langgraph-agent, source-based, focused-iteration, quick)
- \`rd_search\` — search across engines (arXiv, PubMed, Semantic Scholar, Wikipedia, SearXNG)
- \`rd_report\` — generate markdown/json research report
- \`rd_knowledge_graph\` — view knowledge graph nodes and connections
- \`rd_document_process\` — process PDF/DOCX/images with optional OCR (Rust NAPI)
- \`rd_citations\` — generate citations (APA, MLA, Chicago, BibTeX)
`;

  const mcpTools = `
## Available MCP Tools (60)

8 consolidated tools (replacing 29 redundant) + 2 discovery tools + 50 individual tools.

### Consolidated tools (use \`action\` / \`scope\` / \`mode\` / \`type\` param)

| Tool | Replaces | Dispatch |
|------|----------|----------|
| \`route\` | hooks_route, hooks_model_route, semantic_route, semantic_route_hybrid, semantic_route_enhanced | \`action: qlearn\|model_tier\|keyword\|hybrid\|enhanced\` |
| \`status\` | system_status, coordination_status, statusline, swarm_status | \`scope: system\|coordination\|statusline\|swarm\` |
| \`stats\` | memory_stats, agent_metrics, hooks_stats, neural_stats, semantic_stats, proxy_cache_stats, metrics_snapshot | \`scope: memory\|agents\|routing\|neural\|semantic\|cache\|full\` |
| \`metrics\` | metrics_record_tokens, cost, memory, latency, tools_summary, save, reset | \`action: record_tokens\|cost\|memory\|latency\|tools_summary\|save\|reset\` |
| \`embed\` | proxy_embed, semantic_embed | \`type: onnx\|keyword\` |
| \`models\` | models_list, models_optimize, models_start, models_stop, models_status, proxy_list_models | \`action: list\|optimize\|start\|stop\|status\|list_remote\` |
| \`analyze\` | analyze_diff, analyze_commit, analyze_complexity | \`type: diff\|commit\|complexity\` |
| \`ast\` | ast_analyze, ast_analyze_batch, ast_detect_language | \`mode: analyze\|batch\|detect\` |

### Discovery tools (expose aiyouvector + aiyou-team to MCP clients)

| Tool | Description |
|------|-------------|
| \`capabilities\` | Reports NAPI features, aiyouvector integration, aiyou-team availability, embed server status |
| \`version\` | Version info for aiyoucli, aiyouvector, aiyou-team, runtime env |

### Individual tools by category

| Category | Count | Tools |
|----------|-------|-------|
| Memory | 5 | memory_init, memory_store, memory_search, memory_count, memory_delete |
| Agent | 5 | agent_spawn, agent_list, agent_status, agent_stop, agent_record |
| Swarm | 2 | swarm_init, swarm_stop |
| Task | 4 | task_create, task_list, task_status, task_complete |
| Session | 3 | session_start, session_end, session_list |
| Hooks | 2 | hooks_pre_task, hooks_post_task |
| Config | 2 | config_get, config_set |
| System | 1 | system_doctor |
| Neural | 3 | neural_observe, neural_transform, neural_learn |
| Security | 1 | security_scan |
| Performance | 1 | perf_benchmark |
| Distiller | 2 | distill_markdown, distill_file |
| Skills | 3 | skills_sync, skills_list, skills_detect |
| Proxy | 7 | proxy_health, proxy_chat, proxy_compress, proxy_shield_check, proxy_estimate_cost, proxy_analyze_text, proxy_segment |
| Deep Research | 8 | rd_init, rd_search, rd_strategies, rd_status, rd_report, rd_knowledge_graph, rd_document_process, rd_citations |
| GCC | 1 | git_context |
`;

  const aiyouTeam = `
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
`;

  const conventions = `
## Conventions

- All state lives in \`.aiyoucli/\` (vectors, agents, swarm, tasks, sessions, Q-table, metrics, skills)
- Config: \`aiyoucli.config.json\` or \`.aiyoucli/config.json\`
- Vector memory: \`.aiyoucli/vectors.redb\` (HNSW + redb persistence)
- Q-learning: \`.aiyoucli/q-table.json\` (auto-saved on post_task)
- Skills: \`.aiyoucli/skills/*.dsi.toon\` (TOON-distilled, ~52% fewer tokens)
- Never commit secrets, \`.env\` files, or API keys
- Validate all inputs at system boundaries
- Run tests after code changes; verify build before committing
`;

  return [header, desc, buildSection, codeStyle, agentInstructions, mcpTools, aiyouTeam, conventions]
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
