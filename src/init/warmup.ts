/**
 * Phase 3 — Warmup orchestrator.
 * 
 * Coordinates the initialization of all aiyoucli subsystems:
 * - Vector memory (memory_init)
 * - Knowledge graph (graph_bootstrap)
 * - Q-table seeding (q_table_seed)
 * - Neural learning baseline (neural_observe)
 * - Proxy health checks (proxy_health, proxy_shield_check)
 * - Skills detection (skills_detect)
 * - Project auto-indexing (autoIndex)
 * 
 * Each step is independent and can fail without blocking others.
 * The warmup returns a detailed report of what succeeded and what failed.
 */

import { callTool } from "../mcp/client.js";
import { autoIndex, type IndexResult } from "./indexer-auto.js";
import { tryWatchProject } from "./aiyouvector-watcher.js";

export interface WarmupStep {
  name: string;
  status: "ok" | "degraded" | "failed" | "skipped";
  detail: string;
  duration_ms: number;
}

export interface WarmupReport {
  steps: WarmupStep[];
  total_duration_ms: number;
  ok_count: number;
  degraded_count: number;
  failed_count: number;
  skipped_count: number;
  index_result?: IndexResult;
}

export interface WarmupOptions {
  cwd: string;
  skipIndex?: boolean;
  skipTeam?: boolean;
  skipProxy?: boolean;
  skipWatcher?: boolean;
  onProgress?: (step: string, status: string) => void;
}

/**
 * Execute a warmup step and capture its result.
 */
async function runStep(
  name: string,
  fn: () => Promise<{ ok: boolean; detail: string }>,
  onProgress?: (step: string, status: string) => void
): Promise<WarmupStep> {
  const startTime = Date.now();
  onProgress?.(name, "running");
  
  try {
    const result = await fn();
    const duration_ms = Date.now() - startTime;
    const status = result.ok ? "ok" : "degraded";
    onProgress?.(name, status);
    
    return {
      name,
      status,
      detail: result.detail,
      duration_ms,
    };
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.(name, "failed");
    
    return {
      name,
      status: "failed",
      detail: message,
      duration_ms,
    };
  }
}

/**
 * Ask the keyword embedder how wide its vectors are.
 *
 * Goes through the same `embed` tool the indexer uses, so a broken embedder
 * surfaces here — at collection-creation time — instead of silently producing
 * a collection that every later insert fails to match.
 *
 * @returns The embedding width, or null if the embedder is unusable.
 */
async function probeEmbedderDimensions(): Promise<number | null> {
  const result = await callTool("embed", { type: "keyword", text: "probe" });
  if (result.isError) return null;
  try {
    const vector = JSON.parse(result.content[0]?.text ?? "");
    if (Array.isArray(vector) && vector.length > 0) return vector.length;
  } catch {
    // non-JSON payload — treat as unusable
  }
  return null;
}

/**
 * Orchestrate the full warmup sequence.
 *
 * @param options - Warmup configuration
 * @returns Detailed report of all steps
 */
