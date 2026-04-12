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

import type { PointerIntent } from '../desktop-grounding-types'
import type { ComputerUseServerRuntime } from './runtime'

import process from 'node:process'

import { z } from 'zod'

import { decideBrowserAction } from '../browser-action-router'
import { captureDesktopGrounding, formatGroundingForAgent } from '../desktop-grounding'
import { resolveSnapByCandidate } from '../snap-resolver'
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
}) {
  const { server, runtime } = params

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
        runtime.stateManager.updateGroundingSnapshot(snapshot)

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
      try {
        const state = runtime.stateManager.getState()

        // Validate: must have a recent grounding snapshot
        if (!state.lastGroundingSnapshot) {
          return {
            content: [textContent('ERROR: No desktop_observe snapshot available. Call desktop_observe first to get a list of target candidates.')],
            isError: true,
          }
        }

        const snapshot = state.lastGroundingSnapshot

        // Validate: check for duplicate clicks on same candidate without re-observe
        if (state.lastClickedCandidateId === candidateId) {
          return {
            content: [textContent(`WARNING: You already clicked candidate "${candidateId}" without calling desktop_observe again. Call desktop_observe to refresh the state before clicking the same target.`)],
            isError: true,
          }
        }

        // Validate: check snapshot staleness (>5s)
        const snapshotAge = Date.now() - new Date(snapshot.capturedAt).getTime()
        if (snapshotAge > 5000) {
          return {
            content: [textContent(`WARNING: Grounding snapshot "${snapshot.snapshotId}" is ${Math.round(snapshotAge / 1000)}s old. Call desktop_observe to get a fresh snapshot before clicking.`)],
            isError: true,
          }
        }

        // Resolve snap
        const snap = resolveSnapByCandidate(candidateId, snapshot)

        if (snap.source === 'none' && !snap.candidateId) {
          return {
            content: [textContent(`ERROR: Candidate "${candidateId}" not found in snapshot "${snapshot.snapshotId}". Available candidates: ${snapshot.targetCandidates.map(c => c.id).join(', ')}`)],
            isError: true,
          }
        }

        // Build pointer intent
        const intent: PointerIntent = {
          mode: 'execute',
          candidateId,
          rawPoint: snap.rawPoint,
          snappedPoint: snap.snappedPoint,
          source: snap.source,
          confidence: snapshot.targetCandidates.find(c => c.id === candidateId)?.confidence ?? 0,
          path: [
            { x: snap.snappedPoint.x, y: snap.snappedPoint.y, delayMs: 0 },
          ],
        }

        // Update RunState — pointer intent + clicked candidate
        runtime.stateManager.updatePointerIntent(intent, candidateId)

        // Route the click: browser-dom for chrome_dom candidates, OS input for everything else
        const candidate = snapshot.targetCandidates.find(c => c.id === candidateId)
        const bridgeConnected = runtime.browserDomBridge?.getStatus().connected ?? false
        const routeDecision = candidate
          ? decideBrowserAction(candidate, bridgeConnected)
          : { route: 'os_input' as const, reason: 'candidate not found' }

        let executionRoute = routeDecision.route
        let routeNote = ''

        if (routeDecision.route === 'browser_dom' && routeDecision.selector) {
          // Try browser-dom bridge action first, dispatching by method
          try {
            const frameIds = routeDecision.frameId !== undefined ? [routeDecision.frameId] : undefined
            if (routeDecision.bridgeMethod === 'checkCheckbox') {
              await runtime.browserDomBridge!.checkCheckbox({
                selector: routeDecision.selector,
                frameIds,
              })
            }
            else {
              await runtime.browserDomBridge!.clickSelector({
                selector: routeDecision.selector,
                frameIds,
              })
            }
          }
          catch (browserError) {
            // Fallback to OS input on browser-dom failure
            executionRoute = 'os_input'
            routeNote = `browser-dom ${routeDecision.bridgeMethod ?? 'click'} failed (${browserError instanceof Error ? browserError.message : String(browserError)}), fell back to OS input`
            await runtime.executor.click({
              x: snap.snappedPoint.x,
              y: snap.snappedPoint.y,
              button: button || 'left',
              clickCount: clickCount ?? 1,
              pointerTrace: intent.path,
            })
          }
        }
        else {
          // OS-level click (existing path)
          await runtime.executor.click({
            x: snap.snappedPoint.x,
            y: snap.snappedPoint.y,
            button: button || 'left',
            clickCount: clickCount ?? 1,
            pointerTrace: intent.path,
          })
        }

        const candidateDesc = candidate ? `${candidate.source} ${candidate.role} "${candidate.label}"` : candidateId

        const lines = [
          `Clicked: ${candidateDesc}`,
          `  Snap: ${snap.reason}`,
          `  Point: (${snap.snappedPoint.x}, ${snap.snappedPoint.y})`,
          `  Route: ${executionRoute} (${routeDecision.reason})`,
          `  Button: ${button || 'left'}, clicks: ${clickCount ?? 1}`,
        ]

        if (routeNote) {
          lines.push(`  ⚠ ${routeNote}`)
        }

        if (snap.reason.includes('stale')) {
          lines.push('  ⚠ WARNING: Target source is stale. Consider calling desktop_observe again.')
        }

        return {
          content: [textContent(lines.join('\n'))],
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [textContent(`desktop_click_target failed: ${message}`)],
          isError: true,
        }
      }
    },
  })
}
