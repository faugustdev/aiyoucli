/**
 * session-hooks.ts — vitest.
 *
 * Pure logic behind `aiyoucli hooks session-start` / `user-prompt-submit`,
 * the two hooks the Claude Code Plugin (plan Fase 4) wires up beyond what
 * the standalone `.claude/` path already had. See that file's header for
 * why this exists as a separate testable module.
 */

import { describe, it, expect } from "vitest";
import {
  buildSessionStartReminder,
  buildUserPromptSubmitHint,
  MIN_PROMPT_LENGTH_FOR_ROUTING_HINT,
  DEFAULT_MIN_ROUTING_CONFIDENCE,
} from "../src/init/session-hooks.js";
import { AGENT_DEFS } from "../src/init/claude-agents.js";

describe("buildSessionStartReminder", () => {
  it("lists every agent name from the roster", () => {
    const text = buildSessionStartReminder(AGENT_DEFS);
    for (const def of AGENT_DEFS) {
      expect(text).toContain(def.name);
    }
  });

  it("mentions preferring the CLI over MCP", () => {
    const text = buildSessionStartReminder(AGENT_DEFS);
    expect(text.toLowerCase()).toContain("aiyoucli cli");
  });

  it("stays reasonably short (this gets injected into every session)", () => {
    const text = buildSessionStartReminder(AGENT_DEFS);
    expect(text.length).toBeLessThan(600);
  });
});

describe("buildUserPromptSubmitHint", () => {
  const longPrompt = "please refactor the authentication module to use JWT tokens";

  it("stays silent for prompts shorter than the routing-hint floor", () => {
    const shortPrompt = "x".repeat(MIN_PROMPT_LENGTH_FOR_ROUTING_HINT - 1);
    const hint = buildUserPromptSubmitHint(shortPrompt, { recommended_agent: "coding-leader", confidence: 0.99 });
    expect(hint).toBeUndefined();
  });

  it("stays silent when there's no recommended agent", () => {
    const hint = buildUserPromptSubmitHint(longPrompt, { confidence: 0.99 });
    expect(hint).toBeUndefined();
  });

  it("stays silent when routing is undefined entirely", () => {
    expect(buildUserPromptSubmitHint(longPrompt, undefined)).toBeUndefined();
  });

  it("stays silent below the default confidence threshold", () => {
    const hint = buildUserPromptSubmitHint(longPrompt, {
      recommended_agent: "coding-leader",
      confidence: DEFAULT_MIN_ROUTING_CONFIDENCE - 0.01,
    });
    expect(hint).toBeUndefined();
  });

  it("emits a hookSpecificOutput JSON string at/above the confidence threshold", () => {
    const hint = buildUserPromptSubmitHint(longPrompt, {
      recommended_agent: "coding-leader",
      confidence: DEFAULT_MIN_ROUTING_CONFIDENCE,
    });
    expect(hint).toBeDefined();
    const parsed = JSON.parse(hint!);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("coding-leader");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("60%");
  });

  it("respects a custom minConfidence override", () => {
    const belowDefault = buildUserPromptSubmitHint(
      longPrompt,
      { recommended_agent: "reviewer", confidence: 0.5 },
      0.4
    );
    expect(belowDefault).toBeDefined();

    const stillBelowCustom = buildUserPromptSubmitHint(
      longPrompt,
      { recommended_agent: "reviewer", confidence: 0.3 },
      0.4
    );
    expect(stillBelowCustom).toBeUndefined();
  });

  it("is always valid JSON with no unescaped injection from the agent name", () => {
    const hint = buildUserPromptSubmitHint(longPrompt, {
      recommended_agent: 'weird"agent',
      confidence: 1,
    });
    expect(() => JSON.parse(hint!)).not.toThrow();
  });
});
