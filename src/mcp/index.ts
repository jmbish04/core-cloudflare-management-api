/**
 * MCP (Model Context Protocol) Tools
 * Export all MCP tool definitions for AI agent integration
 */

import { consultationMCPTools } from './consultation';
import { workerCreationMCPTools } from './create-worker';

/**
 * All available MCP tools
 */
export const allMCPTools = [
  ...consultationMCPTools,
  ...workerCreationMCPTools,
];

/**
 * Get MCP tool by name
 */
export function getMCPTool(name: string) {
  return allMCPTools.find((tool) => tool.name === name);
}

/**
 * List all MCP tool names
 */
export function listMCPTools() {
  return allMCPTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}
