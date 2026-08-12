/**
 * Automatic project indexing with git-aware manifest tracking.
 * 
 * Detects if the current directory is a git repository, reads the existing
 * index manifest, and re-indexes only if the commit has changed or no
 * manifest exists. This makes indexing idempotent and fast on subsequent runs.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { chunkFilesFromDisk } from "./indexer-chunk.js";
import { embedAndStoreChunks, type ProgressCallback } from "./indexer-embed.js";

export interface IndexManifest {
  commit: string;
  timestamp: number;
  file_count: number;
  chunk_count: number;
}

export interface IndexResult {
  indexed: boolean;
  reason: string;
  commit?: string;
  file_count?: number;
  chunk_count?: number;
  /** Chunks that could not be embedded or stored. */
  failed_count?: number;
  /** Dominant reason chunks failed, when any did. */
  failure_reason?: string;
  duration_ms?: number;
}

const MANIFEST_PATH = ".aiyoucli/index-manifest.json";

/**
 * Check if the current directory is inside a git repository.
 * 
 * @param cwd - Working directory
 * @returns true if inside a git repo
 */
export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git commit hash.
 * 
 * @param cwd - Working directory
 * @returns Commit hash or null if not in a git repo
 */
export function getGitCommit(cwd: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Read the existing index manifest.
 * 
 * @param cwd - Working directory
 * @returns Manifest or null if not found/invalid
 */
export function readManifest(cwd: string): IndexManifest | null {
  const manifestPath = join(cwd, MANIFEST_PATH);
  
  if (!existsSync(manifestPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as IndexManifest;
    
    // Validate required fields
    if (
      typeof manifest.commit !== "string" ||
      typeof manifest.timestamp !== "number" ||
      typeof manifest.file_count !== "number" ||
      typeof manifest.chunk_count !== "number"
    ) {
      return null;
    }
    
    return manifest;
  } catch {
    return null;
  }
}

/**
 * Write the index manifest.
 * 
 * @param cwd - Working directory
 * @param manifest - Manifest to write
 */
export function writeManifest(cwd: string, manifest: IndexManifest): void {
  const manifestPath = join(cwd, MANIFEST_PATH);
  const manifestDir = join(cwd, ".aiyoucli");
  
  if (!existsSync(manifestDir)) {
    mkdirSync(manifestDir, { recursive: true });
  }
  
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

/**
 * Scan project files for indexing.
 * 
 * Excludes common directories like node_modules, .git, dist, etc.
 * Includes common source file extensions.
 * 
 * @param cwd - Working directory
 * @returns Array of absolute file paths
 */
export function scanProjectFiles(cwd: string): string[] {
  const EXCLUDE_DIRS = new Set([
    "node_modules",
    ".git",
    ".aiyoucli",
    "dist",
    "build",
    "target",
    ".next",
    ".nuxt",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
  ]);
  
  const INCLUDE_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".rs",
    ".go",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
  ]);
  
  const files: string[] = [];
  
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      
      if (stat.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry)) {
          walk(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = entry.substring(entry.lastIndexOf("."));
        if (INCLUDE_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walk(cwd);
  return files;
}

/**
 * Automatically index the project if needed.
 * 
 * @param cwd - Working directory
 * @param onProgress - Optional progress callback
 * @returns Index result with status and metadata
 */
export async function autoIndex(
  cwd: string,
  onProgress?: ProgressCallback
): Promise<IndexResult> {
  const startTime = Date.now();
  
  // Check if this is a git repo
  if (!isGitRepo(cwd)) {
    return {
      indexed: false,
      reason: "Not a git repository",
    };
  }
  
  // Get current commit
  const commit = getGitCommit(cwd);
  if (!commit) {
    return {
      indexed: false,
      reason: "Could not determine git commit",
    };
  }
  
  // Read existing manifest
  const manifest = readManifest(cwd);
  
  // Check if we need to re-index
  if (manifest && manifest.commit === commit) {
    return {
      indexed: false,
      reason: "Index up to date",
      commit,
      file_count: manifest.file_count,
      chunk_count: manifest.chunk_count,
    };
  }
  
  // Scan and chunk files
  const files = scanProjectFiles(cwd);
  const chunks = chunkFilesFromDisk(files);
  
  if (chunks.length === 0) {
    return {
      indexed: false,
      reason: "No files to index",
      commit,
      file_count: 0,
      chunk_count: 0,
    };
  }
  
  // Embed and store chunks
  const outcome = await embedAndStoreChunks(chunks, onProgress);
  const duration_ms = Date.now() - startTime;

  // Nothing landed: do NOT write a manifest. Recording the commit here would
  // make the next run report "Index up to date" and never retry, which is how
  // a broken embedder turned into a permanently empty index.
  if (outcome.stored === 0) {
    return {
      indexed: false,
      reason: outcome.failureReason
        ? `No chunks stored — ${outcome.failureReason}`
        : "No chunks stored",
      commit,
      file_count: files.length,
      chunk_count: 0,
      failed_count: outcome.failed,
      duration_ms,
    };
  }

  // Write new manifest
  const newManifest: IndexManifest = {
    commit,
    timestamp: Date.now(),
    file_count: files.length,
    chunk_count: outcome.stored,
  };

  writeManifest(cwd, newManifest);

  return {
    indexed: true,
    reason: manifest ? "Commit changed" : "Initial index",
    commit,
    file_count: files.length,
    chunk_count: outcome.stored,
    failed_count: outcome.failed,
    failure_reason: outcome.failureReason,
    duration_ms,
  };
}
