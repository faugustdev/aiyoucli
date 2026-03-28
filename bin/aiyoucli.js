#!/usr/bin/env node
/**
 * aiyoucli — AI agent CLI with Rust-powered vector intelligence.
 *
 * CLI mode: parses argv, executes commands.
 * MCP mode: if stdin is piped and no args, starts MCP stdio server.
 */

const isExplicitMCP =
  process.argv.length >= 3 &&
  process.argv[2] === "mcp" &&
  (process.argv.length === 3 || process.argv[3] === "start");

const isMCPMode =
  !process.stdin.isTTY && (process.argv.length === 2 || isExplicitMCP);

if (isMCPMode) {
  // MCP stdio mode — JSON-RPC over stdin/stdout
  const { startMCPServer } = await import("../dist/mcp/server.js");
  startMCPServer();
} else {
  // CLI interactive mode
  const { CLI } = await import("../dist/index.js");
  const cli = new CLI();
  cli.run().catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}
