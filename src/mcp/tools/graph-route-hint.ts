/**
 * Neighborhood-based routing signal: given a task description, look at the
 * knowledge graph (project/file/concept/agent nodes) instead of only the
 * flat Q-table, and produce a per-agent score.
 *
 * With only `graph_bootstrap`'s static graph (uniform 0.8 WorksOn weight to
 * all 8 agents), this signal is weak — the token-match bonus (step 3 below)
 * is the only thing that discriminates between agents. The CompletedBy
 * branch (step 4) is what actually makes this useful, and it stays empty
 * until the write-back loop in `graph-outcome.ts` starts recording task
 * outcomes. This file ships the mechanism; the write-back loop is what
 * makes it matter.
 */

import { getGraph, projectNodeName } from "./graph-tools.js";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your",
  "have", "has", "are", "was", "were", "will", "can", "should", "would",
  "task", "please", "need", "using", "use",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  );
}

export interface GraphRouteHint {
  agent: string;
  score: number;
}

/**
 * Score every `Agent` node in the graph against a task description.
 * Returns an empty array if the project hasn't been graph_bootstrap'd yet.
 */
export function graphRouteHint(task: string, cwd: string = process.cwd()): GraphRouteHint[] {
  const g = getGraph();
  const project = g.getNodeByName(projectNodeName(cwd));
  if (!project) return [];

  const scores = new Map<string, number>();

  // 1. Floor: every agent registered on the project via WorksOn.
  for (const n of g.neighbors(project.id, "outgoing")) {
    if (n.edge_kind === "WorksOn" && n.node_kind === "Agent") {
      scores.set(n.node_name, (scores.get(n.node_name) ?? 0) + n.weight);
    }
  }

  // 2. Token-match file/concept nodes against the task description.
  const taskTokens = tokenize(task);
  if (taskTokens.size === 0) {
    return normalize(scores);
  }

  const candidates = [...g.nodesByKind("file"), ...g.nodesByKind("concept")];
  const matched = candidates.filter((n) => {
    const nodeTokens = tokenize(n.name);
    for (const t of nodeTokens) if (taskTokens.has(t)) return true;
    return false;
  });

  for (const node of matched) {
    // 3. k-hop bonus: agents reachable within 2 hops of a matched node.
    const hopIds = g.kHop(node.id, 2);
    for (const id of hopIds) {
      if (id === node.id) continue;
      const n = g.getNode(id);
      if (n && n.kind === "Agent") {
        scores.set(n.name, (scores.get(n.name) ?? 0) + 0.3);
      }
    }

    // 4. CompletedBy edges: direct write-back signal (empty until the
    // write-back loop has recorded at least one outcome for this concept).
    for (const n of g.neighbors(node.id, "outgoing")) {
      if (n.edge_kind === "CompletedBy" && n.node_kind === "Agent") {
        scores.set(n.node_name, (scores.get(n.node_name) ?? 0) + n.weight);
      }
    }
  }

  return normalize(scores);
}

function normalize(scores: Map<string, number>): GraphRouteHint[] {
  const max = Math.max(0, ...scores.values());
  const hints = [...scores.entries()].map(([agent, score]) => ({
    agent,
    score: max > 0 ? score / max : 0,
  }));
  hints.sort((a, b) => b.score - a.score);
  return hints;
}
