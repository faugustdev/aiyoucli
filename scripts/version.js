#!/usr/bin/env node
/**
 * version.js — Sync version across all packages and Cargo.toml.
 *
 * Usage: node scripts/version.js 0.2.0
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/version.js <version>");
  process.exit(1);
}

function updateJson(path, version) {
  const pkg = JSON.parse(readFileSync(path, "utf-8"));
  pkg.version = version;

  // Also update optionalDependencies if they point to our platform packages
  if (pkg.optionalDependencies) {
    for (const key of Object.keys(pkg.optionalDependencies)) {
      if (key.startsWith("@aiyou-dev/cli-")) {
        pkg.optionalDependencies[key] = version;
      }
    }
  }

  // Update dependency on @aiyou-dev/cli in wrapper
  if (pkg.dependencies?.["@aiyou-dev/cli"]) {
    pkg.dependencies["@aiyou-dev/cli"] = `^${version}`;
  }

  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`✔ ${path} → ${version}`);
}

// Root package.json
updateJson("package.json", version);

// Platform packages
const npmDir = "npm";
for (const dir of readdirSync(npmDir)) {
  const pkgPath = join(npmDir, dir, "package.json");
  try {
    updateJson(pkgPath, version);
  } catch {
    // skip non-package dirs
  }
}

// Wrapper package
updateJson("packages/aiyoucli/package.json", version);

// Cargo.toml workspace version
const cargoPath = "Cargo.toml";
let cargo = readFileSync(cargoPath, "utf-8");
cargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);
console.log(`✔ ${cargoPath} → ${version}`);

console.log(`\nAll packages updated to v${version}`);
