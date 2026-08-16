/**
 * PDF tools — convert a local PDF file to Markdown.
 * Native/selectable text only (pure Rust `pdfrs`, no Poppler/PDFium/Python);
 * scanned PDFs with no text layer are out of scope (no OCR).
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { pdfToMarkdown } from "../../napi/index.js";
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

export const pdfTools: MCPTool[] = [
  {
    name: "pdf_to_markdown",
    description:
      "Convert a local PDF file to Markdown (headings, lists, code blocks, simple tables). " +
      "Native/selectable text only — scanned PDFs with no text layer are not OCR'd.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pdf file" },
      },
      required: ["path"],
    },
    handler: async (input) => {
      const path = input.path as string;
      assertWithinCwd(path);
      const result = pdfToMarkdown(path);
      return text(result);
    },
  },
];
