#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServerInstance } from './services/mcpServer.js';

async function runStdioMcp() {
  const server = createMcpServerInstance();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 [WAgent MCP] Servidor Model Context Protocol (Stdio) iniciado correctamente.');
}

runStdioMcp().catch((err) => {
  console.error('❌ [WAgent MCP] Error fatal en servidor Stdio:', err);
  process.exit(1);
});
