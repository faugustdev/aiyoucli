# `@aiyou-dev/models-local` — stub for graceful degradation

This directory is a **placeholder** for the future
`@aiyou-dev/models-local` package that will be extracted from aiyoucli.

## Why a stub?

When the user (2026-07-26) decided to move `src/models/` (llama.cpp +
MinIO orchestration) out of the aiyoucli repo, two goals had to be
reconciled:

1. The credentials `minioadmin/minioadmin` and the
   container reference `bgust-minio` must NOT live in the aiyoucli
   repo (security + portability).
2. The aiyoucli tool must not break when the extracted package is
   absent — the user is unlikely to install it on a clean machine.

The solution: declare `@aiyou-dev/models-local` as an
`optionalDependencies` entry in `package.json`, and use the standard
`try { require() } catch { return "not installed" }` pattern in
aiyoucli.

## What this stub contains

Three files:

- `package.json` — package metadata. **Not** named
  `@aiyou-dev/models-local` to avoid npm confusion. The aiyoucli
  `package.json` references the real (future) package name in
  `optionalDependencies`.
- `index.js` — exports the API surface that the real package will
  implement (`launchLlamaServer`, `getVramTable`, `getMinioConfig`,
  `runManager`, `listLocalModels`, `isAvailable`, `isInstalled`).
  Every function returns `{ available: false, reason: "..." }`.
- This `README.md` — explains the migration plan.

## Pattern for aiyoucli callers

```ts
// In a tool handler or service:
let modelsLocal: typeof import("@aiyou-dev/models-local") | null = null;
try {
  modelsLocal = await import("@aiyou-dev/models-local");
} catch {
  // Graceful: dependency not installed, no error.
}

if (!modelsLocal || !modelsLocal.isAvailable()) {
  return {
    ok: false,
    reason: "models-local not installed. Install with: npm install -g @aiyou-dev/models-local",
  };
}

// Use the real API:
const models = modelsLocal.listLocalModels();
```

## Migration plan (when the real package is published)

1. Create the new repo with the same API surface as this stub.
2. Publish `@aiyou-dev/models-local@0.1.0`.
3. Bump the version in `package.json` `optionalDependencies` from
   `0.0.1` (placeholder) to `0.1.0` (real).
4. Delete this `optional/models-local-stub/` directory.

## Anti-patterns (do not do these in the real package)

- Do NOT hardcode credentials.
- Do NOT reference a specific Docker container name.
- Do NOT auto-start MinIO on import — it must be opt-in.
- Do NOT depend on this stub directory for anything at runtime —
  the stub is documentation, not code.
