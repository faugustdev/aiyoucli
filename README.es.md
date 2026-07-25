# aiyoucli

> **Infraestructura de agentes AI para desarrolladores.** Inteligencia vectorial potenciada por Rust, equipos de agentes estructurados y grafos de conocimiento de código — unificados a través de un único CLI y servidor MCP.

[![npm version](https://img.shields.io/npm/v/@aiyou-dev/cli)](https://www.npmjs.com/package/@aiyou-dev/cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen)](https://www.npmjs.com/package/@aiyou-dev/cli)
[![node](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org)

[Read in English](README.md)

---

## Por qué aiyoucli

| Señal | Valor |
|-------|-------|
| **Superficie** | 25 comandos CLI · 84 herramientas MCP · 8 roles de agente · 17 crates de Rust |
| **Huella** | 6.441 líneas de TypeScript — 65× más pequeño que herramientas comparables |
| **Costo de ejecución** | Cero dependencias en runtime. Un único binario NAPI maneja toda la computación |
| **Latencia** | Selección de modelo en 0.04ms · Aprendizaje neural en 0.18ms · Grafo k-hop en 0.08ms |

---

## Ecosistema

```
                    ┌──────────────────────────────┐
                    │          aiyoucli             │
                    │   CLI + Servidor MCP (TS)     │
                    │   25 comandos · 84 herr. MCP  │
                    └─────┬──────────┬──────────────┘
                          │          │
              ┌───────────┘          └───────────┐
              ▼                                  ▼
   ┌──────────────────┐              ┌──────────────────────┐
   │   @aiyou-dev/team │              │    aiyouvector        │
   │  Equipos Agentes  │              │  Grafo Conocim. (Rust)│
   │  8 roles agente   │              │  17 crates · SQLite    │
   │  Plugin OpenCode  │              │  Tree-sitter · MCP     │
   └──────────────────┘              └──────────────────────┘
```

| Componente | Paquete | Propósito |
|------------|---------|-----------|
| **aiyoucli** | `@aiyou-dev/cli` | CLI + servidor MCP. Capa de orquestación, middleware de producción, experiencia del desarrollador |
| **aiyou-team** | `@aiyou-dev/team` | Equipos de agentes estructurados con especialización de roles, puertas de calidad e integración como plugin de OpenCode |
| **aiyouvector** | `aiyouvector-*` (Rust) | Grafo de conocimiento de código, motor vectorial, perfil de desarrollador, aprendizaje neural, enrutamiento por atención |

---

## Inicio Rápido

```sh
# Instalación global
npm install -g @aiyou-dev/cli

# Inicializar proyecto (AGENTS.md, config MCP, skills, statusline)
aiyoucli init

# Específicamente para OpenCode
aiyoucli init --tool opencode

# Verificación de salud
aiyoucli doctor
```

---

## Comandos CLI

### Núcleo

```
aiyoucli init                          Inicializar proyecto — AGENTS.md, configuración, skills, statusline
aiyoucli setup                         Configuración global — instalar aiyou-team para OpenCode
aiyoucli status                        Resumen del estado del sistema
aiyoucli doctor                        Diagnóstico de salud (Node ≥ 20, NAPI, git)
aiyoucli config get --key <ruta>       Leer valor de configuración (notación con puntos)
aiyoucli config set --key <ruta> -v    Escribir valor de configuración
aiyoucli completions --shell <shell>   Generar autocompletado (bash/zsh)
aiyoucli statusline                    Panel de control en terminal
aiyoucli gcc                           Contexto git (rama, estado, commits, diffs)
```

### Equipo de agentes

La orquestación de agentes se ofrece mediante el plugin `@aiyou-dev/team` para OpenCode. Usa `aiyoucli setup` y `aiyoucli team` para instalarlo y gestionarlo.

### Inteligencia

```
aiyoucli memory init --path <p> --dimensions <d>    Inicializar almacén vectorial
aiyoucli memory store --vector <v> --id <id>        Almacenar embedding
aiyoucli memory search --vector <v> --k <n>         Búsqueda de similitud K-NN
aiyoucli memory list                                 Listar vectores almacenados
aiyoucli memory stats                                Estadísticas de la base de datos
aiyoucli memory delete --id <id>                     Eliminar vector

aiyoucli neural observe --embedding <e> --quality <q> --kind <k>
aiyoucli neural learn                                Forzar ciclo de aprendizaje
aiyoucli neural stats                                Estadísticas del motor SONA

aiyoucli analyze diff --diff <d>                     Clasificar diff de git
aiyoucli analyze commit --message <m>                Clasificar commit (convencional)
aiyoucli analyze complexity --source <s>             Puntuación de complejidad

aiyoucli route --task <descripción>                  Enrutamiento Q-learning
aiyoucli hooks route --task <descripción>            Enrutamiento por hooks
aiyoucli hooks pre-task --description <d>            Hook pre-tarea
aiyoucli hooks post-task --description <d>           Hook post-tarea
aiyoucli hooks stats                                 Estadísticas de enrutamiento

aiyoucli security scan                               Auditoría de seguridad
aiyoucli performance benchmark --vectors <n>         Benchmarks vectoriales
```

### MCP y Skills

```
aiyoucli mcp start                                   Iniciar servidor MCP stdio
aiyoucli mcp status                                  Estado del servidor
aiyoucli mcp tools                                   Listar herramientas disponibles

aiyoucli skills sync                                 Sincronizar y destilar skills a TOON
aiyoucli skills list                                 Listar skills instaladas
aiyoucli skills detect                               Detectar tecnologías del proyecto
```

---

## Equipos de Agentes (`@aiyou-dev/team`)

Equipos de agentes estructurados con especialización de roles, puertas de calidad basadas en evidencia e integración completa como plugin de OpenCode.

### El Coding Team

Un equipo embebido. Ocho roles especializados. Un único propietario activo en todo momento.

| Rol | Arquetipo | Tier de Modelo | Propósito |
|-----|-----------|----------------|-----------|
| **CodingLeader** | ejecutor + orquestador | flagship | Propietario de ejecución principal. Persistente, pragmático, orientado al cierre |
| **CoordinationLeader** | orquestador | strong | Apertura estilo gestión para tareas de alta ambigüedad. Planifica, acota, delega |
| **CodingExecutor** | ejecutor | flagship | Hoja de ejecución pura. Termina el trabajo. Nunca delega implementación |
| **CodebaseExplorer** | investigador | fast | Especialista de solo lectura en el repo. 3+ ángulos de búsqueda en paralelo. Rutas absolutas |
| **WebResearcher** | investigador | balanced | Especialista externo de solo lectura. Evidencia > especulación. Docs oficiales primero |
| **Reviewer** | revisor | strong | Aprueba por defecto. Máx. 3 issues bloqueantes. 80% claridad = aprueba |
| **PrincipalAdvisor** | asesor | strong | Asesor senior de solo lectura. Una recomendación. Máx. 7 pasos de acción |
| **MultimodalLooker** | intérprete | balanced | Intérprete de PDF/imágenes/capturas. Requiere modelos con capacidad de visión |

### Principios de Diseño

```
Propietario Único Activo → Basado en Evidencia → Puertas de Calidad → Delegación Mínima
```

- **Propietario activo único**: Exactamente un agente mantiene el contexto principal y lleva hasta el cierre
- **Evidencia requerida**: Todas las afirmaciones necesitan verificación. Diagnósticos + build + tests deben pasar
- **Revisión con aprobación por defecto**: El revisor rechaza solo por bloqueadores reales (máx. 3 issues)
- **Especialistas de solo lectura**: Explorer, Researcher, Reviewer, Advisor y Looker no pueden modificar archivos
- **Sin fallos silenciosos**: No `as any`, `@ts-ignore`, catches vacíos, ni eliminar tests que fallan
- **Disciplina de Todo**: Tareas de 2+ pasos requieren seguimiento estructurado con un único `in_progress` a la vez
- **Precedencia de instrucciones**: Plataforma > Repositorio > Equipo > Agente > Tarea

### Flujo de Trabajo

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

### Internacionalización

Traducciones completas al **inglés** y **español**. Prompts de agentes, manifiesto del equipo y todas las secciones de documentación.

```sh
aiyou-team setup --language es    # Español
aiyou-team setup --language en    # Inglés (predeterminado)
```

---

## Grafo de Conocimiento de Código (`aiyouvector`)

Un motor nativo en Rust que indexa tu base de código en un grafo de conocimiento consultable con 17 crates especializados.

### Arquitectura

```
Capa 4 — Interfaz        cli · server (HTTP/REST) · mcp
Capa 3 — Inteligencia    graph · attention · solver · gnn
Capa 2 — Aprendizaje     profile · sona · observer · watchdog
Capa 1 — Fundación       core (HNSW + SIMD + redb) · daemon
```

### 17 Crates

| Crate | Función |
|-------|---------|
| `aiyouvector-core` | Motor vectorial: HNSW, distancia SIMD, almacenamiento redb, cuantización |
| `aiyouvector-graph` | Grafo de conocimiento: nodos/aristas tipados, BFS, exportación CSR |
| `aiyouvector-codebase` | Indexación de código: parsing tree-sitter, búsqueda, trazado, servidor MCP |
| `aiyouvector-metagraph` | Meta-grafo multi-proyecto: grafo de grafos, detección de relaciones |
| `aiyouvector-profile` | Perfil de desarrollador: patrones, grafo de preferencias, análisis temporal |
| `aiyouvector-sona` | Auto-aprendizaje: MicroLoRA (rango 2), REINFORCE, consolidación EWC++ |
| `aiyouvector-attention` | Mecanismos de atención: scaled-dot, multi-head, flash, linear |
| `aiyouvector-solver` | Solvers sublineales: Forward Push PPR, Gradiente Conjugado, Neumann |
| `aiyouvector-gnn` | Red Neuronal de Grafos con agregación de vecinos |
| `aiyouvector-embeddings` | Embedder de texto por feature-hashing (n-gram + hashing trick), <1μs/embed |
| `aiyouvector-routing` | Enrutamiento por tier de modelo con router Q-learning |
| `aiyouvector-observer` | Observador de filesystem + embedder SimHash |
| `aiyouvector-watchdog` | Contexto de sesión de agente + notificaciones de cambio de memoria |
| `aiyouvector-daemon` | Daemon global con IPC por socket Unix |
| `aiyouvector-server` | Servidor HTTP/REST (axum) |
| `aiyouvector-visual` | API HTTP de visualización de grafos |
| `aiyouvector-cli` | CLI independiente: init, search, profile, collections, daemon |

### Pipeline de Indexación

```
1. Parsing paralelo (tree-sitter, rayon)     ─── 18 lenguajes
2. Extraer símbolos → nodos del grafo        ─── 17 tipos de nodo
3. Extraer relaciones → aristas del grafo    ─── 21 tipos de arista
4. Actualizar hashes (SHA256)                ─── indexación incremental
5. Reconstruir índice FTS5 full-text         ─── búsqueda BM25 lista
```

**Lenguajes soportados**: Rust, TypeScript/TSX, JavaScript/JSX, Python, Go, Java, C, C++, C#, Ruby, PHP, Scala, Kotlin, Swift, Vue, Svelte, YAML, JSON, Markdown, HTML, CSS, Bash

### Herramientas MCP (14 herramientas de grafo)

```
index_repository              Indexar un repo (completo/moderado/rápido/multi-repo)
list_projects                 Listar todos los proyectos indexados con estadísticas
delete_project                Eliminar base de datos de un proyecto
index_status                  Conteos de nodos/aristas/archivos, etiquetas, tipos
search_graph                  Búsqueda BM25 o regex con filtro de etiquetas
search_code                   Grep aumentado por grafo con dedup a nivel de función
trace_path                    Trazado BFS de llamadas/dependencias (entrada/salida/ambos)
detect_changes                Rastrear cambios de archivos desde el último índice
query_graph                   Ejecutar consultas Cypher contra el grafo
get_graph_schema              Etiquetas de nodos y tipos de aristas
get_code_snippet              Leer código fuente para un nombre calificado
get_architecture              Clusters por detección de comunidades Leiden
manage_adr                    CRUD de Registros de Decisiones de Arquitectura
ingest_traces                 Ingestar trazas de ejecución en runtime
```

### Soporte de Consultas Cypher

```cypher
MATCH (n:Function)-[:Calls]->(m:Function)
WHERE n.name = "handleRequest"
RETURN n, m
LIMIT 10
```

Se compila a CTEs SQL recursivas con límite de profundidad de 5. Soporta `MATCH`, `WHERE`, `RETURN`, `LIMIT`.

### Modos de Búsqueda

| Modo | Método | Caso de Uso |
|------|--------|-------------|
| **BM25** | Full-text FTS5 con división camelCase | Búsqueda por nombre, palabras clave |
| **Vectorial** | Similitud coseno en embeddings de 768 dim | Búsqueda semántica |
| **Híbrido** | Reciprocal Rank Fusion (k=60) | Lo mejor de ambos mundos |
| **Regex** | Coincidencia de patrones por nombre | Consultas con comodines |

### Perfil de Desarrollador (Aprendizaje)

Ciclo de aprendizaje de tres niveles que se ejecuta localmente sin llamadas de red:

| Bucle | Frecuencia | Acción |
|-------|-----------|--------|
| **A — Instantáneo** | Por observación | Acumulación de gradientes MicroLoRA (rango 2, ~500 params) |
| **B — Cada hora** | Intervalo 3600s | Drenar buffer, procesar señales, aplicar gradientes |
| **C — Semanal** | Intervalo 604800s | Decaimiento, re-clustering K-means++, podar patrones de baja confianza |

### Detección de Comunidades

Propagación de etiquetas tipo Leiden con resolución configurable. Retorna clusters con puntuaciones de cohesión (aristas_internas / aristas_totales).

---

## Servidor MCP

84 herramientas en 24 módulos. Cualquier cliente compatible con MCP puede usarlas.

### Configuración

```jsonc
// .mcp.json
{
  "mcpServers": {
    "aiyoucli": {
      "command": "npx",
      "args": ["@aiyou-dev/cli", "mcp", "start"]
    },
    "aiyouvector": {
      "command": "aiyouvector-codebase",
      "args": ["mcp"]
    }
  }
}
```

### Categorías de Herramientas

| Módulo | Destacados |
|--------|------------|
| **Métricas** | Seguimiento de tokens, cálculo de costos, percentiles de latencia y memoria |
| **Proxy Gateway** | Chat, shield de inyección de prompts, compresión, caché, embedding y segmentación |
| **Memoria Vectorial** | Almacenamiento HNSW persistente con redb |
| **Router Semántico** | Enrutamiento híbrido de keywords y embeddings |
| **Hooks y Ciclo de Vida** | Enrutamiento Q-learning y hooks pre/post tarea |
| **Aprendizaje Neural** | Motor SONA: observar, transformar, aprender y estadísticas |
| **Análisis de Código y AST** | Diffs, commits, complejidad y AST multi-lenguaje |
| **Skills** | Sync TOON, listado y detección tecnológica |
| **Grafo (aiyouvector)** | Indexar, buscar, trazar, Cypher, arquitectura y esquema |

---

## Integración con OpenCode

aiyoucli se integra con [OpenCode](https://opencode.ai) en múltiples niveles:

### 1. Sistema de Plugins

```jsonc
// opencode.json
{
  "plugin": ["@aiyou-dev/team"],
  "mcp": {
    "aiyoucli": { "type": "stdio", "command": "npx", "args": ["@aiyou-dev/cli", "mcp", "start"] },
    "aiyouvector": { "type": "stdio", "command": "aiyouvector-codebase", "args": ["mcp"] }
  }
}
```

### 2. Equipos de Agentes como Sesiones de OpenCode

Cada rol de agente se mapea a una sesión de OpenCode con tier de modelo, temperatura, herramientas y permisos personalizados:

| Agente | Sesión OpenCode | Tier de Modelo | Visión |
|--------|-----------------|----------------|--------|
| CodingLeader | `coding-leader` | flagship | — |
| CoordinationLeader | `coordination-leader` | strong | — |
| CodingExecutor | `coding-executor` | flagship | — |
| CodebaseExplorer | `codebase-explorer` | fast | — |
| WebResearcher | `web-researcher` | balanced | — |
| Reviewer | `reviewer` | strong | — |
| PrincipalAdvisor | `principal-advisor` | strong | — |
| MultimodalLooker | `multimodal-looker` | balanced | requerida |

### 3. Hook de Statusline

Panel de control en terminal mostrando vectores, tests, estado git, modelo y contexto — solo datos que realmente existen.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                     CLI / Servidor MCP                        │
│                      (TypeScript)                             │
│   Comandos CLI · herramientas MCP · middleware de producción    │
│   Circuit breaker · Rate limiter · Retry + backoff exponencial│
├──────────────────────────────────────────────────────────────┤
│                    Puente NAPI (binario único)                │
│                    aiyoucli-napi (6.8MB)                      │
├──────────────────────────────────────────────────────────────┤
│                     Motores Rust                              │
│                                                               │
│  vector    HNSW + SIMD       │  Gateway routing + caché       │
│  sona      MicroLoRA+EWC++   │  Shield + firewall             │
│  attention 4 mecanismos      │  Compresión + segmentación     │
│  routing   Q-learning        │  Análisis AST (6 lenguajes)    │
│  graph     k-hop + BFS       │  Enrutamiento semántico        │
│  analysis  diff/commit/      │  Embedding (cliente ONNX)      │
│            complejidad       │                                 │
│  detector  45+ techs         │                                 │
│  distiller formato TOON      │                                 │
├──────────────────────────────────────────────────────────────┤
│                    aiyouvector (17 crates)                    │
│  codebase graph · profile · embeddings · solver · gnn         │
│  metagraph · observer · watchdog · daemon · server             │
└──────────────────────────────────────────────────────────────┘
```

**Diseño**: TypeScript maneja I/O, protocolo MCP y middleware de producción. Toda la computación cruza el puente NAPI hacia Rust, donde las operaciones se completan en microsegundos.

---

## Rendimiento

Benchmarks en Apple M-series. Todo en proceso, sin llamadas de red.

| Operación | Latencia | Rendimiento |
|-----------|--------:|------------:|
| Selección de tier de modelo | 0.04ms | 23.923 ops/s |
| Grafo k-hop (100 nodos) | 0.08ms | 13.158 ops/s |
| Enrutamiento de tareas | 0.11ms | 8.718 ops/s |
| Análisis de complejidad | 0.15ms | 6.631 ops/s |
| Aprendizaje neural | 0.18ms | 5.445 ops/s |
| Observación neural | 0.42ms | 2.398 ops/s |
| Inserción vectorial (3D) | 1.87ms | 534 ops/s |
| Búsqueda vectorial (100 vectores) | 3.36ms | 297 ops/s |

---

## Configuración

```sh
aiyoucli config set memory.dimensions 384
aiyoucli config set memory.backend aiyouvector
aiyoucli config set llm.base_url http://127.0.0.1:8000/v1
```

Variables de entorno:

| Variable | Ruta de Config |
|----------|---------------|
| `AIYOUCLI_MEMORY_BACKEND` | `memory.backend` |
| `AIYOUCLI_MEMORY_PATH` | `memory.storagePath` |
| `AIYOUCLI_MEMORY_DIMENSIONS` | `memory.dimensions` |
| `AIYOUCLI_MCP_PORT` | `mcp.port` |
| `AIYOUCLI_VERBOSITY` | `cli.verbosity` |
| `NO_COLOR` | `cli.color = false` |

---

## Soporte de Plataformas

| Objetivo | Binario |
|----------|---------|
| macOS ARM64 | `@aiyou-dev/cli-darwin-arm64` |
| macOS x64 | `@aiyou-dev/cli-darwin-x64` |
| Linux ARM64 | `@aiyou-dev/cli-linux-arm64-gnu` |
| Linux x64 | `@aiyou-dev/cli-linux-x64-gnu` |
| Windows x64 | `@aiyou-dev/cli-win32-x64-msvc` |

---

## Estructura de Archivos

```
.aiyoucli/
├── config.json              # Configuración del proyecto
├── memory-config.json       # Config de base de datos vectorial
├── vectors.redb             # Base de datos vectorial persistente
├── q-table.json             # Persistencia Q-Learning
├── metrics/*.json           # Snapshots de métricas
├── skills/*.dsi.toon        # Skills destiladas a formato TOON
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

Creado por [Francisco August](https://github.com/faugustdev).
