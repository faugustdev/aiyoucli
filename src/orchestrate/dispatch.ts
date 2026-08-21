/**
 * Local, no-network dispatch for `aiyoucli orchestrate` (plan: sleepy-
 * singing-lobster, "Plan Master 2"). Reuses the same `TaskExecutor`s A2A's
 * server.ts uses (services/a2a/executors/*) directly — no HTTP, no Agent
 * Card, no task-lifecycle machinery. Those executors live under
 * `services/a2a/` for historical reasons, not because this is A2A-specific.
 */

import { randomUUID } from "node:crypto";
import { AGENT_DEFS } from "../init/claude-agents.js";
import { loadConfig } from "../config.js";
import type { OrchestrationRuntime } from "../types.js";
import type { OrchestrationTask, OrchestrationResult } from "./types.js";
import { DEFAULT_ORCHESTRATION } from "./defaults.js";
import { createClaudeHeadlessExecutor } from "../services/a2a/executors/claude-headless.js";
import { createOpenCodeHeadlessExecutor } from "../services/a2a/executors/opencode-headless.js";
import { createAgyHeadlessExecutor } from "../services/a2a/executors/agy-headless.js";
import { createMmxHeadlessExecutor } from "../services/a2a/executors/mmx-headless.js";
import { spawnOpenCodeServe, type OpenCodeServeHandle } from "../services/a2a/opencode-process.js";
import type { Message, Task } from "../services/a2a/types.js";

export interface DispatchOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Required when the resolved runtime is "opencode" — see runOrchestrationPlan, which manages this for a whole batch. */
  opencodeServerUrl?: string;
}

/** `Config.agents[name]` first, then DEFAULT_ORCHESTRATION, then "claude" with no forced model. */
export function resolveRuntimeAndModel(agentName: string): { runtime: OrchestrationRuntime; model?: string } {
  const override = loadConfig().agents?.[agentName];
  if (override?.runtime) {
    return { runtime: override.runtime, model: override.model };
  }
  const fallback = DEFAULT_ORCHESTRATION[agentName];
  if (fallback) {
    return { runtime: fallback.runtime, model: override?.model ?? fallback.model };
  }
  return { runtime: "claude", model: override?.model };
}

function toMessage(text: string, skillId: string): Message {
  return { messageId: randomUUID(), role: "ROLE_USER", parts: [{ text }], metadata: { skillId } };
}

const dummyTask: Task = { id: "orchestrate", contextId: "orchestrate", status: { state: "TASK_STATE_WORKING" } };

/**
 * Dispatches one task and always resolves to an `OrchestrationResult` —
 * never rejects, including for validation errors (unknown agent,
 * coordination-leader, missing opencodeServerUrl) — so a batch in
 * `runOrchestrationPlan` can report every task's outcome instead of the
 * whole `Promise.all` failing on the first bad one.
 */
export async function dispatchTask(task: OrchestrationTask, opts?: DispatchOptions): Promise<OrchestrationResult> {
  const start = Date.now();
  const fail = (error: string, runtime: OrchestrationRuntime = "claude", model?: string): OrchestrationResult => ({
    agent: task.agent,
    runtime,
    model,
    status: "failed",
    error,
    durationMs: Date.now() - start,
  });

  if (task.agent === "coordination-leader") {
    return fail("coordination-leader is not dispatchable — it's the interactive Claude Code session itself");
  }
  const def = AGENT_DEFS.find((d) => d.name === task.agent);
  if (!def) {
    return fail(`Unknown agent "${task.agent}". Known: ${AGENT_DEFS.map((d) => d.name).join(", ")}`);
  }

  const { runtime, model } = resolveRuntimeAndModel(task.agent);

  try {
    let executor;
    switch (runtime) {
      case "claude":
        executor = createClaudeHeadlessExecutor({ cwd: opts?.cwd, timeoutMs: opts?.timeoutMs });
        break;
      case "opencode":
        if (!opts?.opencodeServerUrl) {
          return fail(
            "runtime resolved to opencode but no opencodeServerUrl was provided — runOrchestrationPlan manages this for a batch; pass one explicitly for a standalone dispatchTask call",
            runtime,
            model
          );
        }
        executor = createOpenCodeHeadlessExecutor({
          serverUrl: opts.opencodeServerUrl,
          password: process.env.OPENCODE_SERVER_PASSWORD,
          timeoutMs: opts?.timeoutMs,
        });
        break;
      case "agy":
        executor = createAgyHeadlessExecutor({ cwd: opts?.cwd, timeoutMs: opts?.timeoutMs, model });
        break;
      case "mmx":
        executor = createMmxHeadlessExecutor({ cwd: opts?.cwd, timeoutMs: opts?.timeoutMs, model });
        break;
    }

    const parts = await executor({ skillId: task.agent, message: toMessage(task.task, task.agent), task: dummyTask });
    const textPart = parts.find((p): p is { text: string } => "text" in p);
    return {
      agent: task.agent,
      runtime,
      model,
      status: "completed",
      output: textPart?.text ?? "",
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), runtime, model);
  }
}

export interface RunOrchestrationPlanOptions {
  cwd?: string;
  timeoutMs?: number;
}

/**
 * Runs a batch of tasks concurrently. If any task resolves to runtime
 * "opencode", spawns ONE shared `opencode serve` up front (startup takes
 * ~3-6s — confirmed during the Fase 3 spike — too slow to pay per task) and
 * tears it down when the whole batch finishes, success or failure.
 */
export async function runOrchestrationPlan(
  tasks: OrchestrationTask[],
  opts?: RunOrchestrationPlanOptions
): Promise<OrchestrationResult[]> {
  const needsOpenCode = tasks.some((t) => resolveRuntimeAndModel(t.agent).runtime === "opencode");
  let opencodeHandle: OpenCodeServeHandle | undefined;

  if (needsOpenCode) {
    opencodeHandle = await spawnOpenCodeServe({ cwd: opts?.cwd });
  }

  try {
    return await Promise.all(
      tasks.map((t) =>
        dispatchTask(t, { cwd: opts?.cwd, timeoutMs: opts?.timeoutMs, opencodeServerUrl: opencodeHandle?.url })
      )
    );
  } finally {
    await opencodeHandle?.stop();
  }
}
