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
      includeChrome: z.boolean().optional().describe('Whether to include Chrome semantic data. Default: auto-detect based on foreground app.'),
    },

    handler: async ({ includeChrome }) => {
      try {
        // Try to get an existing CDP bridge (non-fatal if unavailable)
        let cdpBridge: import('../browser-dom/cdp-bridge').CdpBridge | undefined
        try {
          const status = runtime.cdpBridgeManager.getStatus()
          if (status.connected) {
            cdpBridge = await runtime.cdpBridgeManager.ensureBridge()
          }
        }
        catch {
          // CDP bridge unavailable — graceful degradation
        }

        const snapshot = await captureDesktopGrounding({
          config: runtime.config,
          executor: runtime.executor,
          input: { includeChrome },
          extensionBridge: runtime.browserDomBridge,
          cdpBridge,
        })

        // Update RunState — grounding snapshot
        runtime.stateManager.updateGroundingSnapshot({
          ...snapshot,
          screenshot: snapshot.screenshot
            ? {
                ...snapshot.screenshot,
                dataBase64: '',
              }
            : snapshot.screenshot,
        })

        // Also update screenshot state so desktop_get_state and other
        // tools can see the latest screenshot from this observation
        if (snapshot.screenshot && !snapshot.screenshot.placeholder) {
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
          runtime.stateManager.updateForegroundContext({
            available: true,
            appName: snapshot.foregroundApp,
            platform: process.platform,
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
        runtime.stateManager.clearGroundingState()
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

    handler: async ({ candidateId, clickCount, button }) => {
      return await executeAction({
        kind: 'desktop_click_target',
        input: {
          candidateId,
          clickCount,
          button,
        },
      }, 'desktop_click_target')
    },
  })
}
