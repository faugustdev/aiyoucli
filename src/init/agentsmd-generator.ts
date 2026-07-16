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

Persistent vector memory via Rust NAPI (HNSW index, SIMD-accelerated):
- \`memory_init\` — initialize vector DB (persistent at \`.aiyoucli/vectors.redb\`)
- \`memory_store\` — store a vector with optional ID and metadata
- \`memory_search\` — semantic similarity search (top-k, default 5)
- \`memory_count\` — get number of stored vectors
- \`memory_stats\` — database statistics (dimensions, HNSW config)
- \`memory_delete\` — delete a vector by ID

### Neural Learning (SONA)

Continuous learning without catastrophic forgetting via MicroLoRA adapters:
- \`neural_observe\` — submit observation (embedding + quality score)
- \`neural_transform\` — transform embedding through learned LoRA weights
- \`neural_learn\` — force background learning on buffered observations
- \`neural_stats\` — engine statistics (trajectories, signals)

### Hooks & Routing

Lifecycle hooks with Q-learning task routing:
- \`hooks_pre_task\` — pre-task hook: routing recommendation, auto-start local models
- \`hooks_post_task\` — post-task hook: record reward in Q-table, persist to disk
- \`hooks_route\` — route task to optimal agent type via Q-learning
- \`hooks_model_route\` — select model tier (haiku/sonnet/opus) for cost optimization
- \`hooks_stats\` — routing engine statistics

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
## Available MCP Tools (87)

| Category | Count | Tools |
|----------|-------|-------|
| Memory | 6 | memory_init, memory_store, memory_search, memory_count, memory_stats, memory_delete |
| Agent | 6 | agent_spawn, agent_list, agent_status, agent_stop, agent_record, agent_metrics |
| Swarm | 3 | swarm_init, swarm_status, swarm_stop |
| Task | 4 | task_create, task_list, task_status, task_complete |
| Session | 3 | session_start, session_end, session_list |
| Hooks | 5 | hooks_pre_task, hooks_post_task, hooks_route, hooks_model_route, hooks_stats |
| Config | 2 | config_get, config_set |
| System | 2 | system_status, system_doctor |
| Analyze | 3 | analyze_diff, analyze_commit, analyze_complexity |
| Neural | 4 | neural_observe, neural_transform, neural_learn, neural_stats |
| Security | 1 | security_scan |
| Performance | 1 | perf_benchmark |
| Coordination | 1 | coordination_status |
| Statusline | 1 | statusline |
| Metrics | 8 | metrics_snapshot, metrics_record_tokens, metrics_cost, metrics_memory, metrics_latency, metrics_tools_summary, metrics_save, metrics_reset |
| Distiller | 2 | distill_markdown, distill_file |
| Skills | 3 | skills_sync, skills_list, skills_detect |
| Proxy | 10 | proxy_health, proxy_chat, proxy_compress, proxy_shield_check, proxy_embed, proxy_cache_stats, proxy_list_models, proxy_estimate_cost, proxy_analyze_text, proxy_segment |
| AST | 3 | ast_analyze, ast_analyze_batch, ast_detect_language |
| Semantic | 5 | semantic_route, semantic_route_hybrid, semantic_route_enhanced, semantic_embed, semantic_stats |
| Models | 5 | models_list, models_optimize, models_start, models_stop, models_status |
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
