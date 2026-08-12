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
 *
 * All five platforms are required. This script used to tolerate a partial
 * matrix — the cross-compile targets failed on openssl-sys, and publishing
 * "whatever we have" shipped @aiyou-dev/cli@1.3.1 referencing two platform
 * packages that were never published, leaving Intel macOS and ARM Linux
 * users with no native binary. The openssl-sys dependency is gone; a missing
 * artifact now means something is genuinely wrong, so fail loudly.
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
const missing = [];

for (const [artifactSuffix, npmDir] of Object.entries(PLATFORM_MAP)) {
  const artifactDir = join(ARTIFACTS_DIR, `bindings-${artifactSuffix}`);
  const targetDir = join("npm", npmDir);

  if (!existsSync(artifactDir)) {
    missing.push(artifactSuffix);
    console.warn(`⚠ Missing artifact: ${artifactDir}`);
    continue;
  }

  const nodeFiles = readdirSync(artifactDir).filter((f) => f.endsWith(".node"));
  if (nodeFiles.length === 0) {
    missing.push(artifactSuffix);
    console.warn(`⚠ No .node files under: ${artifactDir}`);
    continue;
  }

  for (const file of nodeFiles) {
    const src = join(artifactDir, file);
    const dest = join(targetDir, file);
    copyFileSync(src, dest);
    console.log(`✔ ${src} → ${dest}`);
    copied++;
  }
}

if (copied === 0) {
  console.error(
    "✖ No .node artifacts found. Did the build step succeed? " +
      "If publishing from CI, check that the publish job waited for the " +
      "build matrix to finish uploading artifacts.",
  );
  process.exit(1);
}

if (missing.length > 0) {
  console.error(
    `\n✖ Incomplete matrix: ${missing.length} platform(s) missing ` +
      `(${missing.join(", ")}).\n` +
      "  Publishing now would ship a root package pointing at platform " +
      "packages that do not exist. Refusing to continue.",
  );
  process.exit(1);
}

console.log(`\nReady to publish: ${copied} platform binaries (all 5 present).`);
