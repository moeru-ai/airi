/**
 * MCP tool registration for desktop grounding tools:
 * - `desktop_observe` — unified observation (screenshot + AX + Chrome semantic)
 * - `desktop_click_target` — snap-resolved click by candidate id
 *
 * These tools work together: the agent first calls `desktop_observe` to get
 * a list of interactable target candidates, then uses `desktop_click_target`
 * to click on a specific candidate by its id.
 *
 * State is managed through `runtime.stateManager` (RunStateManager), not
 * a private closure. This ensures `desktop_get_state` and the overlay can
 * read the latest grounding/pointer data.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { DesktopClickTargetInput } from '../types'
import type { ExecuteAction } from './action-executor'
import type { ComputerUseServerRuntime } from './runtime'

import process from 'node:process'

import { z } from 'zod'

import { captureDesktopGrounding, formatGroundingForAgent } from '../desktop-grounding'
import { textContent } from './content'
import { registerToolWithDescriptor, requireDescriptor } from './tool-descriptors/register-helper'

/**
 * Register desktop grounding MCP tools on the server.
 *
 * Uses the unified runtime for executor, bridges, and state management.
 * Grounding state (snapshot, pointer intent, clicked candidate) flows
 * through `runtime.stateManager` so it's visible to `desktop_get_state`,
 * the overlay, and strategy rules.
 */
export function registerDesktopGroundingTools(params: {
  server: McpServer
  runtime: ComputerUseServerRuntime
  executeAction: ExecuteAction
}) {
  const { server, runtime, executeAction } = params

  // -----------------------------------------------------------------------
  // desktop_observe
  // -----------------------------------------------------------------------

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_observe'),

    schema: {
      includeChrome: z.boolean().optional().describe('Whether to include Chrome semantic data. Default: best-effort when browser surfaces are available.'),
    },

    handler: async ({ includeChrome }) => {
      try {
        // Try to get or reconnect a CDP bridge.
        // NOTICE: `desktop_ensure_chrome` can launch Chrome before its DevTools
        // endpoint is fully ready. When observe runs later, reconnect from the
        // recorded session URL instead of staying stuck in AX-only mode.
        let cdpBridge: import('../browser-dom/cdp-bridge').CdpBridge | undefined
        try {
          const cdpStatus = runtime.cdpBridgeManager.getStatus()
          if (cdpStatus.connected) {
            cdpBridge = await runtime.cdpBridgeManager.ensureBridge()
          }
          else {
            const chromeSession = runtime.chromeSessionManager.getSessionInfo()
            if (chromeSession?.cdpUrl) {
              cdpBridge = await runtime.cdpBridgeManager.ensureBridge(chromeSession.cdpUrl)
            }
          }
        }
        catch {
          // CDP bridge unavailable — graceful degradation to extension or AX
        }

        const snapshot = await captureDesktopGrounding({
          config: runtime.config,
          executor: runtime.executor,
          input: { includeChrome },
          extensionBridge: runtime.browserDomBridge,
          cdpBridge,
        })

        // Update RunState — grounding snapshot
        runtime.stateManager.updateGroundingSnapshot(snapshot)

        // Also update screenshot state so desktop_get_state and other
        // tools can see the latest screenshot from this observation
        if (snapshot.screenshot && !snapshot.screenshot.placeholder) {
          runtime.session.setLastScreenshot(snapshot.screenshot)
          runtime.stateManager.updateLastScreenshot({
            path: snapshot.screenshot.path || '',
            width: snapshot.screenshot.width,
            height: snapshot.screenshot.height,
            capturedAt: snapshot.screenshot.capturedAt,
            placeholder: false,
          })
        }

        // Update foreground context from the observation
        if (snapshot.foregroundApp && snapshot.foregroundApp !== 'unknown') {
          const chromeSession = runtime.chromeSessionManager.getSessionInfo()
          const isAgentOwned = chromeSession
            ? snapshot.foregroundApp === 'Google Chrome'
            : false

          runtime.stateManager.updateForegroundContext({
            available: true,
            appName: snapshot.foregroundApp,
            platform: process.platform,
            agentOwned: isAgentOwned,
            agentWindowPid: isAgentOwned ? chromeSession?.pid : undefined,
          })
        }

        const text = formatGroundingForAgent(snapshot)

        // Include screenshot as image content if available
        const content: Array<{ type: 'text', text: string } | { type: 'image', data: string, mimeType: 'image/png' }> = [
          { type: 'text', text },
        ]

        if (snapshot.screenshot.dataBase64 && !snapshot.screenshot.placeholder) {
          content.push({
            type: 'image',
            data: snapshot.screenshot.dataBase64,
            mimeType: 'image/png',
          })
        }

        return { content }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [textContent(`desktop_observe failed: ${message}`)],
          isError: true,
        }
      }
    },
  })

  // -----------------------------------------------------------------------
  // desktop_click_target
  // -----------------------------------------------------------------------

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_click_target'),

    schema: {
      candidateId: z.string().describe('Target candidate id from the last desktop_observe snapshot (e.g. "t_0")'),
      clickCount: z.number().int().min(1).max(3).optional().describe('Number of clicks (default: 1, 2 = double-click)'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button (default: left)'),
    },

    handler: async (input: DesktopClickTargetInput) =>
      executeAction({ kind: 'desktop_click_target', input }, 'desktop_click_target'),
  })
}
