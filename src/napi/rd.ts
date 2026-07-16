/**
 * NAPI binary loader for aiyoucli-rd Rust crate.
 *
 * Loads the platform-specific .node binary and re-exports
 * the Deep Research NAPI functions.
 */

import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface RdNapiBindings {
  rdGetStrategies(): string[];
  rdCreateSession(query: string, strategy?: string): string;
  rdSearchWeb(query: string, engine?: string): string;
  rdProcessDocument(path: string): string;
}

function loadRdBindings(): RdNapiBindings {
  const candidates = [
    join(__dirname, "..", "..", "aiyoucli-rd.darwin-arm64.node"),
    join(__dirname, "..", "..", "aiyoucli-rd.darwin-x64.node"),
    join(__dirname, "..", "..", "aiyoucli-rd.linux-x64-gnu.node"),
    join(__dirname, "..", "..", "aiyoucli-rd.node"),
    join(__dirname, "..", "..", "crates", "aiyoucli-rd", "aiyoucli-rd.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return require(candidate) as RdNapiBindings;
    }
  }

  throw new Error(
    "Failed to load aiyoucli-rd native binding. " +
      "Run `cargo build -p aiyoucli-rd`."
  );
}

let _bindings: RdNapiBindings | null = null;

function getRdBindings(): RdNapiBindings {
  if (!_bindings) {
    _bindings = loadRdBindings();
  }
  return _bindings;
}

export function rdGetStrategies(): string[] {
  return getRdBindings().rdGetStrategies();
}

export function rdCreateSession(query: string, strategy?: string): string {
  return getRdBindings().rdCreateSession(query, strategy);
}

export function rdSearchWeb(query: string, engine?: string): string {
  return getRdBindings().rdSearchWeb(query, engine);
}

export function rdProcessDocument(path: string): string {
  return getRdBindings().rdProcessDocument(path);
}
