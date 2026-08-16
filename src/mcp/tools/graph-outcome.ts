/**
 * Write-back learning loop: record task outcomes into the knowledge graph
 * so it accumulates real signal over time instead of only being written by
 * `graph_bootstrap`. This is what makes `graph-route-hint.ts`'s CompletedBy
 * branch (and therefore neighborhood-based routing) actually discriminate
 * between agents.
 *
 * Called from `hooks_post_task`, best-effort — a failure here must never
 * break that hook's response (see the try/catch at the call site).
 */

import { getGraph, upsertNode } from "./graph-tools.js";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your",
  "have", "has", "are", "was", "were", "will", "can", "should", "would",
  "task", "please", "need", "using", "use",
]);

/**
 * Reduce a task description to a short, stable key so repeated similar
 * tasks land on the same `concept` node instead of each spawning a new one.
 *
 * The raw description isn't kept anywhere today — `GraphHandle.addNode`
 * doesn't take node properties over the NAPI boundary (only `update_node`,
 * which supports arbitrary properties, isn't exposed yet), so the
 * normalized key is currently the only thing captured. Good enough for
 * dedup and for reading node names back; a future pass can expose an
 * `addNodeWithProperty`-style method if the raw text turns out to matter.
 */
function normalizeTaskKey(description: string): string {
  const tokens = description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return tokens.slice(0, 8).join("-").slice(0, 80) || "task";
}

/** EMA smoothing factor for the CompletedBy edge weight. */
const ALPHA = 0.3;

export interface GraphOutcome {
  conceptId: number;
  agentId: number;
  weight: number;
}

/**
 * Record a task outcome: upsert a `concept` node for the (normalized) task,
 * upsert an `agent` node for the agent that handled it, and update the
 * `concept --CompletedBy--> agent` edge weight as an exponential moving
 * average of success (1.0 success / 0.0 failure) — deliberately a
 * different reward space from the Q-table's {1.0, -0.5}, since this edge
 * weight is meant to read as a success rate, not a Q-value.
 */
export function recordGraphOutcome(
  description: string,
  agent: string,
  success: boolean
): GraphOutcome {
  const g = getGraph();
  const conceptId = upsertNode("concept", normalizeTaskKey(description));

  // Not routed through ROSTER_TO_SKILL: that table is only for blending
  // scores into the Q-router, not for gatekeeping which nodes can exist in
  // the graph. Write-back must work even for an un-bootstrapped project or
  // a caller passing a name outside the aiyou-team roster.
  const agentNode = g.getNodeByName(agent);
  const agentId = agentNode ? agentNode.id : g.addNode("agent", agent);

  const rewardNorm = success ? 1.0 : 0.0;
  const existingEdgeId = g.findEdge(conceptId, agentId, "completed_by");
  if (existingEdgeId === null) {
    g.addEdge(conceptId, agentId, "completed_by", rewardNorm);
    return { conceptId, agentId, weight: rewardNorm };
  }

  const oldWeight =
    g.neighbors(conceptId, "outgoing").find((n) => n.node_id === agentId && n.edge_kind === "CompletedBy")
      ?.weight ?? 0;
  const newWeight = oldWeight + ALPHA * (rewardNorm - oldWeight);
  g.updateEdgeWeight(existingEdgeId, newWeight);
  return { conceptId, agentId, weight: newWeight };
}
