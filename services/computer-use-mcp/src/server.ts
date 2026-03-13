import type { ComputerUseServerOptions } from './server/runtime'

import process, { env } from 'node:process'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { resolveComputerUseConfig } from './config'
import { createExecuteAction } from './server/action-executor'
import { destroyAllPtySessions, registerPtyTools } from './server/register-pty'
import { registerTaskMemoryTools } from './server/register-task-memory'
import { registerComputerUseTools } from './server/register-tools'
import { createRuntime } from './server/runtime'

const packageVersion = '0.1.0'
const enableTestTools = ['1', 'true', 'yes', 'on'].includes((env.COMPUTER_USE_ENABLE_TEST_TOOLS || '').trim().toLowerCase())

export { type ComputerUseServerOptions } from './server/runtime'

export async function createComputerUseMcpServer(config = resolveComputerUseConfig(), options: ComputerUseServerOptions = {}) {
  const runtime = await createRuntime(config, options)
  const executeAction = createExecuteAction(runtime)
  const server = new McpServer({
    name: 'AIRI Computer Use',
    version: packageVersion,
  })

  registerComputerUseTools({
    server,
    runtime,
    executeAction,
    enableTestTools,
  })

  registerTaskMemoryTools(server, runtime)
  registerPtyTools({ server, runtime })

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
    destroyAllPtySessions()
    await runtime.cdpBridgeManager.close().catch(() => {})
    await runtime.browserDomBridge.close().catch(() => {})
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
