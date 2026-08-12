/**
 * Parallel embedding and storage for project chunks.
 *
 * Embeds chunks using the keyword-based embedding and stores them in the
 * vector database. Processes up to 8 chunks in parallel to balance
 * throughput and resource usage.
 *
 * The embedding width is never hardcoded here: it is whatever `memory_init`
 * recorded in .aiyoucli/memory-config.json when it sized the collection.
 */

import { callTool } from "../mcp/client.js";
import { loadConfig } from "../mcp/tools/memory-tools.js";
import type { Chunk } from "./indexer-chunk.js";

export interface EmbedProgress {
  total: number;
  completed: number;
  failed: number;
  rate: number; // chunks per second
}

export type ProgressCallback = (progress: EmbedProgress) => void;

/** Outcome of processing one chunk. Failures carry why, so a run that
 * indexes nothing can say what went wrong instead of just counting. */
type ChunkOutcome = { ok: true } | { ok: false; reason: string };

const MAX_CONCURRENT = 8;

/**
 * Embed a single chunk using keyword-based embedding.
 *
 * @param chunk - Chunk to embed
 * @returns The embedding vector, or the reason it could not be produced
 */
async function embedChunk(
  chunk: Chunk
): Promise<{ ok: true; vector: number[] } | { ok: false; reason: string }> {
  let result;
  try {
    result = await callTool("embed", { type: "keyword", text: chunk.content });
  } catch (err) {
    return { ok: false, reason: `embed tool threw: ${err instanceof Error ? err.message : String(err)}` };
  }

  const payload = result.content[0]?.text ?? "";
  if (result.isError) {
    return { ok: false, reason: payload || "embed tool reported an error" };
  }

  let vector: unknown;
  try {
    vector = JSON.parse(payload);
  } catch {
    // A non-JSON body here means the tool returned a human-readable message
    // without setting isError. Surface it rather than discarding it.
    return { ok: false, reason: `embed returned non-JSON: ${payload.slice(0, 120)}` };
  }

  if (!Array.isArray(vector) || vector.length === 0) {
    return { ok: false, reason: "embed returned an empty or non-array vector" };
  }

  const expected = loadConfig().dimensions;
  if (vector.length !== expected) {
    return {
      ok: false,
      reason: `embedding is ${vector.length}d but the collection is ${expected}d — re-run \`aiyoucli memory init\``,
    };
  }

  return { ok: true, vector: vector as number[] };
}

/**
 * Store a chunk with its embedding in the vector database.
 *
 * @param chunk - Chunk metadata
 * @param vector - Embedding vector
 * @returns ok, or the reason the store failed
 */
async function storeChunk(chunk: Chunk, vector: number[]): Promise<ChunkOutcome> {
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

    if (result.isError) {
      return { ok: false, reason: result.content[0]?.text ?? "memory_store reported an error" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `memory_store threw: ${err instanceof Error ? err.message : String(err)}` };
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
): Promise<EmbedOutcome> {
  const total = chunks.length;
  let completed = 0;
  let failed = 0;
  const failureReasons = new Map<string, number>();
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
      batch.map(async (chunk): Promise<ChunkOutcome> => {
        const embedded = await embedChunk(chunk);
        if (!embedded.ok) return embedded;
        return storeChunk(chunk, embedded.vector);
      })
    );

    for (const result of results) {
      if (result.ok) {
        completed++;
      } else {
        failed++;
        failureReasons.set(result.reason, (failureReasons.get(result.reason) ?? 0) + 1);
      }
    }

    reportProgress();
  }

  // Report the dominant failure so a run that stores nothing explains itself.
  let topReason: string | undefined;
  let topCount = 0;
  for (const [reason, count] of failureReasons) {
    if (count > topCount) {
      topCount = count;
      topReason = reason;
    }
  }

  return {
    stored: completed,
    failed,
    failureReason: topReason,
    distinctFailureReasons: failureReasons.size,
  };
}

export interface EmbedOutcome {
  stored: number;
  failed: number;
  /** The most common failure reason, if anything failed. */
  failureReason?: string;
  distinctFailureReasons: number;
}

/**
 * Embed and store a single chunk.
 *
 * @param chunk - Chunk to process
 * @returns ok, or the reason it failed
 */
export async function embedAndStoreChunk(chunk: Chunk): Promise<ChunkOutcome> {
  const embedded = await embedChunk(chunk);
  if (!embedded.ok) return embedded;

  return storeChunk(chunk, embedded.vector);
}
