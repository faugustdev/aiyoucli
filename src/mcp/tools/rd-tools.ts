/**
 * Deep Research tools — research session management, search, document processing.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { getResearchEngine, type ResearchEngine } from "../../rd/engine.js";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

let engineInstance: ResearchEngine | null = null;

function getEngine(): ResearchEngine | null {
  if (!engineInstance) {
    try {
      engineInstance = getResearchEngine();
    } catch {
      return null;
    }
  }
  return engineInstance;
}

export const rdTools: MCPTool[] = [
  {
    name: "rd_init",
    description: "Initialize a deep research session with a query and strategy",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Research query" },
        strategy: { type: "string", description: "Strategy: langgraph-agent, source-based, focused-iteration, quick" },
        max_iterations: { type: "number", description: "Max iterations (default: 50)" },
      },
      required: ["query"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Deep research engine not available");
      try {
        const session = engine.initSession({
          query: input.query as string,
          strategy: input.strategy as string | undefined,
          maxIterations: input.max_iterations as number | undefined,
        });
        return json(session);
      } catch (err) {
        return text(`RD init error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "rd_search",
    description: "Search the web for research sources",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        engine: { type: "string", description: "Engine: searxng, arxiv, pubmed, semantic-scholar, wikipedia" },
      },
      required: ["query"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Deep research engine not available");
      try {
        const results = await engine.search(input.query as string, input.engine as string | undefined);
        return json(results);
      } catch (err) {
        return text(`RD search error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "rd_strategies",
    description: "List available research strategies",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const engine = getEngine();
      if (!engine) return text("Deep research engine not available");
      try {
        return json(engine.listStrategies());
      } catch (err) {
        return text(`RD strategies error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "rd_status",
    description: "Check research session status",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID" },
      },
      required: ["session_id"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Deep research engine not available");
      try {
        return json(engine.getStatus(input.session_id as string));
      } catch (err) {
        return text(`RD status error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "rd_report",
    description: "Generate a research report from a completed session",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID" },
        format: { type: "string", description: "Format: markdown, json, text" },
      },
      required: ["session_id"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Deep research engine not available");
      try {
        const report = engine.generateReport(input.session_id as string, input.format as string | undefined);
        return typeof report === "string" ? text(report) : json(report);
      } catch (err) {
        return text(`RD report error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "rd_knowledge_graph",
    description: "View knowledge graph nodes and connections for a research session",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID" },
      },
      required: ["session_id"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Deep research engine not available");
      try {
        return json(engine.getKnowledgeGraph(input.session_id as string));
      } catch (err) {
        return text(`RD knowledge graph error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "rd_document_process",
    description: "Process a document (PDF/DOCX/image) for research",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Document file path" },
        ocr: { type: "boolean", description: "Enable OCR for scanned documents" },
      },
      required: ["path"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Deep research engine not available");
      try {
        return json(engine.processDocument(input.path as string, input.ocr as boolean | undefined));
      } catch (err) {
        return text(`RD document error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: "rd_citations",
    description: "Generate citations from session sources",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID" },
        style: { type: "string", description: "Citation style: APA, MLA, Chicago, BibTeX" },
      },
      required: ["session_id"],
    },
    handler: async (input) => {
      const engine = getEngine();
      if (!engine) return text("Deep research engine not available");
      try {
        return json(engine.generateCitations(input.session_id as string, input.style as string | undefined));
      } catch (err) {
        return text(`RD citations error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
];
