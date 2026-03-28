/**
 * Priority task queue for background workers.
 *
 * Tasks are dequeued by priority (critical > high > normal > low),
 * with FIFO ordering within the same priority level.
 */

// ── Types ────────────────────────────────────────────────────────

export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface WorkerTask {
  id: string;
  type: string;
  priority: TaskPriority;
  payload: Record<string, unknown>;
  createdAt: number;
  status: TaskStatus;
  error?: string;
}

type TaskInput = Omit<WorkerTask, "id" | "createdAt" | "status">;

// ── Constants ────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ── Queue ────────────────────────────────────────────────────────

export class WorkerQueue {
  private tasks: Map<string, WorkerTask> = new Map();

  /** Add a task to the queue. Returns the generated task ID. */
  enqueue(input: TaskInput): string {
    const id = Date.now().toString(36);
    const task: WorkerTask = {
      ...input,
      id,
      createdAt: Date.now(),
      status: "pending",
    };
    this.tasks.set(id, task);
    return id;
  }

  /** Remove and return the highest-priority pending task, or null. */
  dequeue(): WorkerTask | null {
    const task = this.nextPending();
    if (task) {
      task.status = "running";
    }
    return task ?? null;
  }

  /** Return the highest-priority pending task without removing it. */
  peek(): WorkerTask | null {
    return this.nextPending() ?? null;
  }

  /** Number of pending tasks in the queue. */
  size(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === "pending") count++;
    }
    return count;
  }

  /** Return all tasks regardless of status. */
  list(): WorkerTask[] {
    return [...this.tasks.values()];
  }

  /** Mark a task as completed. */
  complete(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "completed";
  }

  /** Mark a task as failed with an optional error message. */
  fail(id: string, error?: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = "failed";
    if (error) task.error = error;
  }

  // ── Private ──────────────────────────────────────────────────

  private nextPending(): WorkerTask | undefined {
    let best: WorkerTask | undefined;

    for (const task of this.tasks.values()) {
      if (task.status !== "pending") continue;
      if (
        !best ||
        PRIORITY_ORDER[task.priority] < PRIORITY_ORDER[best.priority] ||
        (PRIORITY_ORDER[task.priority] === PRIORITY_ORDER[best.priority] &&
          task.createdAt < best.createdAt)
      ) {
        best = task;
      }
    }

    return best;
  }
}
