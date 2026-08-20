/**
 * Maps aiyou's agent roster to an A2A `AgentCard`.
 *
 * One `AgentCard` == one aiyou-team identity (today: the "aiyou-team"
 * process). Each of the 8 aiyou-team specialists becomes an `AgentSkill` on
 * that one card — callers pick which one they want via `skillId` (see
 * `server.ts`), rather than each specialist getting its own Agent Card / port.
 * Source of truth for the roster is `AGENT_DEFS` in `init/claude-agents.ts`
 * (see that file's header for why it — not `aiyou-team`'s own
 * `agent-teams/constants.ts` — is the one reused here).
 */

import type { AgentDef } from "../../init/claude-agents.js";
import type { AgentCard, AgentSkill } from "./types.js";

const PROTOCOL_VERSION = "1.0";
const DEFAULT_MODES = ["text/plain"];

export function agentDefToSkill(def: AgentDef): AgentSkill {
  return {
    id: def.name,
    name: def.name,
    description: def.description,
    tags: ["aiyou-team", def.tier],
    inputModes: DEFAULT_MODES,
    outputModes: DEFAULT_MODES,
  };
}

export interface BuildAgentCardOptions {
  /** Base URL the server will actually be reachable at, e.g. "http://localhost:4173". */
  url: string;
  /** Roster to publish. Defaults to all of `AGENT_DEFS`. */
  agents: AgentDef[];
  name?: string;
  description?: string;
  version?: string;
}

export function buildAgentCard(opts: BuildAgentCardOptions): AgentCard {
  return {
    name: opts.name ?? "aiyou-team",
    description:
      opts.description ??
      "aiyou-team agent roster (coding-leader, reviewer, codebase-explorer, ...) exposed over A2A.",
    supportedInterfaces: [
      { url: opts.url, protocolBinding: "HTTP+JSON", protocolVersion: PROTOCOL_VERSION },
    ],
    version: opts.version ?? "0.1.0",
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: DEFAULT_MODES,
    defaultOutputModes: DEFAULT_MODES,
    skills: opts.agents.map(agentDefToSkill),
  };
}
