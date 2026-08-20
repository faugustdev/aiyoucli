/**
 * A2A client — fetch a remote Agent Card, send a message and wait for the
 * task to complete. Secondary (MCP-protocol) exposure; see
 * codebase-project-tools.ts's header comment for why `aiyoucli a2a ...`
 * (the CLI) is the primary interface for this capability (mcp2cli).
 *
 * Server-side A2A (`aiyoucli a2a serve`, exposing aiyou-team's own agents)
 * isn't wired here yet — it needs the headless-invocation spike from plan
 * Fase 3 first. This tool only covers the client direction (Fase 2).
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { getAgentCard, sendMessage, pollTaskUntilTerminal } from "../../services/a2a/client.js";
import { A2AError } from "../../services/a2a/types.js";

function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}
function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}
function errorResult(err: unknown): MCPToolResult {
  const message = err instanceof A2AError ? `[${err.code}] ${err.message}` : err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}

export const a2aTools: MCPTool[] = [
  {
    name: "a2a",
    description:
      "A2A (Agent2Agent) protocol client. mode=card: fetch a remote agent's Agent Card. " +
      "mode=call: send a message to a remote A2A agent and wait for the task to complete.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["card", "call"] },
        url: { type: "string", description: "Base URL of the remote A2A server, e.g. http://localhost:4173" },
        message: { type: "string", description: "Text to send (mode=call)" },
        skill_id: { type: "string", description: "Target skill/agent id on the remote card (mode=call, optional)" },
        auth_token: { type: "string", description: "Bearer token, if the remote server requires one" },
        timeout_ms: { type: "number", description: "Poll timeout in ms (mode=call, default 120000)" },
      },
      required: ["mode", "url"],
    },
    handler: async (input) => {
      const mode = input.mode as string;
      const url = input.url as string;
      const authToken = input.auth_token as string | undefined;
      if (!url) return text("Missing 'url'");

      try {
        if (mode === "card") {
          const card = await getAgentCard(url);
          return json(card);
        }

        if (mode === "call") {
          const message = input.message as string | undefined;
          if (!message) return text("Missing 'message' (mode=call)");
          const task = await sendMessage(
            url,
            { text: message, skillId: input.skill_id as string | undefined },
            { authToken }
          );
          const final = task.status.state === "TASK_STATE_SUBMITTED" || task.status.state === "TASK_STATE_WORKING"
            ? await pollTaskUntilTerminal(url, task.id, { authToken, timeoutMs: input.timeout_ms as number | undefined })
            : task;
          return json(final);
        }

        return text(`Unknown mode: ${mode}`);
      } catch (err) {
        return errorResult(err);
      }
    },
  },
];
