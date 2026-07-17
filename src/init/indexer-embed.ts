/**
 * Parallel embedding and storage for project chunks.
 * 
 * Embeds chunks using the keyword-based embedding (8-dim) and stores them
 * in the vector database. Processes up to 8 chunks in parallel to balance
 * throughput and resource usage.
 */

import { callTool } from "../mcp/client.js";
import type { Chunk } from "./indexer-chunk.js";

export interface EmbedProgress {
  total: number;
  completed: number;
  failed: number;
  rate: number; // chunks per second
}

export type ProgressCallback = (progress: EmbedProgress) => void;

const MAX_CONCURRENT = 8;

/**
 * Embed a single chunk using keyword-based embedding.
 * 
 * @param chunk - Chunk to embed
 * @returns 8-dimensional embedding vector, or null on failure
 */
async function embedChunk(chunk: Chunk): Promise<number[] | null> {
  try {
    const result = await callTool("embed", {
      type: "keyword",
      text: chunk.content,
    });
    
    if (result.isError) return null;
    
    const text = result.content[0]?.text ?? "";
    const vector = JSON.parse(text);
    
    if (!Array.isArray(vector) || vector.length !== 8) {
      return null;
    }
    
    return vector;
  } catch {
    return null;
  }
}

/**
 * Store a chunk with its embedding in the vector database.
 * 
 * @param chunk - Chunk metadata
 * @param vector - Embedding vector
 * @returns true if stored successfully
 */
async function storeChunk(chunk: Chunk, vector: number[]): Promise<boolean> {
  try {
    const result = await callTool("memory_store", {
      vector,
      id: chunk.hash,
      metadata: {
        path: chunk.path,
        offset: chunk.offset,
        content_length: chunk.content.length,
      },
    });
    
    return !result.isError;
  } catch {
    return false;
  }
}

/**
 * Embed and store chunks in parallel.
 * 
 * @param chunks - Array of chunks to process
 * @param onProgress - Optional callback for progress updates
 * @returns Number of successfully stored chunks
 */
export async function embedAndStoreChunks(
  chunks: Chunk[],
  onProgress?: ProgressCallback
): Promise<number> {
  const total = chunks.length;
  let completed = 0;
  let failed = 0;
  const startTime = Date.now();
  
  const reportProgress = () => {
    if (onProgress) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = elapsed > 0 ? completed / elapsed : 0;
      onProgress({ total, completed, failed, rate });
    }
  };
  
  // Process chunks in batches of MAX_CONCURRENT
  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT);
    
    const results = await Promise.all(
      batch.map(async (chunk) => {
        const vector = await embedChunk(chunk);
        if (!vector) return false;
        
        const stored = await storeChunk(chunk, vector);
        return stored;
      })
    );
    
    for (const success of results) {
      if (success) {
        completed++;
      } else {
        failed++;
      }
    }
    
    reportProgress();
  }
  
  return completed;
}

/**
 * Embed and store a single chunk.
 * 
 * @param chunk - Chunk to process
 * @returns true if successfully embedded and stored
 */
export async function embedAndStoreChunk(chunk: Chunk): Promise<boolean> {
  const vector = await embedChunk(chunk);
  if (!vector) return false;
  
  return storeChunk(chunk, vector);
}
