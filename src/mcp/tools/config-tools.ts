/**
 * Config tools — configuration get/set/list.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { loadConfig } from "../../config.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const configTools: MCPTool[] = [
  {
    name: "config_get",
    description: "Get current configuration",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Config key path (e.g. 'memory.dimensions'). Omit for full config." },
      },
    },
    handler: async (input) => {
      const config = loadConfig();
      if (!input.key) return json(config);
      const keys = (input.key as string).split(".");
      let val: unknown = config;
      for (const k of keys) {
        if (val && typeof val === "object" && k in val) {
          val = (val as Record<string, unknown>)[k];
        } else {
          return text(`Key not found: ${input.key}`);
        }
      }
      return json(val);
    },
  },
  {
    name: "config_set",
    description: "Set a configuration value and save to file",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Config key path" },
        value: { description: "New value" },
      },
      required: ["key", "value"],
    },
    handler: async (input) => {
      const BANNED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
      const config = loadConfig() as unknown as Record<string, unknown>;
      const keys = (input.key as string).split(".");
      for (const k of keys) {
        if (BANNED_KEYS.has(k)) throw new Error(`Forbidden key segment: ${k}`);
      }
      let obj = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in obj)) (obj as Record<string, unknown>)[keys[i]] = {};
        obj = (obj as Record<string, unknown>)[keys[i]] as Record<string, unknown>;
      }
      (obj as Record<string, unknown>)[keys[keys.length - 1]] = input.value;

      const dir = join(process.cwd(), ".aiyoucli");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "config.json"), JSON.stringify(config, null, 2));
      return text(`Set ${input.key} = ${JSON.stringify(input.value)}`);
    },
  },
];
