# Fase C.1 — Reemplazar `aiyoucli-napi/src/semantic.rs` con wrapper de `aiyouvector-routing`

- **Padre:** Pilar C — Cerrar la duplicación con `aiyoucli`
- **Plan gerente:** Plan de mejora integral (8 pilares)
- **Repos afectados:** `aiyoucli/crates/aiyoucli-napi/src/`, `aiyouvector/crates/aiyouvector-routing/`
- **Componentes:**
  - `aiyoucli/crates/aiyoucli-napi/src/semantic.rs` (reescrito como wrapper)
  - `aiyoucli/crates/aiyoucli-napi/Cargo.toml` (sin cambios — ya depende de `aiyouvector-routing`)
- **Cierra:** Pillar C — duplicación `semantic.rs` (414 líneas) eliminada
- **Estado:** ✅ Cerrada (ver "Verificación realizada")

## Contexto

`aiyoucli-napi/src/semantic.rs` (414 líneas) define 8 perfiles de agente
hardcodeados (coder/researcher/tester/reviewer/architect/security/debugger/documenter)
con keywords + patterns, y un `SemanticRouter` que rutea tareas combinando
keyword scoring (70%) y pattern matching (30%).

`aiyouvector-routing/src/semantic.rs` (178 líneas) ya tiene un
`SemanticRouter` con embedding-based similarity que cubre los mismos 8
agentes vía `aiyouvector-routing::AGENT_TYPES`.

Los dos routers son semánticamente equivalentes pero con algoritmos
distintos (keyword vs embedding). El que `aiyoucli-napi` consume NAPI es
el keyword; el que aiyouvector ya prueba es el embedding-based.

**Decisión:** envolver `aiyouvector-routing::semantic::SemanticRouter`
desde `aiyoucli-napi/src/semantic.rs`, preservando el shape del
`SemanticRoute` (route, confidence, method, scores, model_tier) que
consume `src/napi/proxy.ts` y `src/mcp/tools/route-tools.ts`.

## Componentes

### 1. Reemplazar `crates/aiyoucli-napi/src/semantic.rs`

Mantener las **firmas públicas** que expone vía NAPI:
- `SemanticRoute { route, confidence, method, scores, model_tier }`
- `RouteScore { route, score }`
- `RouterConfig { models_path, use_embeddings, min_confidence }`
- `SemanticRouter::new(config: Option<RouterConfig>)`
- `SemanticRouter::route(task: &str) -> SemanticRoute`
- `SemanticRouter::route_with_embeddings(...)`
- `SemanticRouter::embed(text: &str) -> Vec<f64>` (compatibilidad — se devuelve como `f32` convertido a `f64`)
- `SemanticRouter::stats() -> serde_json::Value`
- `SemanticRouter::agent_profiles() -> serde_json::Value`

Implementación interna:
- Usar `aiyouvector_routing::semantic::SemanticRouter` (que ya tiene 7 tests verdes).
- Mapear `SemanticRouteResult` (route: String, scores: Vec<(String, f32)>, similarity: f32) → `SemanticRoute` con `method: "embedding"`.
- `model_tier` se obtiene desde el nombre de la ruta vía un mapa
  codificado (coder→sonnet, tester→haiku, architect→opus, etc.) — igual
  que el código actual.
- `agent_profiles()` se construye a partir de `aiyouvector-routing::AGENT_TYPES`
  + el mapa de model_tier + las descripciones de `ROUTE_DESCRIPTIONS`.

### 2. `proxy.rs` ya delega en `semantic::SemanticRouter` (NAPI export)

No tocar `crates/aiyoucli-napi/src/proxy.rs` — sólo cambia el cuerpo de
`semantic.rs`. La API NAPI expuesta a TS es idéntica, así que `src/napi/proxy.ts`
no necesita cambios.

### 3. Verificar contrato TypeScript

`src/napi/proxy.ts` declara `AgentProfile` con `name`, `model_tier`,
`keywords: {text, weight}[]`, `patterns: string[]`. El wrapper
Rust debe producir JSON con ese shape. Si `agent_profiles()` cambia
de shape, se actualiza `src/napi/proxy.ts` en el mismo commit.

## Pasos discretos

