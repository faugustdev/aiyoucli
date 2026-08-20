/**
 * Spawns and manages an `opencode serve` child process for
 * `aiyoucli a2a serve --runtime opencode` when the operator doesn't already
 * have one running to attach to. Kept separate from
 * `executors/opencode-headless.ts` (the HTTP client against a server) so the
 * executor stays testable without spawning a real process.
 */

import { spawn, type ChildProcess } from "node:child_process";

export interface OpenCodeServeHandle {
  url: string;
  stop(): Promise<void>;
}

export interface SpawnOpenCodeServeOptions {
  cwd?: string;
  /** Path/name of the `opencode` binary. Default: "opencode" (resolved via PATH). */
  opencodeBin?: string;
  /** Default: 0 (OS-assigned ephemeral port). */
  port?: number;
  /** Give up waiting for the "listening on" line after this long. Default: 30_000. */
  readyTimeoutMs?: number;
}

const LISTENING_RE = /listening on (http:\/\/\S+)/;

export function spawnOpenCodeServe(opts?: SpawnOpenCodeServeOptions): Promise<OpenCodeServeHandle> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(
      opts?.opencodeBin ?? "opencode",
      ["serve", "--port", String(opts?.port ?? 0), "--hostname", "127.0.0.1"],
      { cwd: opts?.cwd ?? process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
    );

    let settled = false;
    let buf = "";

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`'${opts?.opencodeBin ?? "opencode"} serve' did not report ready within ${opts?.readyTimeoutMs ?? 30_000}ms`));
    }, opts?.readyTimeoutMs ?? 30_000);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (settled) return;
      buf += chunk.toString("utf-8");
      const match = buf.match(LISTENING_RE);
      if (match) {
        settled = true;
        clearTimeout(timer);
        resolve({
          url: match[1]!,
          stop: () =>
            new Promise<void>((res) => {
              if (child.exitCode !== null) {
                res();
                return;
              }
              child.once("exit", () => res());
              child.kill("SIGTERM");
              // Force-kill if it doesn't exit cleanly — this is a managed
              // subprocess, not something the operator interacts with.
              setTimeout(() => {
                if (child.exitCode === null) child.kill("SIGKILL");
              }, 5000).unref();
            }),
        });
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to spawn '${opts?.opencodeBin ?? "opencode"}': ${err.message}`));
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`'${opts?.opencodeBin ?? "opencode"} serve' exited early (code ${code})`));
    });
  });
}
