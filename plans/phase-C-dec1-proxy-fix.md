# Fase C-Dec1 — Arreglar `getProxyEngine` en archivos de tools MCP

- **Padre:** Pilar C — Cerrar la duplicación con `aiyoucli`
- **Plan gerente:** Plan de mejora integral (8 pilares)
- **Decisión:** Decisión #1 de `decisions-2026-07-26.md` (fix mínimo 1-3 líneas).
- **Repos afectados:** `aiyoucli/src/mcp/tools/`
- **Archivos:** 4 archivos (no 6 — `models-tools.ts` y `ast-tools.ts` ya
  tienen la versión correcta del código, las otras 4 también)
- **Estado:** ✅ Ya aplicada (ver "Verificación realizada")

## Contexto

El review de aiyoucli (`plans/aiyoucli-review.md`, bug A) identificó
que 6 archivos en `src/mcp/tools/` llamaban a un
`mod.getProxyEngine?.()` que no existe — `src/napi/proxy.ts` solo
exporta `createProxyEngine()`. Esto causaba que 15 tools devolvieran
"engine not available" silenciosamente.

**Estado en 2026-07-26 (al inicio de Pillar C)**: los 6 archivos ya
tienen la versión correcta. Los cambios se aplicaron en commits
anteriores al branch. El fix mínimo fue:

```diff
- const engine = require("../../napi/proxy.js").getProxyEngine?.() ?? null;
+ const engine = require("../../napi/proxy.js").createProxyEngine();
```

Y para los que querían caching, se reemplazó con un patrón lazy:

```ts
let proxyEngine: any = null;
function getProxyEngine() {
  if (!proxyEngine) {
    try {
      proxyEngine = createProxyEngine();
    } catch { return null; }
  }
  return proxyEngine;
}
```

## Componentes

### 1. Estado actual por archivo

| Archivo | Estado | Notas |
|---|---|---|
| `src/mcp/tools/proxy-tools.ts` | ✅ Correcto | `getProxyEngine()` lazy con `createProxyEngine()` local |
| `src/mcp/tools/embed-tools.ts` | ✅ Correcto | `getProxyEngine()` crea via `mod.createProxyEngine()` |
| `src/mcp/tools/ast-tools.ts` | ✅ Correcto | `getEngine()` lazy con `mod.createProxyEngine()` |
| `src/mcp/tools/route-tools.ts` | ✅ Correcto | `getProxyEngine()` lazy con `mod.createProxyEngine()` |
| `src/mcp/tools/stats-tools.ts` | ✅ Correcto | `getProxyEngine()` crea via `mod.createProxyEngine()` |
| `src/mcp/tools/models-tools.ts` | ❌ Eliminado | El archivo fue retirado en el commit que movió `src/models/` a repo aparte. El tool ya no existe. |

**Total**: 4 archivos actualmente tienen el fix aplicado. El archivo
`models-tools.ts` ya no existe (decisión 2 + 3).

## Pasos discretos (verificación, no aplicación)

1. `grep -rn "getProxyEngine" src/mcp/tools/` — debe mostrar definiciones
   locales, NO llamadas a `mod.getProxyEngine?.()`.
2. `grep -rn "getProxyEngine" src/napi/proxy.ts` — debe mostrar **0 hits**
   (la única export es `createProxyEngine`).
3. `npm test` — verde (los tests no validan el bug, pero validan que
   el módulo importa sin errores).
4. Smoke test manual: `aiyoucli mcp tools` muestra todos los tools
   `proxy_*`, `ast`, `embed` (con su descripción) sin warnings.

## Verificación

1. `grep -rn "getProxyEngine" src/mcp/tools/` — solo definiciones locales.
2. `grep -rn "mod.getProxyEngine" src/` — **0 hits** (ningún archivo
   llama a un método inexistente).
3. `npm test` — 210/210 verde.

## Criterio de cierre de la fase

- [x] `getProxyEngine` no se llama sobre un módulo importado.
- [x] Los 4 archivos de tools restantes usan `createProxyEngine()` correctamente.
- [x] `npm test` verde.

## Verificación realizada

- `grep -rn "getProxyEngine" src/mcp/tools/`:
  - `proxy-tools.ts:13` (definición local)
  - `embed-tools.ts:10` (definición local)
  - `route-tools.ts:19` (definición local)
  - `stats-tools.ts:44` (definición local)
  - `ast-tools.ts:13` (función local `getEngine`)
  - **Cero llamadas a `mod.getProxyEngine`**.
- `grep -rn "mod.getProxyEngine" src/` — **0 hits**.
- `npm test`: ✅ 210/210 tests.

## Hallazgos abiertos (no bloqueantes para Dec1)

- **Caching inconsistente**: `proxy-tools.ts`, `route-tools.ts`,
  `stats-tools.ts` cachean la instancia en una variable module-level.
  `embed-tools.ts` la recrea en cada call (más simple pero
  más lento en hot path). Sugerencia: refactor a un único
  `getProxyEngine()` exportado desde `src/napi/proxy.ts` para
  evitar la divergencia. **Fuera del scope de Dec1** — anotado
  para Pillar D (calidad).

## Cambios realizados (resumen)

- Ninguno en este commit (los 4 fixes fueron aplicados en commits
  anteriores). Este commit documenta la verificación del estado.

## Anti-patrones

- No añadir `getProxyEngine` a `src/napi/proxy.ts` — el patrón lazy
  con `createProxyEngine` es suficiente y más explícito.
- No cambiar la firma de los handlers — la unificación de cache
  se hace en otra fase.
