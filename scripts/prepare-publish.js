#!/usr/bin/env node
/**
 * prepare-publish.js — Moves CI-built .node artifacts into platform packages.
 *
 * Expected layout after `actions/download-artifact`:
 *   artifacts/bindings-darwin-arm64/aiyoucli-napi.darwin-arm64.node
 *   artifacts/bindings-darwin-x64/aiyoucli-napi.darwin-x64.node
 *   ...
 *
 * Copies each .node file into the matching npm/{platform}/ directory.
 */

import { readdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ARTIFACTS_DIR = "artifacts";

const PLATFORM_MAP = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64-gnu": "linux-x64-gnu",
  "linux-arm64-gnu": "linux-arm64-gnu",
  "win32-x64-msvc": "win32-x64-msvc",
};

let copied = 0;

for (const [artifactSuffix, npmDir] of Object.entries(PLATFORM_MAP)) {
  const artifactDir = join(ARTIFACTS_DIR, `bindings-${artifactSuffix}`);
  const targetDir = join("npm", npmDir);

  if (!existsSync(artifactDir)) {
    console.warn(`⚠ Missing artifact: ${artifactDir}`);
    continue;
  }

  const nodeFiles = readdirSync(artifactDir).filter((f) => f.endsWith(".node"));
  for (const file of nodeFiles) {
    const src = join(artifactDir, file);
    const dest = join(targetDir, file);
    copyFileSync(src, dest);
    console.log(`✔ ${src} → ${dest}`);
    copied++;
  }
}

if (copied === 0) {
  console.error("✖ No .node artifacts found. Did the build step succeed?");
  process.exit(1);
}

console.log(`\nReady to publish: ${copied} platform binaries.`);
