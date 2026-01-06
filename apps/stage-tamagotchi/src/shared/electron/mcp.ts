import type { McpCallToolOptions, McpClientOptions } from '../../main/services/electron/mcp'

import { defineInvokeEventa } from '@moeru/eventa'

const createAndRunClient = defineInvokeEventa<void, McpClientOptions>('eventa:invoke:electron:mcp:create-and-run-client')
const callTool = defineInvokeEventa<unknown, McpCallToolOptions>('eventa:invoke:electron:mcp:call-tool')

export const mcp = {
  createAndRunClient,
  callTool,
}
