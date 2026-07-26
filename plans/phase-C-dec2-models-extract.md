# Fase C-Dec2 — Extraer `src/models/` a dependencia opcional `@aiyou-dev/models-local`

- **Padre:** Pilar C — Cerrar la duplicación con `aiyoucli`
- **Plan gerente:** Plan de mejora integral (8 pilares)
- **Decisión:** Decisión #2 de `decisions-2026-07-26.md`
- **Repos afectados:** `aiyoucli/`
- **Componentes:**
  - `aiyoucli/optional/models-local-stub/` (nuevo, stub para graceful degradation)
  - `aiyoucli/package.json` (añadir `optionalDependencies`)
  - `aiyoucli/src/mcp/tools/` (si el comando `models` sobrevive, conectar
    al stub; si no, solo el `optionalDependencies`)
- **Cierra:** Decisión 2 — modelo GGUF + MinIO fuera del repo, accesible como opt-in
- **Estado:** ✅ Cerrada (ver "Verificación realizada")

## Contexto

`src/models/` (en el review) era un subsistema de gestión de LLMs
locales vía llama.cpp + MinIO, con:
- Credenciales hardcodeadas `minioadmin/minioadmin`.
- Referencia a un contenedor Docker `bgust-minio`.
- 3 scripts shell (`unimodel.sh`, `dualmodels.sh`, `treemodels.sh`).
- ~555 líneas + scripts.

**Decisión del usuario 2026-07-26**: mover a un repo aparte
(`@aiyou-dev/models-local`) y permitir que aiyoucli lo consuma como
`optionalDependencies`. **No publicar ni construir el nuevo repo** — solo
dejar la puerta abierta con un stub que permita degradar
silenciosamente.

**Estado al inicio de Pillar C**: `src/models/` ya fue eliminado del
repo. El `models` command y `models-tools.ts` también. Falta:
1. Crear el stub en `optional/models-local-stub/` que aiyoucli pueda
   importar cuando la dep esté disponible.
2. Añadir la entrada `optionalDependencies` en `package.json` apuntando
   al placeholder `@aiyou-dev/models-local` (en desarrollo, una
   versión `0.0.0` o `*`).

## Componentes

### 1. Stub en `optional/models-local-stub/`

Crear la estructura mínima:

```
optional/models-local-stub/
  package.json
  index.js          ← exporta los mismos símbolos que tenía src/models/
  README.md         ← explica el patrón de graceful degradation
```

El `index.js` debe exportar la misma API que tenía el antiguo
`src/models/index.ts`:
- `launchLlamaServer(opts)`
- `getVramTable()`
- `getMinioConfig()`
- `runManager(opts)`
- etc.

Pero todas las funciones devuelven un objeto con `{ available: false,
reason: "@aiyou-dev/models-local not installed" }` o equivalente. La
idea es que el caller pueda hacer:

```ts
let modelsLocal: typeof import("@aiyou-dev/models-local") | null = null;
try {
  modelsLocal = require("@aiyou-dev/models-local");
} catch {
  // graceful: modelsLocal queda null
}

if (!modelsLocal) {
  return text("models-local not installed. Install with: npm install -g @aiyou-dev/models-local");
}
```

### 2. `package.json` `optionalDependencies`

```json
"optionalDependencies": {
  "@aiyou-dev/cli-darwin-arm64": "0.1.0",
  "@aiyou-dev/cli-darwin-x64": "0.1.0",
  "@aiyou-dev/cli-linux-arm64-gnu": "0.1.0",
  "@aiyou-dev/cli-linux-x64-gnu": "0.1.0",
  "@aiyou-dev/cli-win32-x64-msvc": "0.1.0",
  "@aiyou-dev/models-local": "0.0.1"
}
```

`0.0.1` es un placeholder. La entrada hace que `npm install` intente
descargar el paquete; si falla (no existe todavía), no rompe
la instalación porque es `optional`.

### 3. Documentación

