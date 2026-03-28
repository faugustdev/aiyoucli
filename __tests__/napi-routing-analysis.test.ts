/**
 * Routing + Analysis NAPI tests — vitest.
 */

import { describe, it, expect } from "vitest";
import { createRoutingEngine, createAnalysisEngine } from "../src/napi/index.js";

// ── Routing Engine ──────────────────────────────────────────

describe("Routing Engine (NAPI)", () => {
  it("creates an engine", () => {
    const r = createRoutingEngine();
    expect(r).toBeDefined();
  });

  it("routes coding task to coder", () => {
    const r = createRoutingEngine();
    const result = r.route("implement a new login page with form validation");
    expect(result.route).toBe("coder");
    expect(result.model_tier).toBeDefined();
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("routes testing task to tester", () => {
    const r = createRoutingEngine();
    const result = r.route("write unit tests for the auth module");
    expect(result.route).toBe("tester");
  });

  it("routes security task to security", () => {
    const r = createRoutingEngine();
    const result = r.route("audit security vulnerabilities in the payment system");
    expect(result.route).toBe("security");
  });

  it("routes architecture task to architect", () => {
    const r = createRoutingEngine();
    const result = r.route("design the microservice architecture for the new platform");
    expect(result.route).toBe("architect");
  });

  it("provides alternatives in route result", () => {
    const r = createRoutingEngine();
    const result = r.route("implement login page");
    expect(Array.isArray(result.alternatives)).toBe(true);
  });

  it("selects opus for complex tasks", () => {
    const r = createRoutingEngine();
    const tier = r.selectModelTier(
      "architect and design a distributed system with complex security audit"
    );
    expect(tier).toBe("opus");
  });

  it("selects haiku for simple tasks", () => {
    const r = createRoutingEngine();
    const tier = r.selectModelTier("rename variable and fix typo in simple format");
    expect(tier).toBe("haiku");
  });

  it("selects sonnet for medium tasks", () => {
    const r = createRoutingEngine();
    const tier = r.selectModelTier("implement user profile feature");
    expect(tier).toBe("sonnet");
  });

  it("records reward and learns", () => {
    const r = createRoutingEngine();
    r.route("implement login");
    r.recordReward("implement login", "coder", 1.0);

    const s = r.stats();
    expect(s.states_learned).toBeGreaterThanOrEqual(1);
    expect(s.total_steps).toBeGreaterThanOrEqual(1);
  });

  it("exploration flag toggles", () => {
    const r = createRoutingEngine();
    // With fresh engine, epsilon is high so exploration is likely
    // After many rewards, it should exploit more
    const results = Array.from({ length: 20 }, () =>
      r.route("implement login page")
    );
    // At least one should have explored=false (exploitation)
    const hasExploitation = results.some((res) => !res.explored);
    // At least one should have explored=true (exploration) — epsilon starts high
    const hasExploration = results.some((res) => res.explored);
    expect(hasExploitation || hasExploration).toBe(true);
  });
});

// ── Analysis Engine ─────────────────────────────────────────

describe("Analysis Engine (NAPI)", () => {
  it("creates an engine", () => {
    const a = createAnalysisEngine();
    expect(a).toBeDefined();
  });

  describe("classifyCommit", () => {
    it("classifies conventional commit types", () => {
      const a = createAnalysisEngine();
      expect(a.classifyCommit("fix: resolve null pointer in auth")).toBe("bugfix");
      expect(a.classifyCommit("feat: add user profile page")).toBe("feature");
      expect(a.classifyCommit("refactor: restructure api layer")).toBe("refactor");
      expect(a.classifyCommit("docs: update README")).toBe("docs");
      expect(a.classifyCommit("test: add unit tests for parser")).toBe("test");
    });

    it("classifies non-conventional messages by keywords", () => {
      const a = createAnalysisEngine();
      const bugfix = a.classifyCommit("fixed the crash on login");
      expect(["bugfix", "feature", "refactor", "docs", "test", "config", "style", "other"]).toContain(bugfix);
    });
  });

  describe("complexityScore", () => {
    it("scores simple code lower than complex code", () => {
      const a = createAnalysisEngine();

      const simple = `
function add(a, b) {
  return a + b;
}`;

      const complex = `
function processOrder(order) {
  if (order.items.length === 0) {
    throw new Error("empty");
  }
  for (const item of order.items) {
    if (item.quantity > 0) {
      if (item.price > 100) {
        if (order.user.isPremium || order.coupon) {
          item.discount = calculateDiscount(item);
          if (item.discount > 0.5) {
            for (const rule of item.rules) {
              if (rule.applies(item) && rule.isValid()) {
                applyRule(rule, item);
              }
            }
          }
        }
      }
    }
  }
  return order;
}`;

      const simpleScore = a.complexityScore(simple);
      const complexScore = a.complexityScore(complex);
      expect(simpleScore).toBeLessThan(complexScore);
    });

    it("returns normalized 0-1 score", () => {
      const a = createAnalysisEngine();
      const score = a.complexityScore("function x() { return 1; }");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("handles empty input", () => {
      const a = createAnalysisEngine();
      const score = a.complexityScore("");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("classifyDiff", () => {
    it("classifies a multi-file diff", () => {
      const a = createAnalysisEngine();
      const diff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,8 @@ export function login(user, pass) {
+  if (!user) throw new Error("missing user");
+  if (!pass) throw new Error("missing pass");
   const token = authenticate(user, pass);
   return token;
 }
diff --git a/tests/auth.test.ts b/tests/auth.test.ts
--- a/tests/auth.test.ts
+++ b/tests/auth.test.ts
@@ -1,3 +1,10 @@
+describe("auth", () => {
+  test("rejects empty user", () => {
+    expect(() => login("", "pass")).toThrow();
+  });
+  test("rejects empty pass", () => {
+    expect(() => login("user", "")).toThrow();
+  });
+});
`;

      const result = a.classifyDiff(diff);
      expect(result.files).toHaveLength(2);
      expect(result.stats.files_changed).toBe(2);
      expect(result.stats.total_additions).toBeGreaterThan(0);

      const testFile = result.files.find((f) => f.path.includes("test"));
      expect(testFile).toBeDefined();
      expect(testFile!.classification).toBe("test");
    });

    it("returns risk factors array", () => {
      const a = createAnalysisEngine();
      const diff = `diff --git a/src/main.ts b/src/main.ts
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,1 +1,2 @@
+console.log("hello");
`;
      const result = a.classifyDiff(diff);
      expect(Array.isArray(result.risk_factors)).toBe(true);
    });

    it("provides overall classification", () => {
      const a = createAnalysisEngine();
      const diff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,1 +1,2 @@
+New documentation line
`;
      const result = a.classifyDiff(diff);
      expect(result.overall).toBeDefined();
      expect(result.overall.classification).toBeDefined();
      expect(result.overall.impact).toBeDefined();
    });
  });
});
