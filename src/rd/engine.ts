/**
 * Deep Research Engine — TypeScript orchestration layer over NAPI.
 *
 * Manages research sessions, strategies, and document processing.
 * Uses aiyoucli-rd NAPI for compute-intensive operations.
 */

import { rdGetStrategies, rdCreateSession, rdSearchWeb, rdProcessDocument } from "../napi/rd.js";

export interface ResearchSession {
  sessionId: string;
  query: string;
  strategy: string;
  status: "initialized" | "searching" | "processing" | "completed" | "error";
  sources: ResearchSource[];
  knowledgeGraph: KnowledgeGraph;
  createdAt: number;
  updatedAt: number;
}

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  engine: string;
  snippet?: string;
  relevance?: number;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export interface KnowledgeNode {
  id: number;
  kind: string;
  name: string;
}

export interface KnowledgeEdge {
  from: number;
  to: number;
  kind: string;
  weight: number;
}

export interface ResearchStrategy {
  name: string;
  description: string;
}

interface SessionStore {
  [sessionId: string]: ResearchSession;
}

const sessions: SessionStore = {};

export class ResearchEngine {
  /**
   * Initialize a new research session.
   */
  initSession(opts: {
    query: string;
    strategy?: string;
    maxIterations?: number;
  }): ResearchSession {
    const strategy = opts.strategy || "langgraph-agent";
    const strategies = this.listStrategies();
    const validStrategy = strategies.find((s) => s.name === strategy);
    if (!validStrategy) {
      throw new Error(`Invalid strategy: ${strategy}. Available: ${strategies.map((s) => s.name).join(", ")}`);
    }

    const sessionJson = rdCreateSession(opts.query, strategy);
    const parsed = JSON.parse(sessionJson);

    const session: ResearchSession = {
      sessionId: parsed.sessionId,
      query: opts.query,
      strategy,
      status: "initialized",
      sources: [],
      knowledgeGraph: { nodes: [], edges: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    sessions[session.sessionId] = session;
    return session;
  }

  /**
   * List available research strategies.
   */
  listStrategies(): ResearchStrategy[] {
    const names = rdGetStrategies();
    const descriptions: Record<string, string> = {
      "langgraph-agent": "Autonomous agent with iterative research loop",
      "source-based": "Focus on collecting and analyzing sources",
      "focused-iteration": "Deep dive into specific subtopics",
      "topic-organization": "Organize findings by topic clusters",
      "quick": "Fast overview with minimal iterations",
    };
    return names.map((name) => ({
      name,
      description: descriptions[name] || "Research strategy",
    }));
  }

  /**
   * Search the web for research sources.
   */
  async search(
    query: string,
    engine?: string
  ): Promise<{ query: string; engine: string; results: ResearchSource[] }> {
    const searchJson = rdSearchWeb(query, engine);
    const parsed = JSON.parse(searchJson);

    // In a real implementation, this would process the queued search
    // For now, return the NAPI response with placeholder results
    return {
      query: parsed.query,
      engine: parsed.engine,
      results: [],
    };
  }

  /**
   * Get session status.
   */
  getStatus(sessionId: string): ResearchSession | null {
    return sessions[sessionId] || null;
  }

  /**
   * Generate a research report.
   */
  generateReport(
    sessionId: string,
    format?: string
  ): string | object {
    const session = sessions[sessionId];
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const report = {
      sessionId: session.sessionId,
      query: session.query,
      strategy: session.strategy,
      status: session.status,
      sourcesCount: session.sources.length,
      generatedAt: new Date().toISOString(),
    };

    if (format === "json") {
      return report;
    }

    return `# Research Report\n\n**Query:** ${session.query}\n**Strategy:** ${session.strategy}\n**Status:** ${session.status}\n**Sources:** ${session.sources.length}\n\nGenerated at: ${report.generatedAt}`;
  }

  /**
   * Get knowledge graph for a session.
   */
  getKnowledgeGraph(sessionId: string): KnowledgeGraph | null {
    const session = sessions[sessionId];
    return session?.knowledgeGraph || null;
  }

  /**
   * Process a document for research.
   */
  processDocument(path: string, ocr?: boolean): string {
    const resultJson = rdProcessDocument(path);
    return resultJson;
  }

  /**
   * Generate citations from session sources.
   */
  generateCitations(
    sessionId: string,
    style?: string
  ): string[] {
    const session = sessions[sessionId];
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const citationStyle = style || "APA";
    return session.sources.map((source) => {
      switch (citationStyle) {
        case "MLA":
          return `${source.title}. ${source.url}.`;
        case "Chicago":
          return `${source.title}. Accessed from ${source.url}.`;
        case "BibTeX":
          return `@misc{${source.id},\n  title = {${source.title}},\n  url = {${source.url}}\n}`;
        default: // APA
          return `${source.title}. Retrieved from ${source.url}`;
      }
    });
  }
}

let _engine: ResearchEngine | null = null;

export function getResearchEngine(): ResearchEngine {
  if (!_engine) {
    _engine = new ResearchEngine();
  }
  return _engine;
}
