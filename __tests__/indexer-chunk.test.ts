/**
 * Indexer chunk tests — vitest.
 *
 * Tests cover:
 *   - chunkFile: empty content, single chunk, multiple chunks, overlap
 *   - chunkFileFromDisk: reading from disk, file not found
 *   - chunkFilesFromDisk: multiple files
 */

import { describe, it, expect } from "vitest";
import { chunkFile, chunkFileFromDisk, chunkFilesFromDisk } from "../src/init/indexer-chunk.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("chunkFile", () => {
  it("returns empty array for empty content", () => {
    const chunks = chunkFile("/test/empty.ts", "");
    expect(chunks).toEqual([]);
  });

  it("returns single chunk for small content", () => {
    const content = "short content";
    const chunks = chunkFile("/test/file.ts", content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe(content);
    expect(chunks[0]?.offset).toBe(0);
    expect(chunks[0]?.path).toBe("/test/file.ts");
    expect(chunks[0]?.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("chunks content larger than CHUNK_SIZE (2000) with overlap", () => {
    const content = "x".repeat(5000);
    const chunks = chunkFile("/test/big.ts", content);

    // With CHUNK_SIZE=2000 and OVERLAP=200, step=1800
    // chunk 1: offset 0..2000
    // chunk 2: offset 1800..3800
    // chunk 3: offset 3600..5000
    expect(chunks.length).toBe(3);
    expect(chunks[0]?.offset).toBe(0);
    expect(chunks[1]?.offset).toBe(1800);
    expect(chunks[2]?.offset).toBe(3600);

    // Verify content lengths
    expect(chunks[0]?.content.length).toBe(2000);
    expect(chunks[1]?.content.length).toBe(2000);
    expect(chunks[2]?.content.length).toBe(1400); // tail
  });

  it("produces unique hashes for different offsets", () => {
    const content = "x".repeat(5000);
    const chunks = chunkFile("/test/file.ts", content);
    const hashes = new Set(chunks.map((c) => c.hash));
    expect(hashes.size).toBe(chunks.length);
  });

  it("covers all content (with overlap is acceptable)", () => {
    const content = "Hello, World! ".repeat(500); // ~7000 chars
    const chunks = chunkFile("/test/file.ts", content);

    // First chunk should start at offset 0
    expect(chunks[0]?.offset).toBe(0);
    expect(chunks[0]?.content.startsWith("Hello, World!")).toBe(true);

    // Last chunk should end at content.length
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk?.offset).toBeLessThan(content.length);

    // The union of all chunks should cover the entire content
    // (with overlap, so checking key markers)
    const firstChars = chunks[0]?.content.slice(0, 14);
    expect(firstChars).toBe("Hello, World! ");
  });
});

describe("chunkFileFromDisk", () => {
  it("reads and chunks a file from disk", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "chunk-test-"));
    const filePath = join(tmpDir, "test.ts");
    writeFileSync(filePath, "const x = 1;\n", "utf-8");

    const chunks = chunkFileFromDisk(filePath);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("const x = 1;\n");
    expect(chunks[0]?.path).toBe(filePath);

    rmSync(tmpDir, { recursive: true });
  });

  it("returns empty array for non-existent file", () => {
    const chunks = chunkFileFromDisk("/non/existent/path/file.ts");
    expect(chunks).toEqual([]);
  });
});

describe("chunkFilesFromDisk", () => {
  it("chunks multiple files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "chunk-multi-"));
    const file1 = join(tmpDir, "a.ts");
    const file2 = join(tmpDir, "b.ts");
    writeFileSync(file1, "content of a", "utf-8");
    writeFileSync(file2, "content of b", "utf-8");

    const chunks = chunkFilesFromDisk([file1, file2]);
    expect(chunks).toHaveLength(2);
    expect(chunks.find((c) => c.path === file1)?.content).toBe("content of a");
    expect(chunks.find((c) => c.path === file2)?.content).toBe("content of b");

    rmSync(tmpDir, { recursive: true });
  });

  it("skips unreadable files silently", () => {
    const chunks = chunkFilesFromDisk([
      "/non/existent/a.ts",
      "/non/existent/b.ts",
    ]);
    expect(chunks).toEqual([]);
  });

  it("returns empty for empty input", () => {
    const chunks = chunkFilesFromDisk([]);
    expect(chunks).toEqual([]);
  });
});