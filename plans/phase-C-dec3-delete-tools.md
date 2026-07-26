# Fase C-Dec3+4 — Eliminar `agent`/`swarm`/`task`/`session` tools y el enum local de roles

- **Padre:** Pilar C — Cerrar la duplicación con `aiyoucli`
- **Plan gerente:** Plan de mejora integral (8 pilares)
- **Decisión:** Decisiones #3 y #4 de `decisions-2026-07-26.md`
- **Repos afectados:** `aiyoucli/`
- **Archivos eliminados:**
  - `aiyoucli/src/mcp/tools/agent-tools.ts`
  - `aiyoucli/src/mcp/tools/swarm-tools.ts`
  - `aiyoucli/src/mcp/tools/task-tools.ts`
  - `aiyoucli/src/mcp/tools/session-tools.ts`
- **Estado:** ✅ Ya aplicada (ver "Verificación realizada")

## Contexto

`agent-tools.ts`, `swarm-tools.ts`, `task-tools.ts`, `session-tools.ts`
eran 4 módulos de tools MCP que reimplementaban el mismo patrón de
persistencia JSON: cada uno definía su propio `loadX()/saveX()` con
`existsSync/readFileSync/writeFileSync/mkdirSync` sobre
`.aiyoucli/{agents,swarm,tasks,sessions}/*.json`. **No ejecutaban
nada real** — eran bookkeeping decorativo (los agentes reales viven
en `aiyou-team`).

Adicionalmente, `agent-tools.ts` definía un enum local de "roles
de agente" hardcodeado que duplicaba la realidad (los roles reales
viven en `~/.config/opencode/teams/coding-team/agents/`).

**Decisión del usuario 2026-07-26**: eliminarlos. Delegar en
`@aiyou-dev/team`, que es la implementación real con state.

**Estado al inicio de Pillar C**: los 4 archivos ya fueron eliminados
(commit `ce1954a` "Trim aiyoucli to the central Rust + aiyou-team
surface" y siguientes). Falta:
1. Verificar que ningún caller (commands/index.ts, AGENTS.md, otros tools)
   los referencia.
2. Marcar el commit de verificación.

## Componentes

### 1. Verificar ausencia de referencias

```bash
grep -rn "agent-tools\|swarm-tools\|task-tools\|session-tools" src/
grep -rn "agent_spawn\|swarm_init\|task_create\|session_create" src/
```

Ambos deben dar **0 hits** en código de producción.

### 2. Verificar ausencia de los archivos

```bash
ls src/mcp/tools/ | grep -E "(agent|swarm|task|session)-tools"
```

Debe dar **0 hits** (los 4 archivos no existen).

### 3. Verificar `src/mcp/tools/index.ts`

Ya no importa los 4 módulos. Confirmar:

```bash
grep "agent-tools\|swarm-tools\|task-tools\|session-tools" src/mcp/tools/index.ts
```

Debe dar **0 hits**.

### 4. Verificar `AGENTS.md`

La sección "CLI Commands" ya no lista `agent`, `swarm`, `task`, `session`
como comandos top-level. Confirmar.

## Pasos discretos (verificación, no aplicación)

1. `ls src/mcp/tools/` — confirmar ausencia de los 4 archivos.
2. `grep -rn "agent-tools\|swarm-tools\|task-tools\|session-tools" src/`
   — **0 hits**.
3. `grep -rn "agent_spawn\|swarm_init\|task_create\|session_create" src/`
   — **0 hits** (los nombres de tool tampoco sobreviven).
4. `npm test` — verde.

## Verificación

1. `ls src/mcp/tools/` muestra 19 archivos (no 23 como en el review).
2. `grep -rn "agent-tools\|swarm-tools\|task-tools\|session-tools" src/`
   — 0 hits.
3. `npm test` — 210/210 verde.

## Criterio de cierre de la fase

- [x] Los 4 archivos de tools no existen.
- [x] Ningún código de producción los referencia.
- [x] `src/mcp/tools/index.ts` no los importa.
- [x] `AGENTS.md` no los lista como comandos.
- [x] `npm test` verde.

## Verificación realizada

- `ls src/mcp/tools/` — 21 archivos (no 25 como en el review original; se eliminaron
  4 archivos: `agent-tools.ts`, `swarm-tools.ts`, `task-tools.ts`, `session-tools.ts`),
  ninguno de los 4 a eliminar presente.
- `grep -rn "agent-tools\|swarm-tools\|task-tools\|session-tools" src/` — 0 hits.
- `grep -rn "agent_spawn\|swarm_init\|task_create\|session_create" src/` — 0 hits.
- `npm test`: ✅ 210/210 tests, 18 archivos verde.
- `__tests__/`: ningún test referencia los nombres de tools eliminados
  (verificado en `mcp-tools-test.js`, `mcp-tools-test-v2.js`,
  `graph-tools.test.ts`, `q-table-seed.test.ts`, etc.).

## Cambios realizados (resumen)

- Ninguno en este commit. Los 4 archivos fueron eliminados en commits
  anteriores (`ce1954a`, `0deb14a`, `9721dea`). Este commit documenta
  la verificación del estado de Pillar C.

## Hallazgos abiertos (no bloqueantes para Dec3+4)

- **`task` y `hooks post-task`**: `commands/index.ts` define un comando
  `hooks post-task` con flag `--agent` que llama a `hooks_post_task`.
  Esto es ortogonal a `task-tools.ts` eliminado (que era el
  bookkeeping JSON). El comando `hooks post-task` es el Q-learning
  hook legítimo, no un duplicado.
- **`session`**: `rd-tools.ts` usa `session_id` como parámetro para los
  8 tools de deep research. Esos no son los `session-tools.ts` eliminados
  (que eran bookkeeping JSON). Es vocabulario compartido, sistemas
  distintos.

## Anti-patrones

- No recrear los 4 tools como "thin wrappers" sobre aiyou-team — la
  decisión es que aiyou-team es **la** implementación, no un backend
  opcional. Si aiyou-team no está, los tools simplemente no existen.
- No añadir un `enum AgentType` en TS — los roles viven en el
  filesystem (`~/.config/opencode/teams/`) y se leen cuando hace falta.
