/**
 * Placeholder stub for `@aiyou-dev/models-local`.
 *
 * This file lives inside the aiyoucli repo at `optional/models-local-stub/`
 * so that anyone reading the code can see what the future extracted
 * package's API surface is. The real package is not yet published to
 * npm — this stub does nothing useful at runtime.
 *
 * Usage pattern from aiyoucli:
 *
 *   let modelsLocal = null;
 *   try {
 *     modelsLocal = await import("@aiyou-dev/models-local");
 *   } catch {
 *     // modelsLocal is null — caller degrades gracefully.
 *   }
 *   if (!modelsLocal) {
 *     return { ok: false, reason: "@aiyou-dev/models-local not installed" };
 *   }
 *
 * The real package (when published) should export:
 *   - launchLlamaServer(opts)  → spawns `llama-server` (NOT in this stub).
 *   - getVramTable()           → returns VRAM table for known GGUF models.
 *   - getMinioConfig()         → reads MinIO config from env (NO hardcoded creds).
 *   - runManager(opts)         → orchestrates uni/dual/tree-model.
 *   - listLocalModels()        → returns the local GGUF model catalog.
 *
 * When the real package is published:
 *   1. Publish `@aiyou-dev/models-local@0.1.0` (or whatever version).
 *   2. Bump the version in aiyoucli's `package.json` `optionalDependencies`.
 *   3. Remove this stub directory.
 *
 * Anti-patterns (do NOT do in the real package):
 *   - Do NOT hardcode credentials (`minioadmin/minioadmin`).
 *   - Do NOT reference a specific Docker container name.
 *   - Do NOT auto-start MinIO on import — it must be opt-in.
 */

const STUB_VERSION = "0.0.1-stub";

function notInstalled(name) {
  return {
    available: false,
    version: STUB_VERSION,
    reason: `@aiyou-dev/models-local is not installed. Install with: npm install -g @aiyou-dev/models-local`,
    function: name,
  };
}

export const version = STUB_VERSION;

export function launchLlamaServer(_opts) {
  return Promise.resolve(notInstalled("launchLlamaServer"));
}

export function getVramTable() {
  return notInstalled("getVramTable");
}

export function getMinioConfig() {
  return notInstalled("getMinioConfig");
}

export function runManager(_opts) {
  return Promise.resolve(notInstalled("runManager"));
}

export function listLocalModels() {
  return notInstalled("listLocalModels");
}

export const isAvailable = () => false;
export const isInstalled = () => false;
