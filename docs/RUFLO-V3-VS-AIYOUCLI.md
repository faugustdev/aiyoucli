# Ruflo V3 (@aiyou-dev/cli) vs aiyoucli — Comparativa Detallada

Documento de referencia para entender que tiene cada CLI, que se porto, que falta, y que se descarto intencionalmente.

## Numeros

| Metrica | Ruflo V3 | aiyoucli | Ratio |
|---------|----------|----------|-------|
| Archivos fuente | 178 TS | 35 TS + 8 Rust (43 total) | 4x menos |
| Lineas de codigo | ~80,000 | ~5,500 | 14x menos |
| Commands | 42 | 21 | 2x menos |
| Command subcommands | 140+ | ~60 | 2.3x menos |
| MCP tool modules | 29 | 15 | 2x menos |
| MCP tools total | ~150 | 41 | 3.6x menos |
| npm dependencies | 5 core + 11 optional | 0 runtime | Todo in-process |
| External packages | 16 (@aiyou-dev/*, @ruvector/*, agentic-flow) | 0 | NAPI elimina todo |
| Binary | N/A (requiere npm packages) | 4.3MB .node | Single binary |
| CLI startup | ~300-500ms | ~50ms | 6-10x mas rapido |
| Vector search | sql.js WASM (~ms) | Rust NAPI (~256us) | ~4x mas rapido |

---

## Commands: Que hay, que falta, que se descarto

### Portados (21 commands)

| Command | Ruflo V3 subcommands | aiyoucli subcommands | Diferencias |
|---------|---------------------|---------------------|-------------|
| **init** | wizard, presets, skills, hooks (4) | (1 action, genera AGENTS.md + CLAUDE.md + GEMINI.md + settings + statusline) | Ruflo generaba solo CLAUDE.md. aiyoucli genera AGENTS.md universal + GEMINI.md + statusline |
| **agent** | spawn, list, status, stop, metrics, pool, health, logs (8) | spawn, list, status, stop (4) | Faltan: metrics, pool, health, logs. Los 4 que hay funcionan igual |
| **swarm** | init, status, expand, contract, health, mode (6) | init, status, stop (3) | Faltan: expand, contract, health, mode. Stop reemplaza contract |
| **memory** | init, store, search, list, retrieve, clear, export, import, backup, stats, gc (11) | init, store, search, list, stats, delete (6) | Faltan: retrieve (mergeado en search), clear, export, import, backup, gc |
| **mcp** | start, stop, status, list, call, test, config, logs, install (9) | start, status, tools (3) | Faltan: stop, call, test, config, logs, install. Uso basico cubierto |
| **task** | create, list, status, complete, update, cancel (6) | create, list, status, complete (4) | Faltan: update, cancel |
| **session** | save, restore, list, delete, export, import, status (7) | start, end, list (3) | Faltan: save (= end), delete, export, import, status. Simplificado |
| **hooks** | 27 hooks (pre-edit, post-edit, pre-command, post-command, pre-task, post-task, session-*, route, explain, pretrain, build-agents, metrics, transfer, list, intelligence, worker, progress, statusline, coverage-*) | route, pre-task, post-task, model-route, stats (5) | De 27 hooks a 5 MCP tools. Faltan: pre/post-edit, pre/post-command, session hooks, explain, pretrain, build-agents, metrics, transfer, intelligence, coverage-* |
| **config** | load, save, validate, show, set, reset, sync (7) | get, set (2) | Simplificado a get/set |
| **status** | system overview, watch mode (3) | status (1) | Falta: watch mode |
| **doctor** | health checks, --fix (1) | doctor (1) | Equivalente. aiyoucli agrega NAPI health check |
| **neural** | train, status, patterns, predict, optimize (5) | observe, learn, stats (3) | Renombrado. Faltan: predict, optimize. observe = train simplificado |
| **security** | scan, audit, cve, threats, validate, report (6) | scan (1) | Solo scan basico (npm audit + git). Faltan: audit, cve, threats, validate, report |
| **analyze** | complexity, coverage, dependencies, risk (4) | diff, commit, complexity (3) | Nuevo: diff y commit classification. Faltan: coverage, dependencies, risk |
| **route** | Q-Learning task-to-agent routing (1) | route (1) | Equivalente funcional |
| **gcc** | analyze, status, suggest (3) | git_context (1) | Simplificado a un solo output |
| **daemon** | start, stop, status, trigger, enable (5) | (placeholder) | No implementado realmente |
| **completions** | bash, zsh, fish, powershell (4) | bash, zsh (2) | Faltan: fish, powershell |
| **update** | check, install, list, rollback (4) | (placeholder) | No implementado |
| **performance** | benchmark, profile, metrics, optimize, report (5) | benchmark (1) | Solo benchmark. Faltan: profile, metrics, optimize, report |
| **statusline** | (era un hook en Ruflo) | statusline, --json, --generate (1) | NUEVO como command. En Ruflo era hook de hooks. aiyoucli lo tiene como command + MCP tool + standalone script |

### Descartados intencionalmente (movidos a aiyoudev o deferidos)

| Command | Ruflo V3 | Razon de exclusion | Donde va |
|---------|----------|-------------------|----------|
| **hive-mind** | consensus, verify, sync, status, rebalance, vote (6) | Coordinacion multi-agente distribuida es concern del orquestador | aiyoudev |
| **deployment** | deploy, rollback, status, environments, release (5) | Era stub (simulaba deployment). CI/CD es concern del orquestador | aiyoudev |
| **appliance** | build, run, sign, validate, distribute (5+) | RVFA binary format, empaquetado deployable | aiyoudev |
| **workflow** | run, template, list, deploy, status, history (6) | Ejecucion de workflows es concern del orquestador | aiyoudev |
| **process** | start, stop, list, kill, restart, status, logs (7) | Gestion de procesos OS es concern del orquestador | aiyoudev |
| **providers** | list, add, remove, test, configure (5) | Gestion de providers LLM es concern del orquestador | aiyoudev |
| **claims** | check, grant, revoke, list (4) | Autorizacion entre agentes es concern del orquestador | aiyoudev |
| **guidance** | compile, enforce, prove, evolve (4) | Governance control plane, demasiado complejo para CLI | aiyoudev |
| **plugins** | list, install, uninstall, enable, disable (5) | Sistema prematuro. Ninguno de los 16 plugins tiene usuarios | Deferido |
| **embeddings** | embed, batch, search, init (4) | Mergeado en memory. Vector search = embeddings | memory tools |
| **migrate** | status, run, rollback, validate, check (5) | No hay legacy de aiyoucli, no hay que migrar | Eliminado |
| **benchmark** | suites: neural, memory, pre-training (3) | Mergeado en `performance benchmark` | performance |
| **fabric** | list, run, compose (3) | Integracion con fabric (third-party) | Deferido |
| **ruvector** | init, setup, migrate, benchmark, backup, import, optimize, status (8) | Reemplazado por NAPI bindings directos a aiyouvector | Eliminado |
| **transfer-store** | store, from-project (2+) | IPFS pattern sharing | Deferido |
| **progress** | V3 implementation dashboard (3) | Era tracking interno de desarrollo | Eliminado |
| **issues** | issue claims integration (2) | Usar `gh` directo | Eliminado |
| **start** | start server/daemon (1) | Redundante con `mcp start` | Eliminado |

---

## MCP Tools: Que hay, que falta

### Portados (15 modulos, 41 tools)

| Modulo | Ruflo V3 tools | aiyoucli tools | Diferencia |
|--------|---------------|----------------|------------|
| **memory-tools** | init, store, search, list, retrieve, clear, export, import, backup, stats, gc (~11) | init, store, search, count, stats, delete (6) | -5 tools. Faltan: retrieve, clear, export, import, backup, gc. search reemplaza retrieve |
| **agent-tools** | spawn, list, status, metrics, pool, health, logs (~8) | spawn, list, status, stop (4) | -4 tools. Faltan: metrics, pool, health, logs |
| **swarm-tools** | init, status, expand, contract, health (~5) | init, status, stop (3) | -2 tools |
| **task-tools** | create, list, status, complete, update, cancel (~6) | create, list, status, complete (4) | -2 tools |
| **session-tools** | start, end, restore, list, export, import, status (~7) | start, end, list (3) | -4 tools |
| **hooks-tools** | 27 hooks como tools | pre_task, post_task, route, model_route, stats (5) | -22 tools. Solo los 5 mas usados |
| **config-tools** | load, save, validate, show, set, reset, sync (~7) | get, set (2) | -5 tools |
| **system-tools** | status, doctor, metrics (~3) | status, doctor (2) | -1 tool |
| **analyze-tools** | complexity, coverage, dependencies, risk (~4) | diff, commit, complexity (3) | Diferente enfoque. NUEVO: diff y commit. Faltan: coverage, dependencies, risk |
| **neural-tools** | train, status, patterns, predict, optimize (~5) | observe, transform, learn, stats (4) | NUEVO: transform (LoRA embedding). Faltan: predict, optimize |
| **gcc-tools** | analyze, status, suggest (~3) | git_context (1) | Simplificado |
| **security-tools** | scan, audit, cve, threats, validate, report (~6) | scan (1) | -5 tools |
| **performance-tools** | benchmark, profile, metrics, optimize, report (~5) | benchmark (1) | -4 tools |
| **coordination-tools** | (part of swarm) | status (1) | Agrega visibilidad de coordinacion |
| **statusline-tools** | (era un hook) | statusline (1) | NUEVO como MCP tool |

### Descartados (14 modulos)

| Modulo | Tools approx | Razon |
|--------|-------------|-------|
| **agentdb-tools** | ~8 | Reemplazado por memory-tools via NAPI. Ya no necesita AgentDB JS |
| **browser-tools** | ~3 | No es concern del CLI. Era wrapper delgado a `agent-browser` npm |
| **claims-tools** | ~4 | Autorizacion → aiyoudev |
| **daa-tools** | ~3 | Data access abstraction. Over-engineered |
| **embeddings-tools** | ~4 | Mergeado en memory-tools. Embeddings son como memory funciona internamente |
| **fabric-tools** | ~4 | Integracion third-party. Deferido |
| **github-tools** | ~5 | Usar `gh` CLI directo. Mas confiable y actualizado |
| **hive-mind-tools** | ~6 | Consenso distribuido → aiyoudev |
| **progress-tools** | ~4 | Tracking interno de dev. No tiene sentido en produccion |
| **terminal-tools** | ~3 | Redundante — MCP clients tienen su propio terminal |
| **transfer-tools** | ~5 | IPFS pattern sharing. Deferido |
| **workflow-tools** | ~6 | Workflows → aiyoudev |
| **auto-install** | ~1 | Instalar dependencias automaticamente. No necesario en proyecto limpio |
| **daa-tools** | ~3 | Data access abstraction layer. Nunca se uso realmente |

---

## Intelligence Engine: Que hay, que falta

### Portado a Rust NAPI

| Componente | Ruflo V3 (TypeScript) | aiyoucli (Rust NAPI) | Fidelidad |
|-----------|----------------------|---------------------|-----------|
| **Q-Learning router** | `ruvector/q-learning-router.ts` (570 lineas). Features: experience replay buffer, epsilon decay (exponential/linear/cosine), LRU cache, model persistence a `.swarm/q-learning-model.json`, auto-save, feature hashing, TD(lambda) eligibility traces | `routing.rs` (~250 lineas). Features: epsilon-greedy, FNV hash, in-memory Q-table, reward recording | **Parcial.** Falta: experience replay, LRU cache, model persistence a disco, eligibility traces, configurable decay types |
| **Model tier selection** | `ruvector/model-router.ts` (400+ lineas). Features: FastGRNN routing, uncertainty quantification, circuit breaker failover, online learning, complexity scoring via embeddings | `routing.rs` (keyword heuristic). Features: keyword matching (high/medium/low lists), returns haiku/sonnet/opus | **Basico.** Falta: FastGRNN, uncertainty, online learning, embedding-based scoring |
| **Diff classifier** | `ruvector/diff-classifier.ts` (450+ lineas). Features: git diff parsing, file-level classification (feature/bugfix/refactor/docs/test/config/style), impact scoring, reviewer suggestion, testing strategy, risk factors, refactoring detection, confidence calculation | `analysis.rs` (~200 lineas). Features: diff parsing, file classification, impact scoring, commit classification, risk factors | **Bueno.** Falta: reviewer suggestion, testing strategy, confidence calculation detallada |
| **Complexity scorer** | `ruvector/ast-analyzer.ts` (500+ lineas). Features: multi-language AST parsing via @babel/parser, cyclomatic complexity, call graphs, symbol extraction, import/export analysis, dependency graphs | `analysis.rs` (~80 lineas). Features: regex-based nesting/branch/function counting, normalized 0-1 score | **Basico.** Falta: AST real (tree-sitter), call graphs, symbol extraction, imports |
| **Flash attention** | `ruvector/flash-attention.ts` (300+ lineas). Features: block-wise attention O(N), CPU L1 cache optimization, pre-allocated buffers, configurable block size | `attention.rs` wraps aiyouvector-attention. Features: scaled-dot, multi-head, flash, linear — 4 mechanisms con auto-selection por input size | **Completo.** Implementacion nativa en Rust es mas performante |
| **SONA (learning)** | `memory/sona-optimizer.ts` (350+ lineas) + `memory/intelligence.ts` (400+ lineas). Features: trajectory recording, pattern persistence, adaptive routing <0.05ms, circular buffers, HNSW search for similar patterns | `sona.rs` wraps aiyouvector-sona. Features: submit_observation, transform_embedding (MicroLoRA), force_learn, Loop A (instant) + Loop B (batch) | **Bueno.** Rust es mas rapido (<0.01ms). Falta: pattern persistence a disco desde el CLI, HNSW-backed similar pattern search |
| **EWC++** | `memory/ewc-consolidation.ts` (350+ lineas). Features: Fisher information matrix, online consolidation, pattern dedup, temporal decay | En aiyouvector-sona crate directamente | **Completo.** Portado a Rust nativo |
| **Knowledge graph** | `ruvector/graph-analyzer.ts` (400+ lineas). Features: module dependency graphs, min-cut boundaries, circular dep detection | `graph.rs` wraps aiyouvector-graph. Features: add_node/edge, neighbors, k-hop BFS, CSR export, type safety | **Bueno.** Falta: min-cut, circular dep detection especificos a codigo |
| **LoRA adapter** | `ruvector/lora-adapter.ts` (200+ lineas). Features: rank-4 matrix fine-tuning | `sona.rs` MicroLoRA via aiyouvector-sona | **Completo.** En Rust nativo |

### No portado (en Ruflo V3 pero no en aiyoucli)

| Componente | Ruflo V3 | Razon | Prioridad |
|-----------|----------|-------|-----------|
| **MoE router** | `ruvector/moe-router.ts` (400+ lineas). 8 expertos especializados (code, test, design, debug, security, data, infra, docs) con routing layer aprendido | routing.rs usa keyword heuristic en su lugar. Sin pesos aprendidos | Media — el keyword heuristic funciona razonablemente bien |
| **Semantic router** | `ruvector/semantic-router.ts` (300+ lineas). Intent classification via embeddings | routing.rs usa keyword matching | Alta — necesita embeddings reales para ser preciso |
| **Enhanced model router** | `ruvector/enhanced-model-router.ts` (300+ lineas). Combina senales de AST + coverage + diff para routing | No existe. model tier usa solo keywords | Media |
| **Coverage router** | `ruvector/coverage-router.ts` (250+ lineas). Ruta tareas basado en test coverage gaps, parsea reportes nyc/c8 | No existe | Media |
| **Coverage tools** | `ruvector/coverage-tools.ts` (150+ lineas). Utilidades para parsear reportes de coverage | No existe | Media |
| **Vector DB wrapper** | `ruvector/vector-db.ts` (200+ lineas). Interface HNSW sobre sql.js | Reemplazado por NAPI vector.rs. Pero memory tools usan flat index, no HNSW config | Baja — solo necesita pasar HnswConfig al abrir DB |

---

## Subsistemas: Que hay, que falta

### Init System

| Feature | Ruflo V3 (10 archivos, 6099 lineas) | aiyoucli (2 archivos, 308 lineas) |
|---------|--------------------------------------|-----------------------------------|
| CLAUDE.md generator | Si, detallado con agent definitions, hooks, commands | Si, minimal pointer a AGENTS.md |
| GEMINI.md generator | Si | Si |
| AGENTS.md generator | No (no existia) | Si (nuevo, universal standard) |
| settings.json generator | Si | Si (con statusline hook) |
| helpers generator | Si (.claude/helpers/ con statusline.cjs, memory.js, router.js, session.js) | Solo statusline.cjs |
| statusline generator | Si (780 lineas, script CJS muy detallado) | Si (333 lineas, honesto, nueva paleta) |
| MCP config generator | Si | Si (dentro de settings) |
| Gemini config generator | Si (archivo separado) | Mergeado en settings-generator |
| Wizard/presets | Si (interactivo con opciones) | No (genera todo directo) |
| Skills setup | Si (detecta skills disponibles) | No |

### Production Hardening

| Feature | Ruflo V3 (6 archivos, 1783 lineas) | aiyoucli (5 archivos, 302 lineas) |
|---------|--------------------------------------|-----------------------------------|
| Circuit breaker | Si (3 estados, configurable) | Si (3 estados, threshold=10, reset=15s) |
| Retry con backoff | Si (exponential + jitter) | Si (exponential + jitter) |
| Rate limiter | Si (token bucket) | Si (token bucket) |
| Error handler | Si (structured with context) | Si (structured with codes + exit codes) |
| Monitoring | Si (metrics, health checks, alerting, 488 lineas) | No |
| **Integrado en tool dispatch** | No (estaba disponible pero no wired) | Si (circuit breaker + retry en mcp/client.ts) |

### Services

| Feature | Ruflo V3 (9 archivos, 5985 lineas) | aiyoucli (2 archivos, 243 lineas) |
|---------|--------------------------------------|-----------------------------------|
| Worker daemon | Si (EventEmitter, 12 worker types) | Si (EventEmitter, configurable) |
| Worker queue | Si (priority-based) | Si (critical > high > normal > low, FIFO within priority) |
| Claim service | Si (authorization between agents) | No (movido a aiyoudev) |
| Container worker pool | Si (Docker container pooling) | No (movido a aiyoudev) |
| Headless worker executor | Si (E2B sandbox) | No (movido a aiyoudev) |
| Registry API | Si (HTTP API para patterns) | No (deferido) |
| Agentic flow bridge | Si (optional dep bridge) | No (eliminado — no usamos agentic-flow) |
| Ruvector training | Si (neural training service) | No (reemplazado por NAPI neural tools) |

### Transfer/Sharing (Ruflo V3 only — 21 archivos, 5940 lineas)

| Feature | Ruflo V3 | aiyoucli |
|---------|----------|----------|
| IPFS pattern registry | Si | No (deferido) |
| Pattern anonymization | Si | No |
| Serialization formats | Si (multiple) | No |
| Export to JSON/binary | Si | No |
| Deploy seraphine | Si | No |

### Appliance System (Ruflo V3 only — 7 archivos, 2841 lineas)

| Feature | Ruflo V3 | aiyoucli |
|---------|----------|----------|
| RVFA binary format | Si | No (movido a aiyoudev) |
| Builder | Si | No |
| Runner (container/microvm/native) | Si | No |
| Ed25519 signing | Si | No |
| Distribution | Si | No |
| ruvLLM bridge (3-tier local LLM) | Si | No |
| GGUF engine | Si | No |

### Plugins (Ruflo V3 only — 8 archivos, 3240 lineas)

| Feature | Ruflo V3 | aiyoucli |
|---------|----------|----------|
| Plugin manager | Si | No (deferido) |
| Plugin store/discovery | Si (IPFS registry) | No |
| Plugin lifecycle | Si (discover, validate, install, enable, hook, disable, uninstall) | No |
| 16 domain plugins (healthcare, financial, legal, quantum, etc) | Si (todos alpha) | No |

---

## Lo que aiyoucli tiene que Ruflo V3 no tenia

| Feature | Detalle |
|---------|---------|
| **Rust NAPI core** | 6 modulos Rust compilados a binary nativo. Ruflo usaba JS/WASM packages |
| **aiyouvector integration** | In-process Rust calls a vector DB. Ruflo importaba @ruvector/* npm packages |
| **AGENTS.md** | Universal standard (Linux Foundation, 20+ tools). Ruflo solo generaba CLAUDE.md |
| **GEMINI.md** | Soporte para Gemini CLI. Ruflo tenia geminimd-generator pero sin MCP integration |
| **Statusline como command** | `aiyoucli statusline` directo + MCP tool. Ruflo lo tenia como hook interno |
| **Statusline honesta** | Solo muestra datos reales. Ruflo mostraba "DDD Domains 0/5", "CVE 0/3" etc que eran falsos |
| **Production hardening integrado** | Circuit breaker + retry en el dispatch de tools. Ruflo lo tenia disponible pero no conectado |
| **Commit classification** | `analyze commit` classifica mensajes (conventional commits). Ruflo no tenia esto |
| **Zero external deps** | Todo via NAPI in-process. Ruflo necesitaba 16 packages npm opcionales |

---

## Resumen de gaps criticos

### Alta prioridad (funcionalidad que realmente se usa)

| Gap | Que falta | Esfuerzo estimado |
|-----|-----------|-------------------|
| Q-table persistence | Guardar/cargar Q-table a disco entre sesiones | Bajo (serialize HashMap a JSON) |
| Experience replay | Buffer de experiencias para estabilizar Q-learning | Medio (port del TS, ~100 lineas Rust) |
| HNSW en memory tools | Pasar HnswConfig al abrir VectorDB (ahora usa flat) | Bajo (1 linea de config) |
| Agent metrics | Contadores de tareas/exitos/fallos por agente | Bajo (agregar campos al store.json) |
| Memory export/import | Exportar/importar vectores a JSON | Bajo |
| Semantic router | Embeddings reales en vez de keyword heuristic | Alto (necesita embedding model) |
| Monitoring | Metricas basicas de MCP tool calls | Medio |

### Media prioridad (nice to have)

| Gap | Que falta | Esfuerzo |
|-----|-----------|----------|
| AST analyzer real | tree-sitter multi-language en vez de regex | Alto |
| MoE router | 8 expertos con pesos aprendidos | Alto |
| Coverage router | Parsear reportes nyc/c8 para routing | Medio |
| Hooks: pre/post-edit | Hooks para antes/despues de editar archivos | Medio |
| Init wizard | Modo interactivo con opciones | Medio |
| daemon real | Worker daemon que corre de verdad en background | Medio |
| update command | Self-update via npm/cargo | Medio |
| Fish/powershell completions | Mas shells | Bajo |

### Baja prioridad (fue descartado por alguna razon)

| Gap | Que falta | Razon del descarte |
|-----|-----------|-------------------|
| Plugin system | Lifecycle, store, discovery | Prematuro, 0 usuarios de plugins |
| IPFS transfer | Pattern sharing entre proyectos | Infraestructura compleja para poco uso |
| Appliance/RVFA | Binary packaging format | Pertenece a aiyoudev |
| ruvLLM bridge | 3-tier local LLM routing | Requiere GGUF engine, scope muy grande |
| Enhanced model router | AST + coverage + diff combinados | El keyword heuristic funciona suficiente |
| Guidance control plane | Compile, enforce, prove, evolve | Over-engineered para una CLI |

---

## Conclusion

aiyoucli cubre el **80% de las funcionalidades mas usadas** de Ruflo V3 con **14x menos codigo**. Los gaps principales estan en:

1. **Profundidad de los comandos** — cada command tiene menos subcommands (ej: agent tiene 4 vs 8, memory 6 vs 11)
2. **Intelligence engine** — los algoritmos estan portados pero simplificados (Q-learning sin persistence, model routing sin FastGRNN)
3. **Hooks system** — de 27 hooks a 5 MCP tools

Lo que se gano:
- **Performance 6-10x mejor** por el core en Rust
- **Zero dependencias externas** — todo in-process via NAPI
- **Honestidad** — solo muestra/hace lo que realmente funciona
- **Mantenibilidad** — 43 archivos vs 178
- **Universalidad** — AGENTS.md + GEMINI.md en vez de solo CLAUDE.md
