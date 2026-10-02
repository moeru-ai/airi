import { defineEvent } from '../../../utils/dsl'

/** Changes to the set of MCP servers configured by the user. */
export const mcpServerUpdatedEvent = defineEvent<{
  action: 'add' | 'remove'
}>('mcp_server_updated')
