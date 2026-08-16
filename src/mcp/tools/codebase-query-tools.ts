/**
 * Codebase read-only inspection — status/search/trace/changes/cypher/
 * schema/snippet/architecture. Secondary (MCP-protocol) exposure; see
 * codebase-project-tools.ts's header comment for why `aiyoucli codebase
 * ...` (the CLI) is the primary interface for this capability.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import {
  projectStatus,
  searchCodebase,
  tracePath,
  detectChanges,
  queryGraph,
  graphSchema,
  codeSnippet,
  architecture,
} from "../../napi/codebase.js";

function text(t: string): MCPToolResult {
  return { content: [{ type: "text", text: t }] };
}
function json(d: unknown): MCPToolResult {
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
}

export const codebaseQueryTools: MCPTool[] = [
  {
    name: "codebase_query",
    description:
      "Read-only codebase inspection. mode=status: project stats+schema. " +
      "mode=search: BM25 or name-pattern search. mode=trace: call-graph trace from a function. " +
      "mode=changes: count of files with a tracked hash (not a git diff). " +
      "mode=cypher: run a Cypher-like query (MATCH (a:Label)-[:EDGE]->(b:Label) ... RETURN ...). " +
      "mode=schema: node labels + edge types. mode=snippet: source of a qualified symbol. " +
      "mode=architecture: clustered architecture overview.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["status", "search", "trace", "changes", "cypher", "schema", "snippet", "architecture"],
        },
        project: { type: "string", description: "Project name (required for every mode)" },
        query: { type: "string", description: "BM25 query (mode=search) or Cypher query (mode=cypher)" },
        name_pattern: { type: "string", description: "Regex name pattern (mode=search, alternative to query)" },
        label: { type: "string", description: "Node label filter, used with name_pattern (mode=search)" },
        limit: { type: "number", description: "Result cap (mode=search, default 200)" },
        function_name: { type: "string", description: "Qualified function name to trace from (mode=trace)" },
        direction: {
          type: "string",
          enum: ["callers", "callees", "both"],
          description: "Trace direction (mode=trace, default both)",
        },
        depth: { type: "number", description: "Trace depth (mode=trace, default 3)" },
        max_rows: { type: "number", description: "Row cap (mode=cypher, default 1000)" },
        qualified_name: { type: "string", description: "Fully qualified symbol name (mode=snippet)" },
        aspects: {
          type: "array",
          items: { type: "string" },
          description: "Architecture aspects filter (mode=architecture — accepted for continuity, currently unused upstream)",
        },
      },
      required: ["mode", "project"],
    },
    handler: async (input) => {
      const mode = input.mode as string;
      const project = input.project as string | undefined;
      if (!project) return text("Missing 'project'");
      try {
        switch (mode) {
          case "status": {
            const result = projectStatus(project);
            return result ? json(result) : text(`Project not indexed: ${project}`);
          }
          case "search": {
            if (!input.query && !input.name_pattern) {
              return text("Missing 'query' or 'name_pattern' for mode=search");
            }
            return json(
              searchCodebase(
                project,
                input.query as string | undefined,
                input.name_pattern as string | undefined,
                input.label as string | undefined,
                input.limit as number | undefined
              )
            );
          }
          case "trace": {
            if (!input.function_name) return text("Missing 'function_name' for mode=trace");
            return json(
              tracePath(
                project,
                input.function_name as string,
                input.direction as string | undefined,
                input.depth as number | undefined
              )
            );
          }
          case "changes":
            return json(detectChanges(project));
          case "cypher": {
            if (!input.query) return text("Missing 'query' for mode=cypher");
            return json(queryGraph(project, input.query as string, input.max_rows as number | undefined));
          }
          case "schema":
            return json(graphSchema(project));
          case "snippet": {
            if (!input.qualified_name) return text("Missing 'qualified_name' for mode=snippet");
            const result = codeSnippet(project, input.qualified_name as string);
            return result ? json(result) : text(`No code found for: ${input.qualified_name}`);
          }
          case "architecture":
            return json(architecture(project, input.aspects as string[] | undefined));
          default:
            return text(
              `Unknown mode: ${mode}. Valid: status, search, trace, changes, cypher, schema, snippet, architecture`
            );
        }
      } catch (err) {
        return text(`codebase_query error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
];
