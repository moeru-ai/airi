/**
 * MCP tool registration for `desktop_ensure_chrome`.
 *
 * Ensures the agent has a dedicated Chrome window with CDP support.
 * Idempotent — calling repeatedly returns the existing session.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { textContent } from './content'
import { registerToolWithDescriptor, requireDescriptor } from './tool-descriptors/register-helper'

export function registerChromeSessionTools(params: {
  server: McpServer
  runtime: ComputerUseServerRuntime
}) {
  const { server, runtime } = params

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_ensure_chrome'),

    schema: {
      url: z.string().optional().describe('Optional URL to navigate to in the new Chrome window.'),
      cdpPort: z.number().int().min(1024).max(65535).optional().describe('CDP debugging port (default: 9222).'),
    },

    handler: async ({ url, cdpPort }) => {
      try {
        const sessionInfo = await runtime.chromeSessionManager.ensureAgentWindow({
          url,
          cdpPort,
        })

        // Persist in state
        runtime.stateManager.updateChromeSession(sessionInfo)

        // Auto-begin a desktop session targeting Chrome
        // This enables observe/click handlers to use session-based foreground enforcement
        const sessionCtrl = runtime.desktopSessionController
        if (!sessionCtrl.getSession()) {
          const currentForeground = runtime.stateManager.getState().foregroundContext
          const desktopSession = sessionCtrl.begin({
            controlledApp: 'Google Chrome',
            currentForeground,
          })
          sessionCtrl.addOwnedWindow({
            appName: 'Google Chrome',
            windowId: sessionInfo.windowId,
            pid: sessionInfo.pid,
            agentLaunched: !sessionInfo.wasAlreadyRunning,
          })
        }

        // Record the user's previous foreground app if we just took over
        const state = runtime.stateManager.getState()
        if (!state.previousUserForegroundApp && state.foregroundContext?.appName) {
          const prevApp = state.foregroundContext.appName
          if (prevApp !== 'Google Chrome') {
            runtime.stateManager.savePreviousUserForeground(prevApp)
          }
        }

        // Auto-connect CDP bridge when the agent launched Chrome with CDP.
        // Best-effort only: Chrome may need a moment before the DevTools server answers.
        let cdpStatus = 'not applicable'
        if (sessionInfo.cdpUrl) {
          try {
            const probe = await runtime.cdpBridgeManager.probeAvailability(sessionInfo.cdpUrl)
            if (probe.connectable) {
              await runtime.cdpBridgeManager.ensureBridge(sessionInfo.cdpUrl)
              cdpStatus = 'connected'
            }
            else {
              cdpStatus = `probe failed: ${probe.lastError ?? 'no connectable target'}`
            }
          }
          catch (cdpError) {
            // Non-fatal: agent can still work via os_input / extension bridge
            cdpStatus = `connect failed: ${cdpError instanceof Error ? cdpError.message : String(cdpError)}`
          }
        }

        const lines = [
          `Chrome session ${sessionInfo.wasAlreadyRunning ? 'joined' : 'launched'}:`,
          `  PID: ${sessionInfo.pid}`,
          `  Window: ${sessionInfo.windowId}`,
          `  Agent-owned: ${sessionInfo.agentOwned}`,
          `  Was already running: ${sessionInfo.wasAlreadyRunning}`,
        ]

        if (sessionInfo.cdpUrl) {
          lines.push(`  CDP URL: ${sessionInfo.cdpUrl}`)
          lines.push(`  CDP bridge: ${cdpStatus}`)
        }

        if (sessionInfo.initialUrl) {
          lines.push(`  Navigated to: ${sessionInfo.initialUrl}`)
        }

        return {
          content: [textContent(lines.join('\n'))],
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [textContent(`desktop_ensure_chrome failed: ${message}`)],
          isError: true,
        }
      }
    },
  })
}
