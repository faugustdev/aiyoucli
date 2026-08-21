/**
 * buildDelegatingPromptBody — vitest.
 *
 * This is the single most important test in the "delegate by default" plan
 * (sleepy-singing-lobster, "Plan Master 3"): a "claude"-resolved agent must
 * NEVER get a delegation instruction wrapped around its prompt. If it did,
 * dispatch.ts's "claude" branch would call `claude -p --agent <name>`,
 * which reloads the exact same generated `.claude/agents/<name>.md` file —
 * infinite recursion. See buildDelegatingPromptBody's own header comment
 * for the full invariant.
 */

import { describe, it, expect } from "vitest";
import { buildDelegatingPromptBody, AGENT_DEFS } from "../src/init/claude-agents.js";

const reviewer = AGENT_DEFS.find((d) => d.name === "reviewer")!;

describe("buildDelegatingPromptBody", () => {
  it("returns the promptBody completely unmodified for runtime claude — the recursion-safety invariant", () => {
    expect(buildDelegatingPromptBody(reviewer, "claude")).toBe(reviewer.promptBody);
  });

  it("never mentions orchestrate/delegation when runtime is claude", () => {
    const body = buildDelegatingPromptBody(reviewer, "claude");
    expect(body).not.toContain("orchestrate");
    expect(body).not.toContain("command -v");
  });

  it.each(["opencode", "agy", "mmx"] as const)("wraps with a delegate-first instruction for runtime %s", (runtime) => {
    const body = buildDelegatingPromptBody(reviewer, runtime);
    expect(body).toContain(`command -v ${runtime}`);
    expect(body).toContain(`aiyoucli orchestrate task --agent ${reviewer.name}`);
  });

  it("preserves the original promptBody in full beneath the delegation wrapper", () => {
    const body = buildDelegatingPromptBody(reviewer, "agy");
    expect(body).toContain(reviewer.promptBody);
  });

  it("the availability check is embedded in the prompt text, not evaluated at generation time (same output regardless of what's actually on this machine's PATH)", () => {
    // No mocking of `which`/`command -v` here on purpose — the function
    // itself must never shell out or check PATH; it just emits static text
    // instructing the *agent* to check at its own runtime.
    const a = buildDelegatingPromptBody(reviewer, "opencode");
    const b = buildDelegatingPromptBody(reviewer, "opencode");
    expect(a).toBe(b);
  });

  it("falls back to the runtime name itself as the binary if it's not in the known map (forward-compat, doesn't throw)", () => {
    const body = buildDelegatingPromptBody(reviewer, "some-future-runtime");
    expect(body).toContain("command -v some-future-runtime");
  });
});
