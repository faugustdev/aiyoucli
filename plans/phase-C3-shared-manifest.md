# Fase C.3 — Unificar manifiestos de roles (OpenCode plugin + aiyoucli)

- **Padre:** Pilar C — Cerrar la duplicación con `aiyoucli`
- **Plan gerente:** Plan de mejora integral (8 pilares)
- **Repos afectados:** `aiyoucli/crates/aiyoucli-napi/`, `aiyouvector/crates/aiyouvector-routing/`
- **Componentes:**
  - `aiyouvector-routing/src/heuristic.rs` (`AGENT_TYPES` es la fuente)
  - `aiyoucli-napi/src/semantic.rs` (referencia a `AGENT_TYPES`)
  - `src/napi/proxy.ts` (`AgentProfile` — tipo TS)
- **Cierra:** Pillar C — `grep -r "AGENT_TYPES"` muestra una sola definición
- **Estado:** ✅ Cerrada (ver "Verificación realizada")

## Contexto

Hoy coexisten 3 fuentes de verdad para "qué agentes conoce el sistema":

1. `aiyouvector-routing/src/heuristic.rs::AGENT_TYPES` — 8 nombres
   (`coder`, `researcher`, `tester`, `reviewer`, `architect`,
   `security`, `debugger`, `documenter`).
2. `aiyouvector-routing/src/semantic.rs::ROUTE_DESCRIPTIONS` — 8 tuplas
   (nombre, descripción textual) para embedding.
3. `aiyoucli-napi/src/semantic.rs::AGENT_PROFILES` — 8 perfiles
   hardcodeados con keywords, patterns, model_tier. **Eliminado en
   C.1** (ahora se referencia `aiyouvector-routing::AGENT_TYPES`).

El aiyou-team tiene 8 agentes distintos (codebase-explorer, coding-executor,
coding-leader, coordination-leader, multimodal-looker, principal-advisor,
reviewer, web-researcher) — son los agentes que aparecen en `~/.config/opencode/teams/`
y son los que ejecuta OpenCode. Esos **no se unifican** (son ortogonales:
el `semantic router` decide *qué tipo de trabajo* hacer; el aiyou-team
*qué agente concreto* lo hace).

**Decisión:** el `semantic router` tiene 8 roles derivados de
`aiyouvector-routing::AGENT_TYPES`. La propiedad `model_tier` se
mantiene como un mapping constante en `aiyouvector-routing::heuristic.rs`
junto a `AGENT_TYPES`. `aiyoucli-napi` lo consume y lo expone.

## Componentes

### 1. Mover `model_tier` a `aiyouvector-routing::heuristic`

`heuristic.rs` ya exporta `AGENT_TYPES`. Añadir:

```rust
pub const AGENT_MODEL_TIER: &[(&str, &str)] = &[
    ("coder", "sonnet"),
    ("researcher", "sonnet"),
    ("tester", "haiku"),
    ("reviewer", "sonnet"),
    ("architect", "opus"),
    ("security", "sonnet"),
    ("debugger", "sonnet"),
    ("documenter", "haiku"),
];

pub fn model_tier_for(agent: &str) -> &'static str {
    AGENT_MODEL_TIER
        .iter()
        .find(|(name, _)| *name == agent)
        .map(|(_, tier)| *tier)
        .unwrap_or("sonnet")
}
```

`semantic.rs` re-exporta `AGENT_TYPES` y `model_tier_for` desde
`aiyouvector-routing::lib.rs`.

### 2. Consumir en `aiyoucli-napi/src/semantic.rs`

El wrapper (reescrito en C.1) importa:

```rust
use aiyouvector_routing::{AGENT_TYPES, model_tier_for};
```

Y elimina la constante local `AGENT_PROFILES` y el mapping local
`route → model_tier`.

### 3. Verificar consumo TS

`src/napi/proxy.ts:AgentProfile` (línea 140-145) tiene la shape
`{name, model_tier, keywords: {text, weight}[], patterns}`. El
wrapper Rust produce ese JSON. Sin cambios en TS.

## Pasos discretos

1. Editar `aiyouvector/crates/aiyouvector-routing/src/heuristic.rs`
   para añadir `AGENT_MODEL_TIER` y `model_tier_for()`.
2. Re-exportar desde `aiyouvector-routing/src/lib.rs`.
3. Consumir desde `aiyoucli/crates/aiyoucli-napi/src/semantic.rs`
   (reescrito en C.1).
4. `cargo build --release -p aiyoucli-napi` — exit 0.
5. `npm test` — verde.

## Verificación

1. `cd aiyoucli && cargo build --release -p aiyoucli-napi` — exit 0.
2. `cd aiyoucli && npm test` — 210/210 verde.
3. `grep -rn "AGENT_PROFILES" /Users/august/Dev/personal/aiyou-dev_v1/aiyoucli/`
   — **0 hits** (la constante local fue eliminada en C.1).
4. `grep -rn "AGENT_TYPES" /Users/august/Dev/personal/aiyou-dev_v1/`
   — **1 sola definición** (en `aiyouvector-routing/src/heuristic.rs`).

## Criterio de cierre de la fase

- [x] `AGENT_MODEL_TIER` y `model_tier_for()` exportados desde
      `aiyouvector-routing`.
- [x] `aiyoucli-napi/src/semantic.rs` consume esos exports.
- [x] `AGENT_PROFILES` (constante local) eliminada.
- [x] `npm run build:rs` exit 0.
- [x] `npm test` verde.

## Verificación realizada

- `grep -rn "AGENT_PROFILES" /Users/august/Dev/personal/aiyou-dev_v1/aiyoucli/` y
  `/Users/august/Dev/personal/aiyou-dev_v1/aiyouvector/` — 0 hits (constante local
  eliminada en C-1; nadie la recrea).
- `grep -rn "AGENT_TYPES"` — 1 sola definición en
  `/Users/august/Dev/personal/aiyou-dev_v1/aiyouvector/crates/aiyouvector-routing/src/heuristic.rs:4`.
  Consumida por `semantic.rs`, `q_router.rs` y re-exportada via `lib.rs`.
- `npm run build:rs`: ✅ exit 0.
- `npm test`: ✅ 210/210 tests, 18 archivos verde.
- `cargo test -p aiyouvector-routing`: ✅ 31/31 (incluye 3 tests nuevos para
  `model_tier_for` y la cobertura completa de `AGENT_TYPES`).

## Cambios realizados (resumen)

- `aiyouvector/crates/aiyouvector-routing/src/heuristic.rs` — añadidos
  `AGENT_MODEL_TIER` y `model_tier_for()`.
- `aiyouvector/crates/aiyouvector-routing/src/lib.rs` — re-exports.
- `aiyoucli/crates/aiyoucli-napi/src/semantic.rs` — consume los exports
  (C.1 ya eliminó la constante local).

## Anti-patrones

- No duplicar `AGENT_TYPES` ni `AGENT_MODEL_TIER` en `aiyoucli-napi`.
- No cambiar el shape de `AgentProfile` (TS) sin migración.
- No mover el `model_tier` mapping a TypeScript — la fuente de
  verdad debe quedar en Rust, en `aiyouvector-routing`.

## Notas de implementación

- **Carga en runtime**: las constantes `AGENT_MODEL_TIER` se embeben
  en el binario NAPI en compile-time. No hay I/O.
- **Extensibilidad**: si en el futuro se quiere añadir un agente
  ("monitor", "designer"), solo se edita `AGENT_MODEL_TIER` y
  opcionalmente `ROUTE_DESCRIPTIONS`. No hay que tocar aiyoucli-napi.
