/**
 * Pure logic behind the `aiyoucli hooks session-start` / `user-prompt-submit`
 * CLI subcommands (see commands/index.ts) — split out so the decision logic
 * (confidence gating, message shape) is unit-testable without going through
 * a live MCP tool call or a Claude Code hook invocation. Part of the plugin
 * packaging in plan Fase 4 (sleepy-singing-lobster) — see
 * init/plugin-generator.ts's header for how these get wired into
 * `hooks/hooks.json`.
 */

import type { AgentDef } from "./claude-agents.js";

export function buildSessionStartReminder(agentDefs: readonly AgentDef[]): string {
  const roster = agentDefs.map((d) => d.name).join(", ");
  return (
    `aiyou-team plugin active — agents available via Task: ${roster}. ` +
    "Prefer the aiyoucli CLI over MCP tools for aiyou-team operations " +
    "(agent, a2a, codebase, memory, ...) — see AGENTS.md / .aiyoucli/agents.dsi.toon."
  );
}

/** Prompts shorter than this aren't worth a route() call — mostly acks ("ok", "yes", "continue"). */
export const MIN_PROMPT_LENGTH_FOR_ROUTING_HINT = 20;

export const DEFAULT_MIN_ROUTING_CONFIDENCE = 0.6;

export interface RoutingResult {
  recommended_agent?: string;
  confidence?: number;
}

/**
 * Returns the `hookSpecificOutput` JSON to print for UserPromptSubmit, or
 * `undefined` when nothing should be printed — either the prompt was too
 * short to bother routing, or the recommendation didn't clear the
 * confidence bar. Staying silent is the common case by design: a routing
 * hint on every single message would be noise, and an unconfident hint is
 * worse than none (see commands/index.ts's PreToolUse(Task) rejection note
 * in plugin-generator.ts for the related "why not gate the Task call
 * itself" reasoning).
 */
export function buildUserPromptSubmitHint(
  promptText: string,
  routing: RoutingResult | undefined,
  minConfidence: number = DEFAULT_MIN_ROUTING_CONFIDENCE
): string | undefined {
  if (promptText.trim().length < MIN_PROMPT_LENGTH_FOR_ROUTING_HINT) return undefined;
  if (!routing?.recommended_agent) return undefined;
  if ((routing.confidence ?? 0) < minConfidence) return undefined;

  const context =
    `aiyou-team routing hint (informational, not a directive): this task looks like a fit for the ` +
    `"${routing.recommended_agent}" agent (confidence ${Math.round((routing.confidence ?? 0) * 100)}%). ` +
    "Delegate via Task if it's substantial and self-contained enough to hand off.";

  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
  });
}
