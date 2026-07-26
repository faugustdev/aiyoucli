# Fase C-Dec8 — Corregir rutas de `validateInstallation()` y `parseTeamsFromSetupOutput()`

- **Padre:** Pilar C — Cerrar la duplicación con `aiyoucli`
- **Plan gerente:** Plan de mejora integral (8 pilares)
- **Decisión:** Decisión #8 de `decisions-2026-07-26.md`
- **Repos afectados:** `aiyoucli/src/init/team-setup.ts`
- **Funciones afectadas:**
  - `validateInstallation()` (líneas 326-354)
  - `parseTeamsFromSetupOutput()` (líneas 301-316)
- **Estado:** ✅ Cerrada (ver "Verificación realizada")

## Contexto

`team-setup.ts` tenía 2 errores en la detección de artifacts del
aiyou-team setup:

1. **`validateInstallation()` líneas 338-345**: usaba rutas incorrectas
   que no correspondían al layout real del aiyou-team:
   - `${HOME}/.config/opencode/agent-teams` (debería ser
     `~/.config/opencode/teams/`)
   - `${HOME}/.config/opencode/aiyou-team.json` (no es la convención)
   - `${HOME}/.aiyou-team/teams` (debería ser
     `<worktree>/.aiyou-team/` por proyecto, no `~/.aiyou-team/`)
   - `${HOME}/Library/Application Support/opencode/agent-teams` (macOS,
     pero `agent-teams` no es el nombre correcto)

2. **`parseTeamsFromSetupOutput()` líneas 301-316**: buscaba los
   patrones `coding-team`, `general-team`, `wukong-team`, cuando la
   realidad es que **solo existe `coding-team`** (los otros dos
   equipos no se distribuyen en aiyou-team v0.1.x).

**Layout real del aiyou-team v0.1.x** (verificado):
- `~/.config/opencode/teams/<team-name>/agents/` — directorio de teams.
- `<worktree>/.aiyou-team/` — directorio por worktree (no en `$HOME`).
- Solo `coding-team` se distribuye; `general-team` y `wukong-team` son
  placeholders no implementados.

## Componentes

### 1. Reescribir `parseTeamsFromSetupOutput()` (líneas 301-316)

```ts
function parseTeamsFromSetupOutput(output: string): string[] {
  const teams: string[] = [];

  // Solo `coding-team` se distribuye en aiyou-team v0.1.x.
  // Si el output lo menciona, está configurado.
  if (/coding-team/.test(output)) {
    teams.push("coding-team");
  }

  // Si el output dice "completed" pero no menciona explícitamente un
  // team, asumimos coding-team (es el único que viene por defecto).
  if (teams.length === 0 && output.includes("completed")) {
    teams.push("coding-team");
  }

  return teams;
}
```

### 2. Reescribir `validateInstallation()` (líneas 326-354)

```ts
function validateInstallation(): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Binary in PATH
  const detection = detectAiyouTeamCli();
  if (!detection.found) {
    reasons.push("`aiyou-team` binary not found in PATH after install");
  } else if (!detection.version) {
    reasons.push("`aiyou-team` binary found but `version` command failed");
  }

  // 2. Setup artifacts on disk
  // Layout real del aiyou-team v0.1.x:
  //   - Global: ~/.config/opencode/teams/<team>/agents/
  //   - Per-worktree: <cwd>/.aiyou-team/
  const artifactPaths = [
    `${process.env.HOME}/.config/opencode/teams`,
    `${process.cwd()}/.aiyou-team`,
  ];
  const artifactFound = artifactPaths.some((p) => existsSync(p));
  if (!artifactFound) {
    reasons.push(
      "OpenCode team artifacts not found in any known location (ran setup but nothing was written)"
    );
  }

  return { ok: reasons.length === 0, reasons };
}
```

## Pasos discretos

1. Editar `src/init/team-setup.ts` para corregir
   `parseTeamsFromSetupOutput()`.
2. Editar `src/init/team-setup.ts` para corregir
   `validateInstallation()`.
3. `npm test` — verde.
4. Verificar con `grep` que las rutas y patrones son los correctos.

## Verificación

1. `grep "agent-teams\|aiyou-team.json" src/init/team-setup.ts` —
   **0 hits** (rutas eliminadas).
2. `grep "general-team\|wukong-team" src/init/team-setup.ts` —
   **0 hits** (teams inexistentes eliminados).
3. `grep "coding-team" src/init/team-setup.ts` — debe aparecer
   (es el único team real).
4. `npm test` — 210/210 verde. `__tests__/team-setup.test.ts` 4/4 verde.

## Criterio de cierre de la fase

- [x] `parseTeamsFromSetupOutput()` solo busca `coding-team`.
- [x] `validateInstallation()` usa las rutas correctas:
      `~/.config/opencode/teams/` y `<cwd>/.aiyou-team/`.
- [x] `npm test` verde.

## Verificación realizada

- `grep "agent-teams\|aiyou-team.json" src/init/team-setup.ts` — 0 hits.
- `grep "general-team\|wukong-team" src/init/team-setup.ts` — 0 hits.
- `grep "coding-team" src/init/team-setup.ts` — 2 hits (en el patrón
  regex y en el fallback "completed → coding-team").
- `npm test`: ✅ 210/210 tests, `__tests__/team-setup.test.ts` 4/4 verde.

## Cambios realizados (resumen)

- `src/init/team-setup.ts::parseTeamsFromSetupOutput()` — solo
  busca `coding-team`.
- `src/init/team-setup.ts::validateInstallation()` — artefactos en
  `~/.config/opencode/teams/` y `<cwd>/.aiyou-team/`.

## Hallazgos abiertos (no bloqueantes para Dec8)

- **`<cwd>` en `validateInstallation`**: la función es llamada
  desde `setupAiyouTeam()` que no recibe `cwd`. El `process.cwd()`
  puede no ser el cwd del usuario si `aiyoucli init` se ejecuta
  desde otro path. **Mejora futura**: pasar `cwd` como parámetro.
  **No bloqueante** porque la verificación del global
  (`~/.config/opencode/teams/`) sigue siendo válida.

## Anti-patrones

- No añadir más teams hipotéticos (`general-team`, `wukong-team`)
  al parser — solo añadir cuando estén realmente distribuidos.
- No hardcodear la versión de aiyou-team en las rutas — si en
  v0.2.x cambia el layout, este código quedará stale.
- No usar `process.env.HOME` en Windows — el código actual
  asume POSIX. Si en el futuro se quiere soporte Windows,
  cambiar a `homedir()` de `node:os`.

## Notas de implementación

- **Idempotencia**: el test `__tests__/team-setup.test.ts` valida
  que `dryRun` no reporta failure y que el contrato del
  `TeamSetupResult` se mantiene. El cambio en
  `parseTeamsFromSetupOutput()` no rompe estos tests.
- **Tests adicionales futuros**: añadir un test unitario
  para `parseTeamsFromSetupOutput()` con outputs conocidos
  (con "coding-team", sin él, con "completed" genérico).
