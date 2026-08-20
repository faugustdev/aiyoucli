# aiyoucli

> **Infraestructura de agentes IA para desarrolladores.** Inteligencia vectorial potenciada por Rust, equipos de agentes estructurados y grafos de conocimiento de código — unificados en un solo CLI y servidor MCP.

[![npm version](https://img.shields.io/npm/v/@aiyou-dev/cli)](https://www.npmjs.com/package/@aiyou-dev/cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen)](https://www.npmjs.com/package/@aiyou-dev/cli)
[![node](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org)

[Read in English](README.md)

---

## Por qué aiyoucli

| Señal | Valor |
|--------|-------|
| **Superficie** | 25 comandos CLI · 48 tools MCP · 8 roles de agente · 12 crates de Rust (2 aiyoucli + 10 aiyouvector) |
| **Tamaño** | 14.765 líneas de TypeScript |
| **Costo en runtime** | Cero dependencias de runtime. Un único binario NAPI maneja todo el cómputo |
| **Latencia** | Selección de tier de modelo en 0.04ms · Aprendizaje neural en 0.18ms · k-hop de grafo en 0.08ms |

---

## Ecosistema

```
                    ┌──────────────────────────────┐
                    │          aiyoucli             │
                    │   CLI + MCP Server (TS)       │
                    │   25 comandos · 48 tools MCP  │
                    └─────┬──────────┬──────────────┘
                          │          │
              ┌───────────┘          └───────────┐
              ▼                                  ▼
   ┌──────────────────┐              ┌──────────────────────┐
   │   @aiyou-dev/team │              │    aiyouvector        │
   │  Agent Teams (TS) │              │  Knowledge Graph (Rust)│
   │  8 roles de agente│              │  10 crates · SQLite    │
   │  Plugin OpenCode  │              │  Tree-sitter · FFI     │
   └──────────────────┘              └──────────────────────┘
```

`aiyouvector` no tiene servidor MCP ni proceso propio de cara al CLI — nadie
lo usa directamente. `aiyoucli-napi` enlaza sus crates de Rust en el mismo
proceso (NAPI) y `aiyoucli` es lo único que le habla: como CLI
(`aiyoucli codebase ...`, primario) y como 3 tools MCP consolidados
(secundario, para hosts que solo hablan MCP).

| Componente | Paquete | Propósito |
|-----------|---------|---------|
| **aiyoucli** | `@aiyou-dev/cli` | CLI + servidor MCP. Capa de orquestación, middleware de producción, experiencia de desarrollo |
| **aiyou-team** | `@aiyou-dev/team` | Equipos de agentes estructurados con especialización de rol, quality gates e integración de plugin para OpenCode |
| **aiyouvector** | `aiyouvector-*` (Rust) | Grafo de conocimiento de código, motor vectorial, perfil de desarrollador, aprendizaje neural, ruteo por atención — enlazado a `aiyoucli` vía FFI, sin servidor propio |

---

## Inicio rápido

```sh
# Instalar globalmente
npm install -g @aiyou-dev/cli

# Inicializar el proyecto — AGENTS.md, skills, statusline, y para Claude Code:
# .claude/agents/*.md + un .aiyou-team-plugin/ listo para cargar, ambos por defecto
aiyoucli init

# Para OpenCode específicamente
aiyoucli init --tool opencode

# Chequeo de salud
aiyoucli doctor
```

---

## Comandos CLI

### Núcleo

```
aiyoucli init                          Inicializar proyecto — AGENTS.md, settings, skills, statusline
aiyoucli setup                         Setup global — instala aiyou-team para OpenCode
aiyoucli status                        Vista general del sistema
aiyoucli doctor                        Diagnóstico de salud (Node ≥ 20, NAPI, git)
aiyoucli config get --key <path>       Leer valor de config (notación de puntos)
aiyoucli config set --key <path> -v    Escribir valor de config
aiyoucli completions --shell <shell>   Generar completions de shell (bash/zsh/fish/powershell)
aiyoucli statusline                    Dashboard de terminal enriquecido
aiyoucli gcc                           Contexto git (branch, status, commits, diffs)
aiyoucli pdf2md <archivo.pdf> [--out f]   PDF → Markdown
aiyoucli daemon start|status|stop      Daemon de trabajo en background
aiyoucli update check|install          Chequear/instalar el último release de aiyoucli
```

### Equipo de agentes

La orquestación de agentes la provee el plugin `@aiyou-dev/team` de OpenCode. `aiyoucli setup` lo instala; `aiyoucli team status` reporta si está conectado.

```
aiyoucli setup                         Setup global — instala aiyou-team para OpenCode
aiyoucli team status                   Reporta si @aiyou-dev/team está instalado/conectado

aiyoucli agent list                    Roster + el modelo efectivo de cada agente (override o default de tier)
aiyoucli agent set-model <agente> <modelo>   Fija un modelo para un agente, en ambos hosts
```

- **OpenCode** — `plugin: ["@aiyou-dev/team"]` en `opencode.json` registra los 8 agentes automáticamente al cargar OpenCode.
- **Claude Code** — `aiyoucli init --tool claude` escribe `.claude/agents/*.md` para los 8 agentes (así la herramienta `task` de Claude Code puede delegarles) **y** genera un Plugin de Claude Code listo para cargar — ambos activados por defecto desde v1.7.1 (`--skip-agents` / `--skip-plugin` para desactivarlos). Ver [Claude Code](#claude-code) más abajo.

### Protocolo A2A (Agent2Agent)

Una implementación mínima en `HTTP+JSON` del [protocolo A2A](https://github.com/a2aproject/A2A) (Agent Card + `message:send`/`tasks/{id}`), sin dependencias nuevas.

```
aiyoucli a2a card <url>                                 Obtener el Agent Card de un agente remoto
aiyoucli a2a call <url> "<msj>" --skill <id>            Enviar un mensaje y esperar a que la tarea termine
aiyoucli a2a serve [--agent <nombre>] [--runtime claude|opencode] [--auth-token <t>]
                                                          Exponer los propios agentes de aiyou-team vía A2A
```

`serve` despacha a un agente real — `--runtime claude` (default) vía `claude -p --agent <skill>`; `--runtime opencode` vía un `opencode serve` corriendo (o gestionado automáticamente) a través de su API HTTP. La auth es un token bearer compartido opcional; sin él, `serve` se niega a hacer bind fuera de `localhost`.

### Inteligencia

```
aiyoucli memory init --path <p> --dimensions <d>    Inicializar el vector store
aiyoucli memory store --vector <v> --id <id>        Guardar un embedding
aiyoucli memory search --vector <v> --k <n>         Búsqueda K-NN de similitud
aiyoucli memory list                                 Listar vectores guardados
aiyoucli memory stats                                Estadísticas de la base de datos
aiyoucli memory delete --id <id>                     Eliminar un vector

aiyoucli neural observe --embedding <e> --quality <q> --kind <k>
aiyoucli neural learn                                Forzar ciclo de aprendizaje
aiyoucli neural stats                                Estadísticas del motor SONA

aiyoucli analyze diff --diff <d>                     Clasificar un git diff
aiyoucli analyze commit --message <m>                Clasificar commit (conventional)
aiyoucli analyze complexity --source <s>             Puntaje de complejidad de código

aiyoucli route --task <descripción>                  Ruteo de tareas por Q-learning
aiyoucli hooks route --task <descripción>            Ruteo vía hook
aiyoucli hooks pre-task --description <d>            Hook pre-tarea
aiyoucli hooks post-task --description <d>           Hook post-tarea
aiyoucli hooks stats                                 Estadísticas de ruteo

aiyoucli security scan                               Auditoría de seguridad
aiyoucli performance benchmark --vectors <n>         Benchmarks vectoriales
```

### Codebase (indexado, búsqueda, consultas de grafo)

Interfaz primaria para el motor de grafo de conocimiento `aiyouvector` — CLI-first
por diseño (ver [Grafo de Conocimiento de Código](#grafo-de-conocimiento-de-código-aiyouvector)
más abajo para el porqué). Cada subcomando llama a la misma función subyacente que
llaman los tools MCP `codebase_project`/`codebase_query`/`codebase_maintenance` —
sin lógica duplicada, solo dos puertas de entrada a una misma capa FFI.

```
aiyoucli codebase index <path> [--mode full|moderate|fast|cross-repo-intelligence]
aiyoucli codebase list                                Listar proyectos indexados
aiyoucli codebase delete <proyecto>                   Eliminar el índice de un proyecto
aiyoucli codebase status <proyecto>                    Conteo de nodos/edges/archivos, schema
aiyoucli codebase search <proyecto> --query <q>        Búsqueda BM25 o --name-pattern
aiyoucli codebase trace <proyecto> <función> [--direction callers|callees|both] [--depth <n>]
                                                          Trace de call-graph por BFS
aiyoucli codebase changes <proyecto>                    Conteo de archivos trackeados (no es un git diff)
aiyoucli codebase query <proyecto> "<cypher>"           Consulta de grafo estilo Cypher
aiyoucli codebase schema <proyecto>                     Labels de nodos + tipos de edge
aiyoucli codebase snippet <proyecto> <nombre_calificado>   Código fuente de un símbolo
aiyoucli codebase architecture <proyecto>               Clusters detectados por comunidad
aiyoucli codebase verify [--init] [--strict]            Verificar el manifiesto en disco
aiyoucli codebase export <proyecto> [--out-dir <d>]     Archivar un proyecto
aiyoucli codebase import <archivo>                      Restaurar un proyecto archivado
aiyoucli codebase observe <path>                        Pasada de aprendizaje Observer/SONA, sin reindexar
```

### MCP y Skills

```
aiyoucli mcp start                                   Iniciar el servidor MCP por stdio
aiyoucli mcp status                                  Estado del servidor
aiyoucli mcp tools                                   Listar tools disponibles

aiyoucli skills sync                                 Sincronizar y destilar skills a TOON
aiyoucli skills list                                 Listar skills instalados
aiyoucli skills detect                               Detectar tecnologías del proyecto
```

---

## Equipos de Agentes (`@aiyou-dev/team`)

Equipos de agentes estructurados con especialización de rol, quality gates basados en evidencia, e integración completa con el plugin de OpenCode.

### El Coding Team

Un equipo embebido. Ocho roles especializados. Un único owner activo a la vez.

| Rol | Arquetipo | Tier de modelo | Propósito |
|------|-----------|------------|---------|
| **CodingLeader** | ejecutor + orquestador | flagship | Owner primario de ejecución. Persistente, pragmático, orientado a cierre |
| **CoordinationLeader** | orquestador | strong | Apertura estilo gerencial para tareas de alta ambigüedad. Planifica, acota, delega |
| **CodingExecutor** | ejecutor | flagship | Hoja pura de ejecución. Termina el trabajo. Nunca delega implementación |
| **CodebaseExplorer** | investigador | fast | Especialista read-only dentro del repo. 3+ ángulos de búsqueda en paralelo. Rutas absolutas |
| **WebResearcher** | investigador | balanced | Especialista externo read-only. Evidencia > especulación. Docs oficiales primero |
| **Reviewer** | revisor | strong | Default-approve. Máximo 3 issues bloqueantes. 80% de claridad = aprobar |
| **PrincipalAdvisor** | asesor | strong | Asesor senior read-only. Una recomendación. Máximo 7 pasos de acción |
| **MultimodalLooker** | intérprete | balanced | Intérprete de PDF/imagen/screenshot. Requiere modelos con visión |

### Principios de diseño

```
Owner Único Activo → Basado en Evidencia → Quality Gates → Delegación Mínima
```

- **Owner único activo**: Exactamente un agente sostiene el contexto principal y conduce al cierre
- **Evidencia requerida**: Todo claim necesita verificación. Diagnósticos + build + tests deben pasar
- **Revisión default-approve**: El Reviewer rechaza solo por bloqueadores reales (máximo 3 issues)
- **Especialistas read-only**: Explorer, Researcher, Reviewer, Advisor y Looker no pueden modificar archivos
- **Sin fallas silenciosas**: Nada de `as any`, `@ts-ignore`, catches vacíos, o borrar tests que fallan
- **Disciplina de todos**: Tareas de 2+ pasos requieren tracking estructurado con un solo `in_progress` a la vez
- **Precedencia de instrucciones**: Plataforma > Repositorio > Equipo > Agente > Tarea

### Workflow

```
Recibir → Localizar Evidencia → Planificar/Delegar → Implementar → Revisar → Verificar → Resumir
```

### Plugin de OpenCode

aiyou-team se distribuye como plugin de primera clase para OpenCode:

```jsonc
// opencode.json
{
  "plugin": ["@aiyou-dev/team"]
}
```

### Claude Code

Claude Code sí tiene un mecanismo de plugin real (a diferencia del wiring
automático de `@aiyou-dev/team` en OpenCode, necesita una fuente explícita),
así que aiyoucli te da tanto un camino rápido y local al proyecto como uno
compartible — **ambos generados por defecto** desde v1.7.1, sin flags extra:

```bash
aiyoucli init --tool claude
```

Escribe `.claude/agents/<nombre>.md` para cada uno de los 8 agentes:

- `coding-leader` (opus) — orquestador orientado a ejecución
- `coordination-leader` (sonnet) — coordinador orientado a plan
- `coding-executor` (opus) — implementación directa
- `codebase-explorer` (haiku) — búsqueda read-only de código
- `web-researcher` (sonnet) — investigación de docs externas
- `reviewer` (sonnet) — gate de revisión de código
- `principal-advisor` (sonnet) — asesoría estratégica
- `multimodal-looker` (sonnet) — interpretación visual

Cada archivo tiene un frontmatter YAML (`name`, `description`, `tools`, `model`) y
un system prompt escrito a mano — el modelo viene de
`aiyoucli agent set-model <agente> <modelo>` si está fijado, si no un default por tier.
Re-correr `init` es un no-op para estos archivos (idempotente); usá `--force` para
refrescarlos.

**También genera `.aiyou-team-plugin/`** — los mismos 8 agentes empaquetados como un
[Claude Code Plugin](https://code.claude.com/docs/en/plugins) real
(`.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`), más dos
hooks que los archivos `.claude/` sueltos no tienen por su cuenta:
`SessionStart` (recordatorio del roster como contexto inicial) y `UserPromptSubmit`
(un hint de ruteo del router de Q-learning, mostrado solo por encima de un umbral
de confianza). Se carga con:

```bash
claude --plugin-dir ./.aiyou-team-plugin
```

`--skip-agents` / `--skip-plugin` desactivan uno u otro. `aiyoucli plugin build`
regenera solo el plugin por su cuenta (por ejemplo, después de `agent set-model`).

### i18n

Traducciones completas para **inglés** y **español**. Prompts de agentes, manifiesto del equipo, y todas las secciones de documentación.

```sh
aiyou-team setup --language es    # Español
aiyou-team setup --language en    # Inglés (default)
```

---

## Grafo de Conocimiento de Código (`aiyouvector`)

Un motor nativo en Rust que indexa tu código en un grafo de conocimiento
consultable. **`aiyouvector` no tiene servidor MCP ni proceso propio de
cara al cliente** — nadie lo usa directamente. `aiyoucli-napi` enlaza sus
crates en el mismo proceso (FFI) y `aiyoucli` es el único consumidor: la
familia de comandos `codebase` de arriba es la interfaz primaria
(descubrible vía `--help`, sin el costo fijo de schema MCP — ver
[mcp2cli](https://pypi.org/project/mcp2cli/) y su razonamiento de
"ahorrar 96-99% de los tokens desperdiciados en schemas de tools cada
turno"); 3 tools MCP consolidados (`codebase_project`, `codebase_query`,
`codebase_maintenance`) son el camino secundario, para hosts que solo
hablan MCP y no pueden correr un comando de shell. `aiyouvector` también
distribuye un binario CLI standalone (`aiyouvector index/search/query/...`)
para uso humano directo, y `aiyouvector serve` (feature `visual`) — un
visor 3D de grafo separado, solo para humanos, no relacionado con la
superficie orientada a agentes de arriba.

### Arquitectura

```
Capa 4 — Codebase          codebase (indexer, BM25/cypher, submódulos
                            metagraph/gnn/solver, verificador, exportador,
                            graph-ui [visual])
Capa 3 — Aprendizaje        profile · sona · observer · watchdog
Capa 2 — Inteligencia       routing · attention · embeddings
Capa 1 — Fundación          core (HNSW + SIMD + redb) · graph
```

### 10 Crates

| Crate | Función |
|-------|----------|
| `aiyouvector-codebase` | Indexado de código: parsing tree-sitter, búsqueda, trace, Cypher, servidor graph-ui |
| `aiyouvector-core` | Motor vectorial: HNSW, distancia SIMD, almacenamiento redb, cuantización |
| `aiyouvector-graph` | Grafo de conocimiento: nodos/edges tipados, BFS, export CSR, persistencia redb |
| `aiyouvector-profile` | Perfil de desarrollador: pattern matching, grafo de preferencias, análisis temporal |
| `aiyouvector-sona` | Auto-aprendizaje: MicroLoRA (rank 2), REINFORCE, consolidación EWC++ |
| `aiyouvector-attention` | Mecanismos de atención: scaled-dot, multi-head, flash, linear |
| `aiyouvector-embeddings` | Embedder de texto por feature-hashing (n-gram + hashing trick), <1μs/embed |
| `aiyouvector-routing` | Ruteo por tier de modelo con router de Q-learning |
| `aiyouvector-observer` | Watcher de filesystem + embedder SimHash |
| `aiyouvector-watchdog` | Contexto de sesión de agente + notificaciones de cambio de memoria |

`metagraph`/`gnn`/`solver` son submódulos dentro de `aiyouvector-codebase`,
no crates separados.

### Pipeline de indexado

```
1. Parse en paralelo (tree-sitter, rayon)   ─── 18 lenguajes
2. Extraer símbolos → nodos del grafo       ─── 17 tipos de nodo
3. Extraer relaciones → edges del grafo     ─── 21 tipos de edge
4. Actualizar hashes de archivo (SHA256)    ─── indexado incremental
5. Reconstruir índice full-text FTS5        ─── búsqueda BM25 lista
```

**Lenguajes soportados** (18, gramática tree-sitter por extensión): Rust, TypeScript/TSX, JavaScript/JSX, Python, Go, Java, C, C++, C#, Ruby, PHP, Scala, YAML, JSON, Markdown, HTML, CSS, Bash

### Acceso (CLI primero, MCP secundario)

Ver [Codebase (indexado, búsqueda, consultas de grafo)](#codebase-indexado-búsqueda-consultas-de-grafo)
arriba para la lista completa de comandos `aiyoucli codebase ...` — esa es la
interfaz primaria. Las mismas 14 operaciones también son accesibles vía MCP
como 3 tools despachados por modo (no un tool por operación — ver
[Servidor MCP](#servidor-mcp) más abajo):

| Tool MCP | modos |
|----------|-------|
| `codebase_project` | `index`, `list`, `delete`, `export`, `import` |
| `codebase_query` | `status`, `search`, `trace`, `changes`, `cypher`, `schema`, `snippet`, `architecture` |
| `codebase_maintenance` | `verify`, `observe` |

### Soporte de consultas Cypher

```cypher
MATCH (n:Function)-[:Calls]->(m:Function)
WHERE n.name = "handleRequest"
RETURN n, m
LIMIT 10
```

Compila a CTEs SQL recursivas con límite de profundidad 5. Soporta `MATCH`, `WHERE`, `RETURN`, `LIMIT`.

### Modos de búsqueda

| Modo | Método | Caso de uso |
|------|--------|----------|
| **BM25** | Full-text FTS5 con split de camelCase | Búsqueda por nombre, keyword lookup |
| **Vector** | Similitud coseno sobre embeddings de 768 dims | Búsqueda semántica |
| **Híbrido** | Reciprocal Rank Fusion (k=60) | Lo mejor de ambos |
| **Regex** | Matching de patrón de nombre | Consultas con wildcard |

### Perfil de desarrollador (aprendizaje)

Loop de aprendizaje de tres niveles que corre localmente sin llamadas de red:

| Loop | Frecuencia | Acción |
|------|-----------|--------|
| **A — Instantáneo** | Por observación | Acumulación de gradiente MicroLoRA (rank 2, ~500 params) |
| **B — Cada hora** | Intervalo 3600s | Vacía el buffer, procesa señales, aplica gradientes |
| **C — Semanal** | Intervalo 604800s | Decay, re-clustering K-means++, poda de patrones de baja confianza |

### Detección de comunidades

Propagación de labels estilo Leiden con resolución configurable. Devuelve clusters con puntajes de cohesión (internal_edges / total_edges).

---

## Servidor MCP

48 tools en 24 módulos, todos desde un único servidor. Cualquier cliente
compatible con MCP puede usarlos; `aiyouvector` no tiene servidor MCP propio —
su capacidad de indexado de código está consolidada en este mismo proceso vía
FFI (ver [Grafo de Conocimiento de Código](#grafo-de-conocimiento-de-código-aiyouvector)).

### Configuración

```jsonc
// .mcp.json — esto es exactamente lo que genera `aiyoucli init --with-mcp`
{
  "mcpServers": {
    "aiyoucli": {
      "command": "aiyoucli-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

### Categorías de tools

| Módulo | Destacados |
|--------|------------|
| **Metrics** | Tracking de tokens, cálculo de costo, percentiles de latencia, uso de memoria |
| **Proxy Gateway** | Chat completions, shield anti-prompt-injection, compresión, caché, embedding, segmentación |
| **Vector Memory** | Almacenamiento persistente HNSW (redb), insert/search/delete/count/stats |
| **Semantic Router** | Ruteo híbrido keyword + embedding |
| **Hooks & Lifecycle** | Ruteo por Q-learning y hooks pre/post tarea |
| **Neural Learning** | Motor SONA: observe, transform, learn, stats |
| **Code & AST Analysis** | Diff, commit, complejidad, y análisis AST multi-lenguaje |
| **Skills** | Sync TOON, listado, y detección de tecnologías |
| **Distiller** | Destilación de markdown a TOON |
| **Codebase (aiyouvector vía FFI)** | Index, search, trace, Cypher, architecture, schema, snippets |
| **Config & System** | Configuración por notación de puntos y diagnósticos de salud |
| **A2A** | Cliente del protocolo Agent2Agent — obtiene un Agent Card remoto, envía un mensaje y espera la tarea |
| **PDF** | Extracción de PDF a Markdown |
| **Discovery** | Reporte de capacidades/versión para hosts MCP-only |
| **Git Context (GCC)** | Branch, status, commits, diffs |
| **Security** | Auditoría de seguridad estática |
| **Performance** | Benchmarks del motor vectorial |
| **Status & Stats** | Estado del sistema/statusline; estadísticas por subsistema |
| **Graph** | Bootstrap del grafo de conocimiento y consultas de vecinos k-hop |

---

## Integración con OpenCode

aiyoucli se integra con [OpenCode](https://opencode.ai) en varios niveles:

### 1. Sistema de plugins

```jsonc
// opencode.json — esto es exactamente lo que genera `aiyoucli init --tool opencode`
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "aiyoucli": { "type": "local", "command": ["aiyoucli-mcp"], "enabled": false }
  },
  "plugin": ["aiyou-team"],
  "instructions": ["AGENTS.md"]
}
```

(`mcp.aiyoucli.enabled` es `false` a menos que se haya pasado `--with-mcp` — el mismo razonamiento de off-por-defecto que el `.mcp.json` de Claude Code.)

### 2. Equipos de agentes como sesiones de OpenCode

Cada rol de agente mapea a una sesión de OpenCode con tier de modelo, temperatura, tools y permisos propios:

| Agente | Sesión OpenCode | Tier de modelo | Visión |
|-------|-----------------|------------|--------|
| CodingLeader | `coding-leader` | flagship | — |
| CoordinationLeader | `coordination-leader` | strong | — |
| CodingExecutor | `coding-executor` | flagship | — |
| CodebaseExplorer | `codebase-explorer` | fast | — |
| WebResearcher | `web-researcher` | balanced | — |
| Reviewer | `reviewer` | strong | — |
| PrincipalAdvisor | `principal-advisor` | strong | — |
| MultimodalLooker | `multimodal-looker` | balanced | requerida |

### 3. Hook de Statusline

Dashboard de terminal enriquecido que muestra vectores, tests, estado de git, modelo y contexto — solo datos que realmente existen.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                     CLI / Servidor MCP                        │
│                      (TypeScript)                             │
│   Comandos CLI · tools MCP · middleware de producción         │
│   Circuit breaker · Rate limiter · Retry + backoff exponencial│
├──────────────────────────────────────────────────────────────┤
│                    Puente NAPI                                │
│                    aiyoucli-napi (~32MB)                      │
├──────────────────────────────────────────────────────────────┤
│                     Motores en Rust                           │
│                                                               │
│  vector    HNSW + SIMD       │  Ruteo + caché de gateway      │
│  sona      MicroLoRA+EWC++   │  Shield + firewall             │
│  attention 4 mecanismos      │  Compresión + segmentación     │
│  routing   Q-learning        │  Análisis AST (6 lenguajes)    │
│  graph     k-hop + BFS       │  Ruteo semántico (híbrido)     │
│  analysis  diff/commit/      │  Embedding (cliente ONNX)      │
│            complejidad       │                                 │
│  detector  45+ tecnologías   │                                 │
│  distiller formato TOON      │                                 │
├──────────────────────────────────────────────────────────────┤
│                    aiyouvector (10 crates)                    │
│  codebase (incl. submódulos solver/gnn/metagraph) · graph      │
│  profile · embeddings · sona · attention · routing             │
│  observer · watchdog · core                                   │
└──────────────────────────────────────────────────────────────┘
```

**Diseño**: TypeScript maneja I/O, protocolo MCP, y middleware de producción. Todo el cómputo cruza el puente NAPI hacia Rust, donde las operaciones terminan en microsegundos.

---

## Rendimiento

Benchmarks en Apple M-series. Todo in-process, sin llamadas de red.

| Operación | Latencia | Throughput |
|-----------|--------:|-----------:|
| Selección de tier de modelo | 0.04ms | 23.923 ops/s |
| Graph k-hop (100 nodos) | 0.08ms | 13.158 ops/s |
| Ruteo de tareas | 0.11ms | 8.718 ops/s |
| Análisis de complejidad | 0.15ms | 6.631 ops/s |
| Neural learn | 0.18ms | 5.445 ops/s |
| Neural observe | 0.42ms | 2.398 ops/s |
| Insert vectorial (3D) | 1.87ms | 534 ops/s |
| Búsqueda vectorial (100 vectores) | 3.36ms | 297 ops/s |

---

## Configuración

```sh
aiyoucli config set memory.dimensions 384
aiyoucli config set memory.backend aiyouvector
aiyoucli config set llm.base_url http://127.0.0.1:8000/v1
```

Overrides por variable de entorno:

| Variable | Ruta de config |
|----------|------------|
| `AIYOUCLI_MEMORY_BACKEND` | `memory.backend` |
| `AIYOUCLI_MEMORY_PATH` | `memory.storagePath` |
| `AIYOUCLI_MEMORY_DIMENSIONS` | `memory.dimensions` |
| `AIYOUCLI_MCP_PORT` | `mcp.port` |
| `AIYOUCLI_VERBOSITY` | `cli.verbosity` |
| `NO_COLOR` | `cli.color = false` |

---

## Soporte de plataformas

| Target | Binario |
|--------|--------|
| macOS ARM64 | `@aiyou-dev/cli-darwin-arm64` |
| macOS x64 | `@aiyou-dev/cli-darwin-x64` |
| Linux ARM64 | `@aiyou-dev/cli-linux-arm64-gnu` |
| Linux x64 | `@aiyou-dev/cli-linux-x64-gnu` |
| Windows x64 | `@aiyou-dev/cli-win32-x64-msvc` |

---

## Estructura de archivos

```
.aiyoucli/
├── config.json              # Configuración del proyecto
├── memory-config.json       # Config de la base de datos vectorial
├── vectors.redb             # Base de datos vectorial persistente
├── q-table.json             # Persistencia de Q-Learning
├── metrics/*.json           # Snapshots de métricas
├── skills/*.dsi.toon        # Archivos de skill destilados a TOON
├── helpers/statusline.cjs   # Script de statusline
└── agents.dsi.toon          # AGENTS.md destilado a TOON
```

---

## Contribuir

```sh
git clone https://github.com/faugustdev/aiyoucli.git
cd aiyoucli
npm install
npm run build       # Rust NAPI + TypeScript
npm test
```

Requiere Rust 1.77+ (stable). El crate NAPI depende de los crates de aiyouvector en `../aiyouvector/crates/`.

---

## Licencia

MIT — [LICENSE](LICENSE)

---

Hecho por [Francisco August](https://github.com/faugustdev).
