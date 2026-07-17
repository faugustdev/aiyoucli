/**
 * File chunking for project indexing.
 * 
 * Splits files into chunks of ~2000 characters with 200 character overlap.
 * This provides enough context for embeddings while keeping chunks manageable.
 */

import { readFileSync } from "node:fs";

export interface Chunk {
  path: string;
  offset: number;
  content: string;
  hash: string;
}

const CHUNK_SIZE = 2000;
const OVERLAP = 200;

/**
 * Simple hash function for chunk deduplication.
 * Uses FNV-1a for speed (not cryptographic).
 */
function hashString(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Chunk a file into overlapping segments.
 * 
 * @param path - File path (for metadata)
 * @param content - File content
 * @returns Array of chunks with path, offset, content, and hash
 */
export function chunkFile(path: string, content: string): Chunk[] {
  if (content.length === 0) return [];
  
  const chunks: Chunk[] = [];
  let offset = 0;
  
  while (offset < content.length) {
    const end = Math.min(offset + CHUNK_SIZE, content.length);
    const chunkContent = content.slice(offset, end);
    
    chunks.push({
      path,
      offset,
      content: chunkContent,
      hash: hashString(`${path}:${offset}:${chunkContent}`),
    });
    
    if (end >= content.length) break;
    offset += CHUNK_SIZE - OVERLAP;
  }
  
  return chunks;
}

/**
 * Read and chunk a file from disk.
 * 
 * @param path - Absolute file path
 * @returns Array of chunks, or empty array if file cannot be read
 */
export function chunkFileFromDisk(path: string): Chunk[] {
  try {
    const content = readFileSync(path, "utf-8");
    return chunkFile(path, content);
  } catch {
    return [];
  }
}

/**
 * Chunk multiple files in parallel.
 * 
 * @param paths - Array of absolute file paths
 * @returns Array of all chunks from all files
 */
export function chunkFilesFromDisk(paths: string[]): Chunk[] {
  const allChunks: Chunk[] = [];
  for (const path of paths) {
    allChunks.push(...chunkFileFromDisk(path));
  }
  return allChunks;
}
