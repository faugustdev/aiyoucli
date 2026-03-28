/**
 * GCC tools — Git Context Controller.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { execSync } from "node:child_process";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8", timeout: 10000 }).trim();
  } catch {
    return "";
  }
}

export const gccTools: MCPTool[] = [
  {
    name: "git_context",
    description: "Get current git context — branch, status, recent commits, staged changes",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const branch = git("rev-parse --abbrev-ref HEAD");
      const status = git("status --porcelain");
      const log = git("log --oneline -10");
      const diff = git("diff --stat");
      const staged = git("diff --cached --stat");

      return json({
        branch,
        modified_files: status.split("\n").filter(Boolean).length,
        status: status || "(clean)",
        recent_commits: log.split("\n").filter(Boolean),
        unstaged_changes: diff || "(none)",
        staged_changes: staged || "(none)",
      });
    },
  },
];
