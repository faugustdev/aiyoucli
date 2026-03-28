# aiyoucli vs @aiyou-dev/cli — Comparativa

## Tamaño del proyecto

| Métrica | Viejo (v3/@aiyou-dev/cli) | Nuevo (aiyoucli) |
|---------|--------------------------|-------------------|
| TypeScript files | 178 | 35 |
| Rust files | 0 | 8 |
| Total source files | 178 | 43 |
| npm dependencies | 5 + 11 optional | 1 (@napi-rs/cli dev) |
| External packages | 16 (@aiyou-dev/*, @ruvector/*, agentic-flow) | 0 (todo in-process via NAPI) |
| NAPI binary | N/A | 4.3MB |

## Commands (42 → 20)

| Command | Viejo | Nuevo | Notas |
|---------|:-----:|:-----:|-------|
| init | Y | Y | Nuevo genera AGENTS.md (universal standard) |
| agent | Y | Y | spawn/list/status/stop |
| swarm | Y | Y | init/status/stop |
| memory | Y | Y | Ahora via NAPI (redb+HNSW) en vez de sql.js |
| mcp | Y | Y | start/status/tools |
| task | Y | Y | create/list/status/complete |
| session | Y | Y | start/end/list |
| hooks | Y | Y | route/pre-task/post-task/stats |
| config | Y | Y | get/set |
| status | Y | Y | |
| doctor | Y | Y | Incluye NAPI health check |
| neural | Y | Y | observe/learn/stats via SONA NAPI |
| security | Y | Y | scan (npm audit + git) |
| analyze | Y | Y | diff/commit/complexity via NAPI |
| route | Y | Y | Q-learning + model tier via NAPI |
| gcc | Y | Y | git context |
| daemon | Y | Y | worker daemon + queue |
| completions | Y | Y | bash/zsh |
| update | Y | - | Placeholder |
| performance | Y | Y | benchmark via NAPI |
| hive-mind | Y | N | Movido a aiyoudev (orquestador) |
| deployment | Y | N | Movido a aiyoudev |
| appliance | Y | N | Movido a aiyoudev (RVFA format) |
| embeddings | Y | N | Mergeado en memory |
| claims | Y | N | Movido a aiyoudev |
| issues | Y | N | Usar `gh` directo |
| providers | Y | N | Movido a aiyoudev |
| plugins | Y | N | Deferido |
| migrate | Y | N | No hay legacy |
| workflow | Y | N | Movido a aiyoudev |
| process | Y | N | Movido a aiyoudev |
| progress | Y | N | Era tracking interno |
| benchmark | Y | N | Mergeado en performance |
| guidance | Y | N | Movido a aiyoudev |
| fabric | Y | N | Deferido |
| ruvector | Y | N | Reemplazado por NAPI bindings |
| transfer-store | Y | N | Deferido (IPFS) |
| start | Y | N | Redundante con mcp start |

## MCP Tools (29 modulos → 14 modulos, ~150 tools → 40 tools)

| Modulo | Viejo | Nuevo | Tools |
|--------|:-----:|:-----:|-------|
| memory-tools | Y | Y | 6 (init, store, search, count, stats, delete) |
| agent-tools | Y | Y | 4 (spawn, list, status, stop) |
| swarm-tools | Y | Y | 3 (init, status, stop) |
| task-tools | Y | Y | 4 (create, list, status, complete) |
| session-tools | Y | Y | 3 (start, end, list) |
| hooks-tools | Y | Y | 5 (pre_task, post_task, route, model_route, stats) |
| config-tools | Y | Y | 2 (get, set) |
| system-tools | Y | Y | 2 (status, doctor) |
| analyze-tools | Y | Y | 3 (diff, commit, complexity) |
| neural-tools | Y | Y | 4 (observe, transform, learn, stats) |
| gcc-tools | Y | Y | 1 (git_context) |
| security-tools | Y | Y | 1 (scan) |
| performance-tools | Y | Y | 1 (benchmark) |
| coordination-tools | Y | Y | 1 (status) |
| agentdb-tools | Y | N | Reemplazado por memory NAPI |
| browser-tools | Y | N | No es concern del CLI |
| claims-tools | Y | N | Orquestador |
| daa-tools | Y | N | Over-engineered |
| embeddings-tools | Y | N | Mergeado en memory |
| fabric-tools | Y | N | Deferido |
| github-tools | Y | N | Usar `gh` |
| hive-mind-tools | Y | N | Orquestador |
| progress-tools | Y | N | Tracking interno |
| terminal-tools | Y | N | Redundante |
| transfer-tools | Y | N | Deferido |
| workflow-tools | Y | N | Orquestador |

## Subsistemas internos (16 → 6)

| Subsistema | Viejo | Nuevo | Notas |
|-----------|:-----:|:-----:|-------|
| commands/ | Y | Y | 42 → 20 commands |
| mcp-tools/ | Y | Y (mcp/) | 29 → 14 modulos |
| production/ | Y | Y | circuit-breaker, retry, rate-limiter, error-handler |
| services/ | Y | Y | worker-daemon, worker-queue |
| init/ | Y | Y | 10 → 2 generators (AGENTS.md + settings) |
| napi/ | N | Y | NUEVO: Rust bindings loader |
| ruvector/ | Y | N | Portado a Rust NAPI (routing.rs, analysis.rs) |
| memory/ | Y | N | Portado a Rust NAPI (vector.rs, sona.rs) |
| appliance/ | Y | N | Movido a aiyoudev |
| transfer/ | Y | N | Deferido |
| infrastructure/ | Y | N | In-memory repos ahora en tools |
| runtime/ | Y | N | Movido a aiyoudev |
| plugins/ | Y | N | Deferido |
| update/ | Y | N | Placeholder |
| benchmarks/ | Y | N | Mergeado en performance |
| gcc/ | Y | N | Inline en gcc-tools |
| types/ | Y | N | Inline en types.ts |

## Intelligence engine

| Componente | Viejo (TypeScript) | Nuevo (Rust NAPI) |
|-----------|-------------------|-------------------|
| Q-Learning router | ruvector/q-learning-router.ts | routing.rs |
| MoE router | ruvector/moe-router.ts | routing.rs (keyword heuristic) |
| Model tier selection | ruvector/model-router.ts | routing.rs (haiku/sonnet/opus) |
| AST analyzer | ruvector/ast-analyzer.ts | analysis.rs (complexity scorer) |
| Diff classifier | ruvector/diff-classifier.ts | analysis.rs |
| Coverage router | ruvector/coverage-router.ts | Pendiente |
| Graph analyzer | ruvector/graph-analyzer.ts | graph.rs (KnowledgeGraph) |
| Flash attention | ruvector/flash-attention.ts | attention.rs (4 mechanisms) |
| LoRA adapter | ruvector/lora-adapter.ts | sona.rs (MicroLoRA) |
| Semantic router | ruvector/semantic-router.ts | Parcial (keywords en routing.rs) |
| SONA optimizer | memory/sona-optimizer.ts | sona.rs |
| EWC++ | memory/ewc-consolidation.ts | En aiyouvector-sona |
| Memory (sql.js + HNSW) | memory/memory-initializer.ts | vector.rs (redb + HNSW) |

## Performance

| Metrica | Viejo | Nuevo |
|---------|-------|-------|
| CLI startup | ~300-500ms | ~50ms |
| Vector insert | N/A (sql.js) | 18us/vector |
| Vector search | N/A (WASM HNSW) | 256us/query |
| SONA adaptation | <0.05ms (JS) | <0.01ms (Rust) |
| Binary dependency | Node.js + npm packages | Node.js + 4.3MB .node |

## Lo que falta implementar

| Prioridad | Feature | Esfuerzo |
|-----------|---------|----------|
| Alta | Statusline visual (colores, swarm status, vector stats) | Medio |
| Alta | update command (self-update real) | Medio |
| Alta | AST analyzer completo (multi-language con tree-sitter) | Alto |
| Alta | Semantic router real (embeddings, no solo keywords) | Alto |
| Media | Coverage router (parsear reportes nyc/c8) | Medio |
| Media | MoE router real (8 expertos con pesos aprendidos) | Alto |
| Media | Persistence del Q-table a disco | Bajo |
| Media | HNSW index en memory tools (ahora usa flat) | Bajo |
| Baja | Shell completions para fish/powershell | Bajo |
| Baja | Plugin system | Alto |
| Baja | Transfer/IPFS pattern sharing | Alto |
| Fase 8 | npm packaging + GitHub Actions CI | Medio |