export async function warmup(options: WarmupOptions): Promise<WarmupReport> {
  const startTime = Date.now();
  const steps: WarmupStep[] = [];
  const { cwd, skipIndex, skipProxy, skipWatcher, onProgress } = options;
  
  // 1. Vector memory initialization
  steps.push(
    await runStep(
      "memory_init",
      async () => {
        // The collection must match whatever the "keyword" embedder actually
        // produces, because auto_index (step 10 below) stores its output here.
        // Do not hardcode: this was 384, then 8 (from a stale "8-dimension"
        // doc comment in the Rust crate), while the embedder really returns
        // 128 — every indexed chunk failed memory-tools' dimension check.
        // Probe the embedder once and let it define the collection instead.
        //
        // The 384-dim "onnx" embedder needs a separately-started local ONNX
        // server (see AGENTS.md) that `init` does not launch; run
        // `memory init --dimensions 384` manually to use it.
        const dimensions = await probeEmbedderDimensions();
        if (dimensions === null) {
          return {
            ok: false,
            detail:
              "could not probe the keyword embedder — cannot size the vector collection",
          };
        }

        const result = await callTool("memory_init", {
          path: ".aiyoucli/vectors.redb",
          dimensions,
          enable_hnsw: true,
        });

        if (result.isError) {
          return { ok: false, detail: result.content[0]?.text ?? "Unknown error" };
        }

        return { ok: true, detail: `HNSW ${dimensions}d initialized (keyword embeddings)` };
      },
      onProgress
    )
  );
  
  // 2. Knowledge graph bootstrap
  steps.push(
    await runStep(
      "graph_bootstrap",
      async () => {
        const result = await callTool("graph_bootstrap", {
          mode: "minimal",
          cwd,
        });
        
        if (result.isError) {
          return { ok: false, detail: result.content[0]?.text ?? "Unknown error" };
        }
        
        const data = JSON.parse(result.content[0]?.text ?? "{}");
        return {
          ok: true,
          detail: `${data.total_nodes} nodes, ${data.total_edges} edges`,
        };
      },
      onProgress
    )
  );
  
  // 3. Q-table seeding
  steps.push(
    await runStep(
      "q_table_seed",
      async () => {
        const result = await callTool("q_table_seed", {
          topK: 3,
          reward: 0.5,
        });
        
        if (result.isError) {
          return { ok: false, detail: result.content[0]?.text ?? "Unknown error" };
        }
        
        const text = result.content[0]?.text ?? "";
        if (text.includes("already exists")) {
          return { ok: true, detail: "Already seeded" };
        }
        // Guard: profiles may be empty (e.g. NAPI binding missing). In that
        // case q_table_seed returns a plain-text diagnostic, not JSON. Don't
        // crash the whole warmup — surface the diagnostic as a degraded step.
        if (!text.trim().startsWith("{")) {
          return { ok: false, detail: text.substring(0, 120) };
        }

        const data = JSON.parse(text);
        return {
          ok: true,
          detail: `${data.seeded_entries} entries seeded`,
        };
      },
      onProgress
    )
  );
  
  // 6. Neural baseline observation
  steps.push(
    await runStep(
      "neural_observe",
      async () => {
        const result = await callTool("neural_observe", {
          embedding: [0, 0, 0, 0, 0, 0, 0, 0],
          quality: 0.0,
          kind: "edit",
        });
        
        if (result.isError) {
          return { ok: false, detail: result.content[0]?.text ?? "Unknown error" };
        }
        
        return { ok: true, detail: "Baseline observation recorded" };
      },
      onProgress
    )
  );
  
  // 7. Proxy health checks (unless skipped)
  if (!skipProxy) {
    steps.push(
      await runStep(
        "proxy_health",
        async () => {
          const result = await callTool("proxy_health", {});
          
          if (result.isError) {
            return { ok: false, detail: result.content[0]?.text ?? "Unknown error" };
          }
          
          const text = result.content[0]?.text ?? "";
          // Proxy might return text instead of JSON in some states
          try {
            const data = JSON.parse(text);
            return {
              ok: data.healthy ?? false,
              detail: data.healthy ? "Proxy healthy" : "Proxy unhealthy",
            };
          } catch {
            // Text response - treat as degraded if it mentions "not" or "unavailable"
            const isHealthy = !/not\s+avail|unhealthy|down|unavailable/i.test(text);
            return {
              ok: isHealthy,
              detail: text.substring(0, 60) || "Proxy responded",
            };
          }
        },
        onProgress
      )
    );
    
    steps.push(
      await runStep(
        "proxy_shield_check",
        async () => {
          const result = await callTool("proxy_shield_check", {
            content: "hello",
          });
          
          if (result.isError) {
            return { ok: false, detail: result.content[0]?.text ?? "Unknown error" };
          }
          
          return { ok: true, detail: "Shield check passed" };
        },
        onProgress
      )
    );
  } else {
    steps.push({
      name: "proxy_health",
      status: "skipped",
      detail: "Skipped via --skip-proxy",
      duration_ms: 0,
    });
    steps.push({
      name: "proxy_shield_check",
      status: "skipped",
      detail: "Skipped via --skip-proxy",
      duration_ms: 0,
    });
  }
  
  // 9. Skills detection
  steps.push(
    await runStep(
      "skills_detect",
      async () => {
        const result = await callTool("skills_detect", {
          project_dir: cwd,
        });
        
        if (result.isError) {
          return { ok: false, detail: result.content[0]?.text ?? "Unknown error" };
        }
        
        const data = JSON.parse(result.content[0]?.text ?? "{}");
        return {
          ok: true,
          detail: `${data.technologies?.length ?? 0} technologies detected`,
        };
      },
      onProgress
    )
  );
  
  // 10. Project auto-indexing (unless skipped)
  let indexResult: IndexResult | undefined;
  if (!skipIndex) {
    steps.push(
      await runStep(
        "auto_index",
        async () => {
          indexResult = await autoIndex(cwd, (progress) => {
            onProgress?.(
              "auto_index",
              `${progress.completed}/${progress.total} chunks (${progress.rate.toFixed(1)}/s)`
            );
          });
          
          if (!indexResult.indexed) {
            // "Not a git repository" / "Index up to date" are fine; a run that
            // scanned chunks and stored none is a real failure and must not be
            // reported as ok.
            const isFailure = indexResult.reason.startsWith("No chunks stored");
            return { ok: !isFailure, detail: indexResult.reason };
          }

          const partial =
            indexResult.failed_count && indexResult.failure_reason
              ? ` (${indexResult.failed_count} failed — ${indexResult.failure_reason})`
              : "";
          return {
            ok: true,
            detail: `Indexed ${indexResult.file_count} files, ${indexResult.chunk_count} chunks in ${indexResult.duration_ms}ms${partial}`,
          };
        },
        onProgress
      )
    );
  } else {
    steps.push({
      name: "auto_index",
      status: "skipped",
      detail: "Skipped via --skip-index",
      duration_ms: 0,
    });
  }

  // 11. aiyouvector daemon watch (Pillar A.4 — closes step 8 of lamp plan).
  //     Best-effort: if `aiyouvector` is not installed, the step is a
  //     no-op success. If installed but the daemon is down, the hook
  //     attempts `daemon start` once and retries the watch.
  if (skipWatcher) {
    steps.push({
      name: "aiyouvector_watch",
      status: "skipped",
      detail: "Skipped via --skip-watcher",
      duration_ms: 0,
    });
  } else {
    steps.push(
      await runStep(
        "aiyouvector_watch",
        async () => {
          const w = tryWatchProject(cwd);
          if (!w.watcherInstalled) {
            return { ok: true, detail: w.detail };
          }
          if (!w.ok) {
            return { ok: false, detail: w.detail };
          }
          return { ok: true, detail: w.detail };
        },
        onProgress
      )
    );
  }

  const total_duration_ms = Date.now() - startTime;
  
  return {
    steps,
    total_duration_ms,
    ok_count: steps.filter((s) => s.status === "ok").length,
    degraded_count: steps.filter((s) => s.status === "degraded").length,
    failed_count: steps.filter((s) => s.status === "failed").length,
    skipped_count: steps.filter((s) => s.status === "skipped").length,
    index_result: indexResult,
  };
}

