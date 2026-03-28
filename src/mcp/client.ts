/**
 * MCP tool registry — collects tools from modules and dispatches calls.
 * Includes production hardening: circuit breaker + retry.
 */

import type { MCPTool, MCPToolResult } from "../types.js";
import { CircuitBreaker } from "../production/circuit-breaker.js";
import { withRetry } from "../production/retry.js";
import { handleError } from "../production/error-handler.js";
import { metrics } from "../metrics/collector.js";

const breaker = new CircuitBreaker({
  failureThreshold: 10,
  resetTimeout: 15_000,
  halfOpenMax: 2,
});

class ToolRegistry {
  private tools = new Map<string, MCPTool>();

  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: MCPTool[]): void {
    for (const t of tools) this.register(t);
  }

  get(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  list(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  listForMCP(): Array<{
    name: string;
    description: string;
    inputSchema: MCPTool["inputSchema"];
  }> {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async call(
    name: string,
    input: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const endToolCall = metrics.startToolCall(name);
    try {
      const result = await breaker.execute(() =>
        withRetry(() => tool.handler(input), { maxRetries: 1, baseDelay: 500 })
      );
      endToolCall(true);
      return result;
    } catch (err) {
      const { message, code } = handleError(err);
      endToolCall(false, code);
      return {
        content: [{ type: "text", text: `[${code}] ${message}` }],
        isError: true,
      };
    }
  }

  getCircuitBreakerStats() {
    return breaker.getStats();
  }
}

export const registry = new ToolRegistry();

/**
 * Convenience function to call a tool by name.
 */
export async function callTool(
  name: string,
  input: Record<string, unknown>
): Promise<MCPToolResult> {
  return registry.call(name, input);
}
