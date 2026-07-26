/**
 * aiyouvector daemon watch hook — closes Pillar A.4 (step 8 of lamp plan).
 *
 * Best-effort: if `aiyouvector` is installed, register the project root
 * with the daemon so the observer/sona/profile pipeline picks up changes.
 * If `aiyouvector` is not installed, the call is a no-op (not a failure).
 * If the daemon is not running, attempt to start it once and retry.
 *
 * No new dependencies — uses `node:child_process` synchronously to keep
 * the caller (warmup) free to await / batch.
 */

import { spawnSync } from "node:child_process";

export interface WatcherHookResult {
  /** Whether `aiyouvector` was found on PATH / co-located. */
  watcherInstalled: boolean;
  /** Whether the project was successfully registered with the daemon. */
  ok: boolean;
  /** Long-form detail for logging / warmup report. */
  detail: string;
}

const AIVOUVECTOR_BIN = "aiyouvector";
const START_TIMEOUT_MS = 8_000;
const WATCH_TIMEOUT_MS = 6_000;

/** Returns true if `aiyouvector --version` exits 0. */
function isInstalled(): boolean {
  const r = spawnSync(AIVOUVECTOR_BIN, ["--version"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 3_000,
  });
  return !r.error && r.status === 0;
}

function runWatch(cwd: string): { ok: boolean; detail: string } {
  const r = spawnSync(AIVOUVECTOR_BIN, ["daemon", "watch", cwd], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: WATCH_TIMEOUT_MS,
  });
  if (r.error) {
    return { ok: false, detail: `spawn failed: ${r.error.message}` };
  }
  if (r.status !== 0) {
    const stderr = (r.stderr ?? "").trim();
    return {
      ok: false,
      detail: stderr || `aiyouvector exited with status ${r.status}`,
    };
  }
  const stdout = (r.stdout ?? "").trim();
  return { ok: true, detail: stdout || `watching ${cwd}` };
}

function runStart(): { ok: boolean; detail: string } {
  const r = spawnSync(AIVOUVECTOR_BIN, ["daemon", "start"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: START_TIMEOUT_MS,
  });
  if (r.error) {
    return { ok: false, detail: `spawn failed: ${r.error.message}` };
  }
  // status 0 = started or already running; both are success.
  if (r.status === 0) {
    const stdout = (r.stdout ?? "").trim();
    return { ok: true, detail: stdout || "daemon started" };
  }
  const stderr = (r.stderr ?? "").trim();
  return {
    ok: false,
    detail: stderr || `daemon start exited with status ${r.status}`,
  };
}

/**
 * Register `cwd` with `aiyouvector daemon watch`. Best-effort:
 *
 * 1. If `aiyouvector` is not installed → `{ ok: true, detail: "skipped" }`
 *    (treated as success because absence is not a failure).
 * 2. Try `aiyouvector daemon watch <cwd>`. If it succeeds → done.
 * 3. If it fails (likely "daemon not running"), try `aiyouvector daemon
 *    start` once, then retry the watch. If the retry succeeds → done.
 * 4. If anything still fails → `{ ok: false, detail: ... }` so the
 *    warmup step can be marked as degraded.
 */
export function tryWatchProject(cwd: string): WatcherHookResult {
  if (!isInstalled()) {
    return {
      watcherInstalled: false,
      ok: true,
      detail: "aiyouvector not installed; skipped",
    };
  }

  const first = runWatch(cwd);
  if (first.ok) {
    return { watcherInstalled: true, ok: true, detail: first.detail };
  }

  // Detect "daemon not running" — non-fatal, try to start + retry once.
  const looksLikeDaemonDown =
    /no such file|connection refused|ENOENT|socket/i.test(first.detail) ||
    first.detail.toLowerCase().includes("daemon");

  if (!looksLikeDaemonDown) {
    return { watcherInstalled: true, ok: false, detail: first.detail };
  }

  const start = runStart();
  if (!start.ok) {
    return {
      watcherInstalled: true,
      ok: false,
      detail: `daemon watch failed: ${first.detail}; daemon start failed: ${start.detail}`,
    };
  }

  const retry = runWatch(cwd);
  if (retry.ok) {
    return {
      watcherInstalled: true,
      ok: true,
      detail: `daemon started; ${retry.detail}`,
    };
  }

  return {
    watcherInstalled: true,
    ok: false,
    detail: `daemon started but watch still failed: ${retry.detail}`,
  };
}
