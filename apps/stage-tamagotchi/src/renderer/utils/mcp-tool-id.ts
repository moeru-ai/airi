/** Match a registered LLM tool id to a bundled MCP tool name. */
export function matchesMcpToolId(toolId: string, toolName: string): boolean {
  if (toolId === `mcp:${toolName}`)
    return true
  return toolId.endsWith(`::${toolName}`) || toolId.includes(`__${toolName}`)
}
