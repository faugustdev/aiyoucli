/**
 * Types for `aiyoucli orchestrate` — local, no-network multi-runtime
 * dispatch across the aiyou-team roster (plan: sleepy-singing-lobster,
 * "Plan Master 2"). See dispatch.ts for the actual dispatch logic.
 */

import type { OrchestrationRuntime } from "../types.js";

export type { OrchestrationRuntime };

/** One unit of work handed to `dispatchTask`/`runOrchestrationPlan`. */
export interface OrchestrationTask {
  /** aiyou-team agent name, e.g. "reviewer" — must be in AGENT_DEFS and not "coordination-leader". */
  agent: string;
  /** The task description/prompt to hand that agent. */
  task: string;
}

export interface OrchestrationResult {
  agent: string;
  runtime: OrchestrationRuntime;
  /** Only meaningful for runtime "agy" — claude/opencode resolve their model out-of-band (see dispatch.ts). */
  model?: string;
  status: "completed" | "failed";
  output?: string;
  error?: string;
  durationMs: number;
}
