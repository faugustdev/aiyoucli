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
 * Matrix tolerance: the build matrix cross-compile targets (darwin-x64,
 * linux-arm64) sometimes fail on openssl-sys. We tolerate a partial matrix
 * publishing — for each platform that has artifacts, we copy and prepare
 * for publish. We only fail if zero artifacts were found, which means the
 * wait timing for artifact upload is broken.
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
  console.warn(
    `\nPartial matrix: ${missing.length} platform(s) missing — ` +
      `(${missing.join(", ")}). These will be skipped by the publish step.`,
  );
}

console.log(`\nReady to publish: ${copied} platform binaries.`);
