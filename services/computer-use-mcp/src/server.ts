import type { ComputerUseServerOptions } from './server/runtime'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { resolveComputerUseConfig } from './config'
import { createExecuteAction } from './server/action-executor'
import { registerComputerUseTools } from './server/register-tools'
import { createRuntime } from './server/runtime'

const packageVersion = '0.1.0'
const enableTestTools = ['1', 'true', 'yes', 'on'].includes((process.env.COMPUTER_USE_ENABLE_TEST_TOOLS || '').trim().toLowerCase())

export { type ComputerUseServerOptions } from './server/runtime'

export async function createComputerUseMcpServer(config = resolveComputerUseConfig(), options: ComputerUseServerOptions = {}) {
  const runtime = await createRuntime(config, options)
  const server = new McpServer({
    name: 'AIRI Computer Use',
    version: packageVersion,
  })

  registerComputerUseTools({
    server,
    runtime,
    executeAction: createExecuteAction(runtime),
    enableTestTools,
  })

  return {
    server,
    runtime,
  }
}

export async function startComputerUseMcpServer(config = resolveComputerUseConfig(), options: ComputerUseServerOptions = {}) {
  const { server, runtime } = await createComputerUseMcpServer(config, options)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  const shutdown = async () => {
    await runtime.executor.close?.().catch(() => {})
  }

  process.once('SIGINT', () => {
    void shutdown()
  })
  process.once('SIGTERM', () => {
    void shutdown()
  })

  return { server, transport, runtime }
}
