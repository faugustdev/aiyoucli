/**
 * Single source of truth for the package version.
 *
 * The version used to be typed out as a literal in several places, and they
 * drifted: `status` and the MCP handshake both reported "1.0.2" while the
 * package was on 1.3.1. Read it from package.json instead — there is exactly
 * one place it can be wrong.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cached: string | null = null;

/**
 * The version from package.json, or "unknown" if it cannot be read.
 * Cached — package.json does not change while the process is running.
 */
export function packageVersion(): string {
  if (cached !== null) return cached;

  // dist/version.js -> package root
  const candidates = [join(__dirname, "..", "package.json")];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf-8"));
      if (pkg?.version) {
        cached = pkg.version as string;
        return cached;
      }
    } catch {
      // try the next candidate
    }
  }

  // Fall back to module resolution, which survives unusual layouts.
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    if (pkg?.version) {
      cached = pkg.version;
      return cached;
    }
  } catch {
    // fall through
  }

  cached = "unknown";
  return cached;
}
