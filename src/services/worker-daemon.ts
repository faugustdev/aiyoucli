/**
 * EventEmitter-based daemon that polls the worker queue
 * and dispatches tasks to registered listeners.
 */

import { EventEmitter } from "node:events";
import { WorkerQueue, type TaskPriority } from "./worker-queue.js";

// ── Constants ────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL = 1000;

const WORKER_TYPES = [
  "optimize",
  "audit",
  "testgaps",
  "document",
  "map",
  "deepdive",
  "benchmark",
] as const;

export type WorkerType = (typeof WORKER_TYPES)[number];

// ── Daemon ───────────────────────────────────────────────────────

export interface WorkerDaemonOptions {
  pollInterval?: number;
}

export interface WorkerDaemonStatus {
  running: boolean;
  processed: number;
  failed: number;
  queueSize: number;
}

export class WorkerDaemon extends EventEmitter {
  private queue = new WorkerQueue();
  private pollInterval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private processed = 0;
  private failed = 0;

  constructor(options?: WorkerDaemonOptions) {
    super();
    this.pollInterval = options?.pollInterval ?? DEFAULT_POLL_INTERVAL;
  }

  /** Start polling the queue for pending tasks. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.poll(), this.pollInterval);
    this.emit("daemon:start");
  }

  /** Stop polling. In-flight tasks are not cancelled. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.emit("daemon:stop");
  }

  /** Whether the daemon is currently polling. */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Enqueue a task for processing.
   * Returns the generated task ID.
   */
  dispatch(
    type: string,
    payload: Record<string, unknown>,
    priority: TaskPriority | string = "normal"
  ): string {
    const id = this.queue.enqueue({
      type,
      payload,
      priority: priority as TaskPriority,
    });
    this.emit("task:enqueued", { id, type, priority });
    return id;
  }

  /** Current daemon and queue statistics. */
  status(): WorkerDaemonStatus {
    return {
      running: this.running,
      processed: this.processed,
      failed: this.failed,
      queueSize: this.queue.size(),
    };
  }

  /** Expose the internal queue for direct inspection. */
  getQueue(): WorkerQueue {
    return this.queue;
  }

  // ── Private ──────────────────────────────────────────────────

  private poll(): void {
    const task = this.queue.dequeue();
    if (!task) return;

    this.emit("task:start", task);

    try {
      // Emit a type-specific event so listeners can handle it
      this.emit(`worker:${task.type}`, task.payload, task);
      this.queue.complete(task.id);
      this.processed++;
      this.emit("task:complete", task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.queue.fail(task.id, message);
      this.failed++;
      this.emit("task:error", { task, error: message });
    }
  }
}
