/**
 * Codebase project lifecycle — index/list/delete/export/import. Secondary
 * (MCP-protocol) exposure of the same functions `aiyoucli codebase ...`
 * calls directly via `callTool()` — see src/commands/index.ts's
 * `codebaseCommand`, which is the primary, token-cheap interface for
 * agents with shell access (mcp2cli principle: CLI over always-loaded
 * MCP schemas). This tool exists for MCP-only hosts that can't run Bash.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import {
  indexRepository,
  listProjects,
  deleteProject,
  exportProject,
  importProject,
} from "../../napi/codebase.js";

function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}
function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}

export const codebaseProjectTools: MCPTool[] = [
  {
    name: "codebase_project",
    description:
      "Codebase project lifecycle. mode=index: index a repo into the knowledge graph. " +
      "mode=list: list indexed projects. mode=delete: remove a project's index. " +
      "mode=export: archive a project. mode=import: restore a project from an archive.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["index", "list", "delete", "export", "import"] },
        repo_path: { type: "string", description: "Path to the repository (mode=index)" },
        index_mode: {
          type: "string",
          enum: ["full", "moderate", "fast", "cross-repo-intelligence"],
          description: "Indexing depth (mode=index, default full)",
        },
        project: { type: "string", description: "Project name (mode=delete, mode=export)" },
        out_dir: { type: "string", description: "Archive output directory (mode=export, optional)" },
        archive: { type: "string", description: "Archive file path (mode=import)" },
      },
      required: ["mode"],
    },
    handler: async (input) => {
      const mode = input.mode as string;
      try {
        switch (mode) {
          case "index": {
            if (!input.repo_path) return text("Missing 'repo_path' for mode=index");
            return json(indexRepository(input.repo_path as string, input.index_mode as string | undefined));
          }
          case "list":
            return json(listProjects());
          case "delete": {
            if (!input.project) return text("Missing 'project' for mode=delete");
            return json(deleteProject(input.project as string));
          }
          case "export": {
            if (!input.project) return text("Missing 'project' for mode=export");
            return json(exportProject(input.project as string, input.out_dir as string | undefined));
          }
          case "import": {
            if (!input.archive) return text("Missing 'archive' for mode=import");
            return json(importProject(input.archive as string));
          }
          default:
            return text(`Unknown mode: ${mode}. Valid: index, list, delete, export, import`);
        }
      } catch (err) {
        return text(`codebase_project error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
];
