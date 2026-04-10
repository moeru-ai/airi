import type { ComputerUseServerOptions } from './server/runtime'

import process, { env } from 'node:process'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { resolveComputerUseConfig } from './config'
import { createExecuteAction } from './server/action-executor'
import { textContent } from './server/content'
import { registerAccessibilityTools } from './server/register-accessibility'
import { registerCdpTools } from './server/register-cdp'
import { registerDisplayTools } from './server/register-display'
import { destroyAllPtySessions, registerPtyTools } from './server/register-pty'
import { registerTaskMemoryTools } from './server/register-task-memory'
import { registerToolDirectory } from './server/register-tool-directory'
import { registerToolSearch } from './server/register-tool-search'
import { registerComputerUseTools } from './server/register-tools'
import { registerVscodeTools } from './server/register-vscode'
import { createRuntime } from './server/runtime'
import { initializeGlobalRegistry } from './server/tool-descriptors'
import {
  buildCrossLaneAdvisory,
  inferToolLane,
  shouldUpdateActiveLane,
} from './server/tool-lane-hygiene'

const packageVersion = '0.1.0'
const enableTestTools = ['1', 'true', 'yes', 'on'].includes((env.COMPUTER_USE_ENABLE_TEST_TOOLS || '').trim().toLowerCase())

export { type ComputerUseServerOptions } from './server/runtime'

export async function createComputerUseMcpServer(config = resolveComputerUseConfig(), options: ComputerUseServerOptions = {}) {
  // Initialize the global tool descriptor registry
  initializeGlobalRegistry()

  const runtime = await createRuntime(config, options)
  const executeAction = createExecuteAction(runtime)
  const rawServer = new McpServer({
    name: 'AIRI Computer Use',
    version: packageVersion,
  })

  // --- Tool Lane Hygiene (global) ---
  // Wrap the McpServer instance to intercept ALL `server.tool()` calls,
  // enabling automatic lane inference and cross-lane advisory injection
  // for every registered tool across all sub-registries.
  const server = new Proxy(rawServer, {
    get(target, prop, receiver) {
      if (prop === 'tool') {
        // NOTICE: McpServer.tool() has many overloads (2–5 positional args).
        // The handler is always the last argument and is always a function.
        // We use rest args to avoid coupling to any specific overload shape.
        return (name: string, ...rest: any[]) => {
          const handlerIndex = rest.findIndex((arg: unknown) => typeof arg === 'function')
          if (handlerIndex < 0) {
            // No handler found — pass through unchanged (defensive fallback)
            return (rawServer.tool as any)(name, ...rest)
          }

          const originalHandler = rest[handlerIndex]
          const wrappedHandler = async (input: any, extra: any) => {
            const lane = inferToolLane(name)
            let advisory: string | null = null

            if (lane) {
              const activeLane = runtime.stateManager.getState().inferredActiveLane
              advisory = buildCrossLaneAdvisory({
                toolName: name,
                toolLane: lane,
                inferredActiveLane: activeLane,
              })

              if (shouldUpdateActiveLane(lane)) {
                runtime.stateManager.updateInferredLane(lane)
              }
            }

            const result = await originalHandler(input, extra)

            // Inject the advisory as a new content entry without mutating the original
            if (advisory && result && Array.isArray(result.content)) {
              return {
                ...result,
                content: [...result.content, textContent('\n\n' + advisory)],
              }
            }

            return result
          }

          const wrappedRest = [...rest]
          wrappedRest[handlerIndex] = wrappedHandler
          return (rawServer.tool as any)(name, ...wrappedRest)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  })

  // All registrations use the proxied server for full lane hygiene coverage
  registerToolDirectory({ server })
  registerToolSearch({ server })

  registerComputerUseTools({
    server,
    runtime,
    executeAction,
    enableTestTools,
  })

  registerTaskMemoryTools(server, runtime)

  registerAccessibilityTools({ server, runtime })
  registerDisplayTools({ server, runtime })
  registerPtyTools({ server, runtime })
  registerVscodeTools({
    server,
    runtime,
    executeTerminalCommand: async (input, toolName) => {
      return await executeAction({ kind: 'terminal_exec', input }, toolName)
    },
  })
  const cdpCleanup = registerCdpTools({ server, runtime })

  return {
    server: rawServer,
    runtime,
    cdpCleanup,
  }
}

export async function startComputerUseMcpServer(config = resolveComputerUseConfig(), options: ComputerUseServerOptions = {}) {
  const { server, runtime, cdpCleanup } = await createComputerUseMcpServer(config, options)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  const shutdown = async () => {
    destroyAllPtySessions()
    await cdpCleanup.close().catch(() => {})
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
