/**
 * Task tools — task lifecycle management.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const STORE_DIR = join(process.cwd(), ".aiyoucli", "tasks");
const STORE_FILE = join(STORE_DIR, "store.json");

interface Task {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  assignedTo?: string;
  priority: string;
  createdAt: number;
  completedAt?: number;
}

function loadTasks(): Task[] {
  if (!existsSync(STORE_FILE)) return [];
  try { return JSON.parse(readFileSync(STORE_FILE, "utf-8")); } catch { return []; }
}

function saveTasks(tasks: Task[]): void {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(tasks, null, 2));
}

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const taskTools: MCPTool[] = [
  {
    name: "task_create",
    description: "Create a new task",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Task description" },
        priority: { type: "string", description: "low, normal, high, critical" },
        assignTo: { type: "string", description: "Agent ID to assign" },
      },
      required: ["description"],
    },
    handler: async (input) => {
      const id = `task-${Date.now().toString(36)}`;
      const task: Task = {
        id,
        description: input.description as string,
        status: "pending",
        assignedTo: input.assignTo as string | undefined,
        priority: (input.priority as string) || "normal",
        createdAt: Date.now(),
      };
      const tasks = loadTasks();
      tasks.push(task);
      saveTasks(tasks);
      return json({ id, status: "pending" });
    },
  },
  {
    name: "task_list",
    description: "List all tasks",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status" },
      },
    },
    handler: async (input) => {
      let tasks = loadTasks();
      if (input.status) tasks = tasks.filter((t) => t.status === input.status);
      return json(tasks);
    },
  },
  {
    name: "task_status",
    description: "Get task status by ID",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (input) => {
      const task = loadTasks().find((t) => t.id === input.id);
      return task ? json(task) : text(`Task not found: ${input.id}`);
    },
  },
  {
    name: "task_complete",
    description: "Mark a task as completed",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (input) => {
      const tasks = loadTasks();
      const task = tasks.find((t) => t.id === input.id);
      if (!task) return text(`Task not found: ${input.id}`);
      task.status = "completed";
      task.completedAt = Date.now();
      saveTasks(tasks);
      return text(`Task completed: ${task.id}`);
    },
  },
];
