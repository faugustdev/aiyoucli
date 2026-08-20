/**
 * spawnOpenCodeServe — vitest.
 *
 * Uses a throwaway fake "opencode" executable rather than the real binary
 * (needs no real project/model config) — the only contract this depends on
 * is printing a "listening on http://..." line to stdout, which is exactly
 * what a real `opencode serve` does (confirmed during the Fase 3 spike).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnOpenCodeServe } from "../src/services/a2a/opencode-process.js";

let dir: string;
let fakeOpencode: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "aiyoucli-a2a-fake-opencode-"));
  fakeOpencode = join(dir, "fake-opencode.mjs");
  writeFileSync(
    fakeOpencode,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "hang") {
  setTimeout(() => {}, 60_000);
} else if (args[0] === "crash") {
  process.exit(1);
} else {
  console.log("opencode server listening on http://127.0.0.1:9999");
  setInterval(() => {}, 1000); // stay alive like a real server would
}
`,
    "utf-8"
  );
  chmodSync(fakeOpencode, 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("spawnOpenCodeServe", () => {
  it("resolves the URL parsed from the ready line", async () => {
    const handle = await spawnOpenCodeServe({ opencodeBin: fakeOpencode });
    expect(handle.url).toBe("http://127.0.0.1:9999");
    await handle.stop();
  });

  it("stop() terminates the process", async () => {
    const handle = await spawnOpenCodeServe({ opencodeBin: fakeOpencode });
    await expect(handle.stop()).resolves.toBeUndefined();
  });

  it("rejects if the binary can't be spawned", async () => {
    await expect(spawnOpenCodeServe({ opencodeBin: join(dir, "does-not-exist") })).rejects.toThrow(/Failed to spawn/);
  });

  it("rejects if the process exits before printing a ready line", async () => {
    await expect(spawnOpenCodeServeWithArg(fakeOpencode, "crash")).rejects.toThrow(/exited early/);
  });

  it("rejects on timeout if nothing is ever printed", async () => {
    await expect(
      spawnOpenCodeServeWithArg(fakeOpencode, "hang", 100)
    ).rejects.toThrow(/did not report ready/);
  }, 10_000);
});

// The real spawnOpenCodeServe always passes ["serve", "--port", ..., "--hostname", ...] —
// these helpers reuse it but swap argv[0] via a wrapper env var isn't worth
// the complexity, so drive the fake script's branching off argv[0] directly
// by pointing `opencodeBin` at a tiny per-case wrapper instead.
async function spawnOpenCodeServeWithArg(scriptPath: string, mode: "crash" | "hang", readyTimeoutMs?: number) {
  const wrapperPath = join(dir, `wrapper-${mode}.sh`);
  writeFileSync(wrapperPath, `#!/bin/sh\nexec node "${scriptPath}" ${mode} "$@"\n`, "utf-8");
  chmodSync(wrapperPath, 0o755);
  return spawnOpenCodeServe({ opencodeBin: wrapperPath, readyTimeoutMs });
}
