/**
 * Session tools — session state persistence.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SESSIONS_DIR = join(process.cwd(), ".aiyoucli", "sessions");

interface Session {
  id: string;
  status: "active" | "ended";
  startedAt: number;
  endedAt?: number;
  metadata: Record<string, unknown>;
}

function sessionPath(id: string): string { return join(SESSIONS_DIR, `${id}.json`); }

function loadSession(id: string): Session | null {
  const path = sessionPath(id);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function saveSession(session: Session): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2));
}

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const sessionTools: MCPTool[] = [
  {
    name: "session_start",
    description: "Start a new session or resume an existing one",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Session ID (auto-generated if omitted)" },
      },
    },
    handler: async (input) => {
      const id = (input.id as string) || `session-${Date.now().toString(36)}`;
      const existing = loadSession(id);
      if (existing && existing.status === "active") {
        return json({ id, status: "resumed", startedAt: existing.startedAt });
      }
      const session: Session = { id, status: "active", startedAt: Date.now(), metadata: {} };
      saveSession(session);
      return json({ id, status: "started", startedAt: session.startedAt });
    },
  },
  {
    name: "session_end",
    description: "End the current session",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (input) => {
      const session = loadSession(input.id as string);
      if (!session) return text(`Session not found: ${input.id}`);
      session.status = "ended";
      session.endedAt = Date.now();
      saveSession(session);
      return text(`Session ended: ${session.id} (${Math.round((session.endedAt - session.startedAt) / 1000)}s)`);
    },
  },
  {
    name: "session_list",
    description: "List all sessions",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      if (!existsSync(SESSIONS_DIR)) return json([]);
      const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
      const sessions = files.map((f) => {
        try { return JSON.parse(readFileSync(join(SESSIONS_DIR, f), "utf-8")); } catch { return null; }
      }).filter(Boolean);
      return json(sessions);
    },
  },
];