// ── Render ───────────────────────────────────────────────────────────

import { output, color } from "../output.js";

const STATUS_ICONS: Record<WarmupStep["status"], string> = {
  ok: color.green("✓"),
  degraded: color.yellow("⚠"),
  failed: color.red("✗"),
  skipped: color.dim("○"),
};

/**
 * Render the warmup report to the console.
 */
export function renderWarmupReport(report: WarmupReport): void {
  output.log(color.bold("\nPhase 3 — Warmup\n"));

  for (const step of report.steps) {
    const icon = STATUS_ICONS[step.status];
    const duration = `${step.duration_ms}ms`;
    const detail = step.detail || step.status;

    if (step.status === "failed") {
      output.log(`  ${icon} ${step.name.padEnd(20)} ${color.red(detail)} ${color.dim(duration)}`);
    } else if (step.status === "degraded") {
      output.log(`  ${icon} ${step.name.padEnd(20)} ${color.yellow(detail)} ${color.dim(duration)}`);
    } else if (step.status === "skipped") {
      output.log(`  ${icon} ${step.name.padEnd(20)} ${color.dim(detail)} ${color.dim(duration)}`);
    } else {
      output.log(`  ${icon} ${step.name.padEnd(20)} ${detail} ${color.dim(duration)}`);
    }
  }

  // Summary
  const summary = [
    report.ok_count > 0 ? color.green(`${report.ok_count} ok`) : "",
    report.degraded_count > 0 ? color.yellow(`${report.degraded_count} degraded`) : "",
    report.failed_count > 0 ? color.red(`${report.failed_count} failed`) : "",
    report.skipped_count > 0 ? color.dim(`${report.skipped_count} skipped`) : "",
  ]
    .filter(Boolean)
    .join("  ");

  output.log(`\n  ${color.dim(`Total: ${report.total_duration_ms}ms`)} ${summary}`);
}
