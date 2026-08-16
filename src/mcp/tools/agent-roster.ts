/**
 * Analogy tables between the real aiyou-team roster (used by
 * `graph_bootstrap`'s agent nodes and by `getAgentProfiles()`) and the
 * fixed 8-slot `AGENT_TYPES` array the Rust `QRouter` Q-table indexes by
 * (`aiyouvector-routing/src/heuristic.rs`).
 *
 * The two namespaces evolved independently and don't line up: renaming
 * `AGENT_TYPES` in Rust would also require redesigning the semantic
 * router's keyword corpus, so instead of touching the shared routing
 * crate we bridge the two names here. This is a many-to-one analogy, not
 * a bijection — several roster roles collapse onto one Q-router skill,
 * and `debugger`/`documenter` have no dedicated roster owner (weakest
 * mappings, flagged as a future tuning item).
 *
 * Without this bridge, `QRouter::record_reward` resolves an unrecognized
 * chosen-route name to index 0 (`"coder"`) via `.unwrap_or(0)` — meaning
 * `hooks_post_task`/`q_table_seed` calls made with roster names silently
 * corrupt rewards for 7 of the 8 agents today.
 */

/** Real aiyou-team roster name -> QRouter AGENT_TYPES skill name. */
export const ROSTER_TO_SKILL: Record<string, string> = {
  "coding-leader": "architect",
  "coordination-leader": "architect",
  "coding-executor": "coder",
  "codebase-explorer": "researcher",
  "web-researcher": "researcher",
  reviewer: "reviewer",
  "principal-advisor": "security",
  "multimodal-looker": "tester",
};

/** QRouter AGENT_TYPES skill name -> representative aiyou-team roster name. */
export const SKILL_TO_ROSTER: Record<string, string> = {
  coder: "coding-executor",
  researcher: "web-researcher",
  tester: "multimodal-looker",
  reviewer: "reviewer",
  architect: "coding-leader",
  security: "principal-advisor",
  // No dedicated roster owner for these two — weakest links in the analogy.
  debugger: "coding-executor",
  documenter: "web-researcher",
};