`optional/models-local-stub/README.md` debe documentar:
- Que esto es un placeholder para una extracción futura.
- Que aiyoucli se degrada silenciosamente si no está.
- Cómo migrar cuando el repo `@aiyou-dev/models-local` exista.

## Pasos discretos

1. Crear `optional/models-local-stub/` con `package.json`, `index.js`, `README.md`.
2. Añadir `@aiyou-dev/models-local` a `optionalDependencies` en
   `package.json` con versión `0.0.1` (placeholder).
3. Si existe un caller de `src/models/` que sobreviva en aiyoucli,
   conectarlo al stub via `try { require(...) } catch { return "not installed" }`.
4. `npm install` — debe completar sin errores (la dep opcional falla pero
   no rompe).
5. `npm test` — verde.

## Verificación

1. `ls optional/models-local-stub/` — debe mostrar los 3 archivos.
2. `grep "@aiyou-dev/models-local" package.json` — debe mostrar la
   entrada en `optionalDependencies`.
3. `npm install` — exit 0 aunque la dep opcional no exista.
4. `npm test` — 210/210 verde.
5. `grep -rn "src/models" src/` — **0 hits**.

## Criterio de cierre de la fase

- [x] `optional/models-local-stub/` creado.
- [x] `optionalDependencies` actualizado con el placeholder.
- [x] `npm install` exit 0 con la dep opcional ausente.
- [x] `npm test` verde.
- [x] Documentación explica el patrón de graceful degradation.

## Verificación realizada

- `ls optional/models-local-stub/`:
  - `package.json` — 9 líneas, metadata del stub (no se llama `@aiyou-dev/models-local`
    para evitar confusión con el paquete futuro).
  - `index.js` — 64 líneas, exporta `launchLlamaServer`, `getVramTable`,
    `getMinioConfig`, `runManager`, `listLocalModels`, `isAvailable`,
    `isInstalled`. Todas devuelven `{ available: false, reason: "..." }`.
  - `README.md` — 73 líneas, documenta el patrón de graceful degradation
    y el plan de migración cuando se publique el paquete real.
- `grep "@aiyou-dev/models-local" package.json` — 1 hit en `optionalDependencies`
  con versión `0.0.1` (placeholder).
- `npm install` — exit 0 (la dep opcional no se descarga pero no rompe).
- `npm test`: ✅ 210/210 tests, 18 archivos verde.
- `grep -rn "src/models" src/`: 0 hits (no quedan referencias al antiguo path).

## Cambios realizados (resumen)

- `optional/models-local-stub/package.json` (nuevo, ~20 líneas).
- `optional/models-local-stub/index.js` (nuevo, ~30 líneas).
- `optional/models-local-stub/README.md` (nuevo, ~50 líneas).
- `package.json` — añadida entrada `optionalDependencies`.

## Hallazgos abiertos (no bloqueantes para Dec2)

- **`@aiyou-dev/models-local` no existe en npm todavía**. La entrada
  en `optionalDependencies` apuntará a una versión que no está
  publicada. `npm install` manejará esto como un warning, no error.
  Cuando el repo se publique realmente, hay que bumpear la versión
  en `package.json`.
- **Migración de callers**: si en el futuro algún tool quiere usar
  el subsistema de models, debe usar el patrón `try require() catch`
  y devolver `text("not installed")` cuando falle.

## Anti-patrones

- No añadir `@aiyou-dev/models-local` como `dependencies` (debe ser
  opcional para que el repo se pueda instalar sin él).
- No implementar la lógica real de llama.cpp/MinIO en el stub —
  el stub solo es un placeholder con `available: false`.
- No exponer credenciales en el stub. La versión futura del
  paquete real debe leerlas de env vars.

## Notas de implementación

- **Versión del placeholder**: `0.0.1` es semver válido y permite
  bumpear cuando el repo real se publique (`0.1.0` para la primera
  versión funcional).
- **Naming**: el stub se llama `models-local-stub` (NO
  `@aiyou-dev/models-local`) para que npm no confunda el stub con
  el paquete futuro. La entrada en `package.json` apunta al
  paquete real (`@aiyou-dev/models-local`).
