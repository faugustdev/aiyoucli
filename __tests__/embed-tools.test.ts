/**
 * Embed tool contract — vitest.
 *
 * Guards the two failures that between them left the vector index empty:
 *
 *  1. The tool returned a human-readable string with no `isError` flag, so
 *     `indexer-embed` could not distinguish "engine down" from "bad chunk"
 *     and reported an unexplained count of zero.
 *  2. The embedding width was assumed to be 8 (from a stale Rust doc comment)
 *     while the embedder really returns 128, so every insert was rejected by
 *     the collection's dimension check.
 *
 * The width itself is deliberately not asserted as a literal — the point is
 * that whatever the embedder emits is what the collection is sized to.
 */

import { describe, it, expect } from "vitest";
import { embedTools } from "../src/mcp/tools/embed-tools.js";

const embed = embedTools.find((t) => t.name === "embed")!;

async function embedKeyword(text: string) {
  return embed.handler({ type: "keyword", text });
}

describe("embed tool", () => {
  it("returns a JSON array of numbers for keyword embeddings", async () => {
    const result = await embedKeyword("vector database search");

    expect(result.isError ?? false).toBe(false);
    const vector = JSON.parse(result.content[0]!.text!);
    expect(Array.isArray(vector)).toBe(true);
    expect(vector.length).toBeGreaterThan(0);
    for (const value of vector) expect(typeof value).toBe("number");
  });

  it("is deterministic and stable in width across inputs", async () => {
    const [a, b, c] = await Promise.all([
      embedKeyword("alpha"),
      embedKeyword("alpha"),
      embedKeyword("a completely different sentence about testing"),
    ]);

    const va = JSON.parse(a.content[0]!.text!);
    const vb = JSON.parse(b.content[0]!.text!);
    const vc = JSON.parse(c.content[0]!.text!);

    expect(va).toEqual(vb);
    // A collection is sized once from a probe, so every later embedding must
    // match that width regardless of the text.
    expect(vc.length).toBe(va.length);
  });

  it("flags unknown types as errors rather than returning bare text", async () => {
    const result = await embed.handler({ type: "nonsense", text: "x" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("nonsense");
  });

  it("never reports an error result without the isError flag", async () => {
    // Any payload that fails JSON.parse must be accompanied by isError, or
    // callers silently swallow it.
    const result = await embedKeyword("some text");
    let parsed = true;
    try {
      JSON.parse(result.content[0]!.text!);
    } catch {
      parsed = false;
    }
    expect(parsed || result.isError === true).toBe(true);
  });
});
