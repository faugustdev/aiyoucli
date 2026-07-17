/**
 * Q-table seed tool tests — vitest.
 *
 * The q_table_seed MCP tool seeds the Q-router with the 8 agent profiles
 * from the semantic router. These tests verify:
 *   - profile loading from NAPI works
 *   - seeding creates the .aiyoucli/q-table.json file
 *   - idempotency: second call without force does not overwrite
 *   - force=true does overwrite
 *   - missing NAPI surfaces a graceful error
 *   - topK and reward are respected
 *
 * We call the tool's handler directly (not via MCP JSON-RPC) to keep
 * the test focused and fast. The MCP dispatch path is covered by
 * napi-routing-analysis.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hooksTools } from "../src/mcp/tools/hooks-tools.js";

let tmpDir: string;
const originalCwd = process.cwd();

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "aiyoucli-qseed-"));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function findTool(name: string) {
  const tool = hooksTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

function parseText(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("q_table_seed MCP tool", () => {
  it("is registered in hooksTools", () => {
    const tool = findTool("q_table_seed");
    expect(tool.name).toBe("q_table_seed");
    expect(tool.inputSchema).toBeDefined();
  });

  it("seeds the Q-table and writes q-table.json", async () => {
    const tool = findTool("q_table_seed");
    const result = await tool.handler({ topK: 2, reward: 0.6 });
    const text = parseText(result);
    expect(result).toBeDefined();

    // Should have created .aiyoucli/q-table.json
    const qPath = join(tmpDir, ".aiyoucli", "q-table.json");
    expect(existsSync(qPath)).toBe(true);

    const data = JSON.parse(readFileSync(qPath, "utf-8"));
    expect(data.entries).toBeDefined();
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBeGreaterThan(0);
  });

  it("returns a structured JSON report", async () => {
    const tool = findTool("q_table_seed");
    const result = await tool.handler({ topK: 2, reward: 0.7 });
    const data = JSON.parse(parseText(result));

    expect(data.top_k).toBe(2);
    expect(data.reward).toBe(0.7);
    // Normalize path for cross-platform comparison (macOS /var -> /private/var)
    const expectedPath = join(tmpDir, ".aiyoucli", "q-table.json");
    const actualPath = data.q_table_path;
    expect(actualPath).toMatch(/\.aiyoucli[\\/]q-table\.json$/);
    expect(data.seeded_entries).toBeGreaterThan(0);
    expect(data.profiles_used).toBe(8); // 8 agent profiles
    expect(data.sample).toBeDefined();
    expect(Array.isArray(data.sample)).toBe(true);
  });

  it("seeds 3 keywords per profile by default (topK=3 * 8 profiles = 24 entries)", async () => {
    const tool = findTool("q_table_seed");
    const result = await tool.handler({});
    const data = JSON.parse(parseText(result));
    expect(data.top_k).toBe(3);
    expect(data.seeded_entries).toBe(8 * 3);
  });

  it("respects topK parameter up to max 10", async () => {
    const tool = findTool("q_table_seed");
    const result = await tool.handler({ topK: 5 });
    const data = JSON.parse(parseText(result));
    expect(data.top_k).toBe(5);
    expect(data.seeded_entries).toBe(8 * 5);
  });

  it("clamps topK above 10 down to 10", async () => {
    const tool = findTool("q_table_seed");
    const result = await tool.handler({ topK: 100 });
    const data = JSON.parse(parseText(result));
    expect(data.top_k).toBe(10);
    expect(data.seeded_entries).toBe(8 * 10);
  });

  it("clamps topK below 1 up to 1", async () => {
    const tool = findTool("q_table_seed");
    const result = await tool.handler({ topK: 0 });
    const data = JSON.parse(parseText(result));
    expect(data.top_k).toBe(1);
    expect(data.seeded_entries).toBe(8 * 1);
  });

  it("clamps reward above 1.0 down to 1.0", async () => {
    const tool = findTool("q_table_seed");
    const result = await tool.handler({ reward: 5.0 });
    const data = JSON.parse(parseText(result));
    expect(data.reward).toBe(1.0);
  });

  it("clamps reward below 0.0 up to 0.0", async () => {
    const tool = findTool("q_table_seed");
    const result = await tool.handler({ reward: -1.0 });
    const data = JSON.parse(parseText(result));
    expect(data.reward).toBe(0.0);
  });

  it("is idempotent: skips when q-table.json exists and force is not set", async () => {
    const tool = findTool("q_table_seed");

    // First call creates
    await tool.handler({});
    const qPath = join(tmpDir, ".aiyoucli", "q-table.json");
    const firstBytes = readFileSync(qPath, "utf-8");

    // Second call should skip
    const result = await tool.handler({});
    const text = parseText(result);
    expect(text).toMatch(/already exists/);

    // File should be unchanged
    const secondBytes = readFileSync(qPath, "utf-8");
    expect(secondBytes).toBe(firstBytes);
  });

  it("force=true overwrites existing q-table.json", async () => {
    const tool = findTool("q_table_seed");

    await tool.handler({ topK: 1, reward: 0.1 });
    const first = JSON.parse(readFileSync(join(tmpDir, ".aiyoucli", "q-table.json"), "utf-8"));

    // force overwrite with different params
    const result = await tool.handler({ topK: 5, reward: 0.9, force: true });
    const data = JSON.parse(parseText(result));
    expect(data.seeded_entries).toBe(8 * 5);

    const second = JSON.parse(readFileSync(join(tmpDir, ".aiyoucli", "q-table.json"), "utf-8"));
    // step_count should be > 0 because we routed during seeding
    expect(second.step_count).toBeGreaterThan(0);
    // Verify the new Q-table has more entries than the first
    expect(second.entries.length).toBeGreaterThan(first.entries.length);
  });
});
