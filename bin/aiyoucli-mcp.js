#!/usr/bin/env node
/**
 * aiyoucli-mcp — MCP stdio server entry point.
 * Always starts in MCP mode regardless of TTY state.
 */
const { startMCPServer } = await import("../dist/mcp/server.js");
startMCPServer();
