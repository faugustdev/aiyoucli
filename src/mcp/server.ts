/**
 * MCP stdio server — JSON-RPC 2.0 over stdin/stdout.
 *
 * This is the primary API surface that Claude Code and other MCP clients
 * use to communicate with aiyoucli.
 */

import { createInterface } from "node:readline";
import { registry } from "./client.js";
import { registerAllTools } from "./tools/index.js";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";

function send(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}

export function startMCPServer(): void {
  // Register all tool modules on startup
  registerAllTools();

  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }

    handleRequest(request);
  });

  rl.on("close", () => process.exit(0));
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  const { method, id, params } = request;

  switch (method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "aiyoucli", version: "0.1.0" },
        },
      });
      break;

    case "notifications/initialized":
      break;

    case "ping":
      send({ jsonrpc: "2.0", id: id ?? null, result: {} });
      break;

    case "tools/list":
      send({
        jsonrpc: "2.0",
        id: id ?? null,
        result: { tools: registry.listForMCP() },
      });
      break;

    case "tools/call": {
      const toolName = (params as { name?: string })?.name ?? "";
      const toolArgs = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};

      const result = await registry.call(toolName, toolArgs);
      send({ jsonrpc: "2.0", id: id ?? null, result });
      break;
    }

    default:
      send({
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}
