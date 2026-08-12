/**
 * Indexer failure reporting — vitest.
 *
 * `embedAndStoreChunks` used to return a bare count, and `embedChunk`
 * collapsed every failure mode into `null`. When the embed tool started
 * answering with a plain string, indexing stored nothing and `init` reported
 * "0 chunks" with no reason — the symptom that hid the real bug for releases.
 *
 * These tests pin the reporting contract: a failed run must say why.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const callTool = vi.fn();

vi.mock("../src/mcp/client.js", () => ({
  callTool: (...args: unknown[]) => callTool(...args),
}));

vi.mock("../src/mcp/tools/memory-tools.js", () => ({
  loadConfig: () => ({ path: null, dimensions: 4, hnsw: true }),
}));

const { embedAndStoreChunks } = await import("../src/init/indexer-embed.js");

const chunk = (hash: string) => ({
  hash,
  path: `/tmp/${hash}.ts`,
  offset: 0,
  content: `content of ${hash}`,
});

beforeEach(() => {
  callTool.mockReset();
});

describe("embedAndStoreChunks failure reporting", () => {
  it("surfaces a non-JSON embed response instead of swallowing it", async () => {
    callTool.mockResolvedValue({
      content: [{ type: "text", text: "Embed engine not available: binary missing" }],
    });

    const outcome = await embedAndStoreChunks([chunk("a"), chunk("b")]);

    expect(outcome.stored).toBe(0);
    expect(outcome.failed).toBe(2);
    expect(outcome.failureReason).toContain("Embed engine not available");
  });

  it("reports a dimension mismatch with both widths", async () => {
    callTool.mockImplementation(async (name: string) => {
      if (name === "embed") {
        // 3 numbers against a 4-dimensional collection
        return { content: [{ type: "text", text: "[1,2,3]" }] };
      }
      return { content: [{ type: "text", text: "stored" }] };
    });

    const outcome = await embedAndStoreChunks([chunk("a")]);

    expect(outcome.stored).toBe(0);
    expect(outcome.failureReason).toContain("3d");
    expect(outcome.failureReason).toContain("4d");
  });

  it("propagates a memory_store error", async () => {
    callTool.mockImplementation(async (name: string) => {
      if (name === "embed") {
        return { content: [{ type: "text", text: "[1,2,3,4]" }] };
      }
      return { content: [{ type: "text", text: "disk is full" }], isError: true };
    });

    const outcome = await embedAndStoreChunks([chunk("a")]);

    expect(outcome.stored).toBe(0);
    expect(outcome.failureReason).toContain("disk is full");
  });

  it("counts successes and keeps failureReason empty on a clean run", async () => {
    callTool.mockImplementation(async (name: string) => {
      if (name === "embed") {
        return { content: [{ type: "text", text: "[1,2,3,4]" }] };
      }
      return { content: [{ type: "text", text: "stored" }] };
    });

    const outcome = await embedAndStoreChunks([chunk("a"), chunk("b"), chunk("c")]);

    expect(outcome.stored).toBe(3);
    expect(outcome.failed).toBe(0);
    expect(outcome.failureReason).toBeUndefined();
  });

  it("reports the dominant reason when failures differ", async () => {
    let call = 0;
    callTool.mockImplementation(async (name: string) => {
      if (name === "embed") {
        call++;
        // one odd failure, then two of the same kind
        if (call === 1) return { content: [{ type: "text", text: "[1,2]" }] };
        return { content: [{ type: "text", text: "engine exploded" }], isError: true };
      }
      return { content: [{ type: "text", text: "stored" }] };
    });

    const outcome = await embedAndStoreChunks([chunk("a"), chunk("b"), chunk("c")]);

    expect(outcome.failed).toBe(3);
    expect(outcome.distinctFailureReasons).toBe(2);
    expect(outcome.failureReason).toContain("engine exploded");
  });
});
