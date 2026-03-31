/**
 * Distiller tools — convert Markdown to TOON (Dense Structured Instructions).
 * ~52% fewer tokens for the same semantic content.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { distillMarkdown, distillFile } from "../../napi/index.js";
import { resolve } from "node:path";
import { realpathSync, existsSync } from "node:fs";

function assertWithinCwd(filePath: string): void {
  const resolved = existsSync(filePath) ? realpathSync(resolve(filePath)) : resolve(filePath);
  const cwd = realpathSync(process.cwd());
  if (!resolved.startsWith(cwd + "/") && resolved !== cwd) {
    throw new Error(`Path must be within project root: ${resolved}`);
  }
}

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }

export const distillerTools: MCPTool[] = [
  {
    name: "distill_markdown",
    description: "Convert Markdown to TOON format (Dense Structured Instructions). ~52% fewer tokens.",
    inputSchema: {
      type: "object",
      properties: {
        markdown: { type: "string", description: "Markdown content to distill" },
      },
      required: ["markdown"],
    },
    handler: async (input) => {
      const result = distillMarkdown(input.markdown as string);
      return text(result);
    },
  },
  {
    name: "distill_file",
    description: "Distill a Markdown file to TOON format. Reads the file and returns dense instructions.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .md file" },
      },
      required: ["path"],
    },
    handler: async (input) => {
      const path = input.path as string;
      assertWithinCwd(path);
      const result = distillFile(path);
      return text(result);
    },
  },
];