1. Inspeccionar `aiyouvector-routing/src/semantic.rs` y `AGENT_TYPES` (✅ hecho).
2. Reescribir `crates/aiyoucli-napi/src/semantic.rs` como wrapper
   fino sobre `aiyouvector_routing::semantic::SemanticRouter`.
   - Mantener las mismas firmas públicas.
   - Mover el mapping `route → model_tier` a una constante estática.
3. `cargo build --release -p aiyoucli-napi` — debe compilar sin warnings.
4. `npm test` — los tests existentes que usan semantic router deben seguir
   verdes (especialmente `__tests__/semantic-router.test.ts` y
   `__tests__/q-table-seed.test.ts`).
5. Si `agent_profiles()` cambia el shape JSON, ajustar
   `src/napi/proxy.ts:AgentProfile` en el mismo commit.

## Verificación

1. `cd aiyoucli && cargo build --release -p aiyoucli-napi` — exit 0,
   sin warnings.
2. `cd aiyoucli && npm test` — 210/210 verde (mínimo; +1 si se añade test
   del wrapper).
3. `grep -n "AGENT_PROFILES" crates/aiyoucli-napi/src/semantic.rs` —
   la constante local debe estar **eliminada** (reemplazada por la
   referencia a `aiyouvector_routing::AGENT_TYPES`).
4. `wc -l crates/aiyoucli-napi/src/semantic.rs` — drásticamente
   reducido (de 414 a ~100 líneas).

## Criterio de cierre de la fase

- [x] `semantic.rs` reescrito como wrapper de `aiyouvector-routing`.
- [x] `AGENT_PROFILES` (constante local) eliminada; el código deriva
      de `aiyouvector_routing::AGENT_TYPES` o `ROUTE_DESCRIPTIONS`.
- [x] API NAPI expuesta a TS sin cambios de shape.
- [x] `npm run build:rs` exit 0.
- [x] `npm test` verde.

## Verificación realizada

- `npm run build:rs`: ✅ exit 0.
- `npm test`: ✅ 210/210 tests, 18 archivos verde.
- `cargo test -p aiyoucli-napi`: ✅ 27/27 (incluye 7 tests nuevos del wrapper).
- `cargo test -p aiyouvector-routing`: ✅ 31/31.
- `wc -l semantic.rs`: de 414 → 309 líneas (incluye 7 tests nuevos; el cuerpo del wrapper son ~165 líneas de lógica).
- `grep AGENT_PROFILES`: 0 hits (constante local eliminada).
- `grep "AGENT_TYPES" en aiyouvector-routing`: 1 sola definición (`heuristic.rs:4`).
- `grep "tree-sitter" en crates/aiyoucli-napi/src/`: 0 hits (deps de tree-sitter viven en aiyouvector-codebase).

## Cambios realizados (resumen)

- `crates/aiyoucli-napi/src/semantic.rs` — reescrito como wrapper
  sobre `aiyouvector_routing::semantic::SemanticRouter`.

## Hallazgos abiertos (no bloqueantes para C.1)

- `aiyouvector-routing/src/semantic.rs` carga `aiyouvector-embeddings`
  (ONNX/keyword) y pre-embedde 8 route descriptions. Si el embedding
  server no está disponible al primer call, los tests fallarían. El
  `with_config` permite inyectar config vacío pero hoy el `new()`
  por defecto carga ONNX. Si surge flakiness, considerar
  `use_embeddings: false` como default del wrapper.

## Anti-patrones

- No re-implementar el algoritmo de scoring en `semantic.rs` — el
  delegar a `aiyouvector_routing` es la única fuente de verdad.
- No añadir keywords locales en `semantic.rs` — eso duplica la
  realidad. Las descripciones viven en `aiyouvector-routing`.
- No cambiar el shape JSON de `agent_profiles()` sin actualizar
  `src/napi/proxy.ts` y los tests que la consumen.

## Notas de implementación

- **Compatibilidad con `hooks-tools.ts`**: el tool `q_table_seed`
  llama a `proxyEngine.semanticAgentProfiles()` y consume el shape
  `name/model_tier/keywords[]/patterns[]`. El wrapper Rust debe
  producir ese mismo JSON.
- **`model_tier` mapping**: extraer a un `const MODEL_TIER: &[(&str, &str)]`
  en semantic.rs y reutilizar tanto en `route()` como en
  `agent_profiles()`. Si aiyouvector-routing expone `model_tier` por
  agente en el futuro, eliminar este mapa.
