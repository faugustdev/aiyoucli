/**
 * ESM soundness sweep over the NAPI-backed MCP tools — vitest.
 *
 * The package is `"type": "module"`, so `require` does not exist at runtime.
 * Five tool modules called it anyway, each inside a `try/catch` that swallowed
 * the resulting ReferenceError: `embed` silently answered "engine not
 * available" (which killed project indexing outright), `stats` returned
 * "require is not defined", and `route` quietly degraded to its fallback.
 *
 * None of those files had a single test importing them, which is why it went
 * unnoticed through several releases. This sweep is deliberately shallow and
 * broad: it invokes each handler once and fails on the class of error meaning
 * "this module cannot run in this module system at all".
 *
 * Scope note: only read-only tools are swept. Tools that write to disk, spawn
 * processes or touch git are listed in MUTATING below and skipped, so running
 * the suite never mutates the working tree.
 */

import { describe, it, expect } from "vitest";
import type { MCPTool } from "../src/types.js";

import { embedTools } from "../src/mcp/tools/embed-tools.js";
import { statsTools } from "../src/mcp/tools/stats-tools.js";
import { astTools } from "../src/mcp/tools/ast-tools.js";
import { proxyTools } from "../src/mcp/tools/proxy-tools.js";
import { routeTools } from "../src/mcp/tools/route-tools.js";
import { discoveryTools } from "../src/mcp/tools/discovery-tools.js";
import { graphTools } from "../src/mcp/tools/graph-tools.js";
import { distillerTools } from "../src/mcp/tools/distiller-tools.js";
import { memoryTools } from "../src/mcp/tools/memory-tools.js";

/** Tools with side effects — excluded so the sweep stays read-only. */
const MUTATING = new Set([
  "memory_init",
  "memory_store",
  "memory_delete",
  "graph_add_node",
  "graph_add_edge",
  "graph_remove_node",
  "metrics",
  "proxy_block_origin",
  "proxy_unblock_origin",
  "proxy_clear_cache",
]);

const SWEPT: MCPTool[] = [
  ...embedTools,
  ...statsTools,
  ...astTools,
  ...proxyTools,
  ...routeTools,
  ...discoveryTools,
  ...graphTools,
  ...distillerTools,
  ...memoryTools,
].filter((t) => !MUTATING.has(t.name));

/** A minimal input satisfying the tool's declared required properties. */
function minimalInput(tool: MCPTool): Record<string, unknown> {
  const schema = tool.inputSchema;
  const input: Record<string, unknown> = {};

  for (const key of schema.required ?? []) {
    const prop = schema.properties[key] as
      | { type?: string; enum?: unknown[] }
      | undefined;
    if (prop?.enum?.length) {
      input[key] = prop.enum[0];
      continue;
    }
    switch (prop?.type) {
      case "number": input[key] = 1; break;
      case "boolean": input[key] = true; break;
      case "array": input[key] = []; break;
      case "object": input[key] = {}; break;
      default: input[key] = "probe";
    }
  }
  return input;
}

/**
 * Errors meaning the module is broken as a module, as opposed to a tool
 * legitimately rejecting synthetic input or needing absent infrastructure.
 */
const MODULE_LEVEL_ERROR =
  /require is not defined|Cannot use import statement|exports is not defined|__dirname is not defined|Dynamic require of/i;

describe("MCP tool surface — ESM soundness", () => {
  it("sweeps a meaningful number of tools", () => {
    expect(SWEPT.length).toBeGreaterThan(10);
  });

  it.each(SWEPT.map((t) => [t.name, t] as const))(
    "%s runs without a module-system error",
    async (_name, tool) => {
      let thrown: unknown;
      let result;
      try {
        result = await tool.handler(minimalInput(tool));
      } catch (err) {
        thrown = err;
      }

      if (thrown) {
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        expect(message).not.toMatch(MODULE_LEVEL_ERROR);
        return; // a domain-level throw is acceptable here
      }

      // A tool may legitimately report an error result; it must not be one
      // caused by the module system.
      expect(result?.content?.[0]?.text ?? "").not.toMatch(MODULE_LEVEL_ERROR);
    }
  );
});
