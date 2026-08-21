/**
 * Default runtime + model assignment for `aiyoucli orchestrate`, approved by
 * the user during planning (plan: sleepy-singing-lobster, "Plan Master 2"):
 *
 *   - coding-leader / coding-executor → opencode (need real write tools —
 *     Edit/Write/Bash — already proven working via opencode-headless.ts).
 *   - codebase-explorer / reviewer / principal-advisor → agy, cheap model
 *     (read-only work, no reason to pay for a flagship model).
 *   - web-researcher / multimodal-looker → opencode (WebFetch/vision already
 *     proven working there).
 *   - coordination-leader is intentionally absent — it's not dispatchable,
 *     it's the interactive Claude Code session itself. `dispatch.ts` rejects
 *     it explicitly rather than silently falling back to something here.
 *
 * This is only the fallback. `Config.agents[name].runtime`/`.model` (set via
 * `aiyoucli agent set-runtime`/`set-model`) always wins when present — see
 * `dispatch.ts`'s `resolveRuntimeAndModel`.
 */

import type { OrchestrationRuntime } from "../types.js";

export interface OrchestrationDefault {
  runtime: OrchestrationRuntime;
  /** Only set where a cheap model matters (the agy-routed, read-only agents). */
  model?: string;
}

export const DEFAULT_ORCHESTRATION: Record<string, OrchestrationDefault> = {
  "coding-leader": { runtime: "opencode" },
  "coding-executor": { runtime: "opencode" },
  "codebase-explorer": { runtime: "agy", model: "gemini-3.7-flash-low" },
  reviewer: { runtime: "agy", model: "gemini-3.7-flash-low" },
  "principal-advisor": { runtime: "agy", model: "gemini-3.7-flash-low" },
  "web-researcher": { runtime: "opencode" },
  "multimodal-looker": { runtime: "opencode" },
};
