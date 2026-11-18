/** Registers the stable desktop observation, action, and verification tools. */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type {
  ActionInvocation,
  ClickActionInput,
  DesktopClickTargetInput,
  FocusAppActionInput,
  OpenAppActionInput,
  PressKeysActionInput,
  ScrollActionInput,
  TypeTextActionInput,
  WaitActionInput,
} from '../types'
import type { ExecuteAction } from './action-executor'
import type { ComputerUseServerRuntime } from './runtime'

import process from 'node:process'

import { z } from 'zod'

import { attachBusinessVerificationContract } from '../contracts/agent-execution'
import { captureDesktopGrounding, formatGroundingForAgent } from '../desktop-grounding'
import { errorMessageFromValue } from '../utils/error-message'
import { textContent } from './content'
import { refreshRuntimeRunState } from './refresh-run-state'
import { registerToolWithDescriptor, requireDescriptor } from './tool-descriptors/register-helper'

interface ComputerActInput {
  action: 'click' | 'type' | 'key' | 'scroll' | 'open' | 'focus' | 'wait'
  targetId?: string
  x?: number
  y?: number
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
  text?: string
  pressEnter?: boolean
  keys?: string[]
  deltaX?: number
  deltaY?: number
  app?: string
  durationMs?: number
  captureAfter?: boolean
}

interface ComputerVerifyInput {
  check: 'foreground_app' | 'window_title' | 'screenshot_ready'
  expected?: string
  executionId?: string
}

function invalidComputerActResponse(reason: string) {
  return {
    isError: true,
    content: [textContent(`computer_act invalid parameters: ${reason}`)],
    structuredContent: {
      status: 'invalid_params',
      toolName: 'computer_act',
      error: reason,
    },
  }
}

function toComputerAction(input: ComputerActInput): { action: ActionInvocation } | { error: string } {
  switch (input.action) {
    case 'click': {
      if (input.targetId) {
        const targetInput: DesktopClickTargetInput = { candidateId: input.targetId }
        if (input.clickCount !== undefined)
          targetInput.clickCount = input.clickCount
        if (input.button !== undefined)
          targetInput.button = input.button
        return { action: { kind: 'desktop_click_target', input: targetInput } }
      }
      if (input.x === undefined || input.y === undefined)
        return { error: 'click requires x and y, or targetId from computer_observe.' }
      const clickInput: ClickActionInput = { x: input.x, y: input.y }
      if (input.button !== undefined)
        clickInput.button = input.button
      if (input.clickCount !== undefined)
        clickInput.clickCount = input.clickCount
      if (input.captureAfter !== undefined)
        clickInput.captureAfter = input.captureAfter
      return { action: { kind: 'click', input: clickInput } }
    }
    case 'type': {
      if (!input.text)
        return { error: 'type requires a non-empty text value.' }
      const typeInput: TypeTextActionInput = { text: input.text }
      if (input.x !== undefined)
        typeInput.x = input.x
      if (input.y !== undefined)
        typeInput.y = input.y
      if (input.pressEnter !== undefined)
        typeInput.pressEnter = input.pressEnter
      if (input.captureAfter !== undefined)
        typeInput.captureAfter = input.captureAfter
      return { action: { kind: 'type_text', input: typeInput } }
    }
    case 'key': {
      if (!input.keys || input.keys.length === 0)
        return { error: 'key requires at least one key in keys.' }
      const keyInput: PressKeysActionInput = { keys: input.keys }
      if (input.captureAfter !== undefined)
        keyInput.captureAfter = input.captureAfter
      return { action: { kind: 'press_keys', input: keyInput } }
    }
    case 'scroll': {
      if (input.deltaX === undefined && input.deltaY === undefined)
        return { error: 'scroll requires deltaX or deltaY.' }
      const scrollInput: ScrollActionInput = { deltaY: input.deltaY ?? 0 }
      if (input.x !== undefined)
        scrollInput.x = input.x
      if (input.y !== undefined)
        scrollInput.y = input.y
      if (input.deltaX !== undefined)
        scrollInput.deltaX = input.deltaX
      if (input.captureAfter !== undefined)
        scrollInput.captureAfter = input.captureAfter
      return { action: { kind: 'scroll', input: scrollInput } }
    }
    case 'open': {
      if (!input.app)
        return { error: 'open requires an app name.' }
      const openInput: OpenAppActionInput = { app: input.app }
      return { action: { kind: 'open_app', input: openInput } }
    }
    case 'focus': {
      if (!input.app)
        return { error: 'focus requires an app name.' }
      const focusInput: FocusAppActionInput = { app: input.app }
      return { action: { kind: 'focus_app', input: focusInput } }
    }
    case 'wait': {
      if (input.durationMs === undefined)
        return { error: 'wait requires durationMs.' }
      const waitInput: WaitActionInput = { durationMs: input.durationMs }
      if (input.captureAfter !== undefined)
        waitInput.captureAfter = input.captureAfter
      return { action: { kind: 'wait', input: waitInput } }
    }
  }
}

function invalidComputerVerifyResponse(reason: string) {
  return {
    isError: true,
    content: [textContent(`computer_verify invalid parameters: ${reason}`)],
    structuredContent: {
      status: 'invalid_params',
      toolName: 'computer_verify',
      error: reason,
    },
  }
}

function matchesExpected(observed: string | undefined, expected: string) {
  return observed?.trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase()
}

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
  const desktopBackend = runtime.executor.describe()
  const desktopDescription = `MCP Desktop backend: ${desktopBackend.kind}. ${desktopBackend.notes.join(' ')}`

  // -----------------------------------------------------------------------
  // computer_observe
  // -----------------------------------------------------------------------

  const observeHandler = async ({ includeChrome }: { includeChrome?: boolean }) => {
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
          sourceHostName: snapshot.screenshot.sourceHostName,
          sourceDisplayId: snapshot.screenshot.sourceDisplayId,
          sourceWindowId: snapshot.screenshot.sourceWindowId,
          sourceSessionTag: snapshot.screenshot.sourceSessionTag,
          executionTargetMode: snapshot.screenshot.executionTargetMode,
        })
      }

      // Update foreground context from the observation
      if (snapshot.foregroundApp && snapshot.foregroundApp !== 'unknown') {
        const foregroundWindow = snapshot.windows.find(window => window.id === snapshot.screenshot.sourceWindowId)
          ?? snapshot.windows.find(window => window.appName === snapshot.foregroundApp)
        const chromeSession = runtime.chromeSessionManager.getSessionInfo()
        const isAgentOwned = chromeSession
          ? snapshot.foregroundApp === 'Google Chrome'
          : false

        runtime.stateManager.updateForegroundContext({
          available: true,
          appName: snapshot.foregroundApp,
          windowTitle: foregroundWindow?.title,
          windowId: foregroundWindow?.id ?? snapshot.screenshot.sourceWindowId,
          ownerPid: foregroundWindow?.ownerPid,
          windowBounds: foregroundWindow?.bounds,
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
      const message = errorMessageFromValue(error)
      return {
        content: [textContent(`computer_observe failed: ${message}`)],
        isError: true,
      }
    }
  }

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('computer_observe'),
    description: `${requireDescriptor('computer_observe').summary} ${desktopDescription}`,
    schema: {
      includeChrome: z.boolean().optional().describe('Whether to include Chrome semantic data. Default: best-effort when browser surfaces are available.'),
    },
    handler: observeHandler,
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('computer_act'),
    description: `${requireDescriptor('computer_act').summary} ${desktopDescription}`,
    schema: {
      action: z.enum(['click', 'type', 'key', 'scroll', 'open', 'focus', 'wait']).describe('Single desktop action to perform.'),
      targetId: z.string().optional().describe('Target id from computer_observe for a grounded click.'),
      x: z.number().optional().describe('Global logical screen X coordinate.'),
      y: z.number().optional().describe('Global logical screen Y coordinate.'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button for click.'),
      clickCount: z.number().int().min(1).max(3).optional().describe('Number of clicks.'),
      text: z.string().optional().describe('Text for the type action.'),
      pressEnter: z.boolean().optional().describe('Press Enter after typing.'),
      keys: z.array(z.string()).optional().describe('Key chord for the key action.'),
      deltaX: z.number().optional().describe('Horizontal scroll delta.'),
      deltaY: z.number().optional().describe('Vertical scroll delta.'),
      app: z.string().optional().describe('Application name for open or focus.'),
      durationMs: z.number().int().min(0).max(30_000).optional().describe('Wait duration in milliseconds.'),
      captureAfter: z.boolean().optional().describe('Whether to return a fresh screenshot after the action.'),
    },
    handler: async (input: ComputerActInput) => {
      const resolved = toComputerAction(input)
      if ('error' in resolved)
        return invalidComputerActResponse(resolved.error)
      return await executeAction(resolved.action, 'computer_act')
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('computer_verify'),
    schema: {
      check: z.enum(['foreground_app', 'window_title', 'screenshot_ready']).describe('Host-owned state check to perform.'),
      expected: z.string().min(1).optional().describe('Expected app or window title. Required for foreground_app and window_title.'),
      executionId: z.string().min(1).optional().describe('Execution id returned by computer_act. Links verification evidence to one execution without changing its result.'),
    },
    handler: async (input: ComputerVerifyInput) => {
      if ((input.check === 'foreground_app' || input.check === 'window_title') && !input.expected)
        return invalidComputerVerifyResponse(`${input.check} requires expected.`)

      try {
        const refreshed = await refreshRuntimeRunState(runtime)
        const state = runtime.stateManager.getState()
        const observed = input.check === 'foreground_app'
          ? refreshed.context.appName
          : input.check === 'window_title'
            ? refreshed.context.windowTitle
            : undefined
        const screenshot = state.lastScreenshot
        const screenshotAvailable = Boolean(screenshot && !screenshot.placeholder)
        const verified = input.check === 'screenshot_ready'
          ? screenshotAvailable
          : matchesExpected(observed, input.expected!)
        const observedValue = input.check === 'screenshot_ready'
          ? {
              available: screenshotAvailable,
              placeholder: screenshot?.placeholder ?? false,
              capturedAt: screenshot?.capturedAt,
              width: screenshot?.width,
              height: screenshot?.height,
            }
          : observed

        const result = {
          content: [textContent(verified ? 'computer_verify: verified' : 'computer_verify: not verified')],
          structuredContent: {
            status: verified ? 'verified' : 'not_verified',
            check: input.check,
            expected: input.expected,
            observed: observedValue,
          },
        }
        return attachBusinessVerificationContract(result, {
          kind: 'business_verification',
          executionId: input.executionId,
          status: verified ? 'verified' : 'not_verified',
          check: input.check,
          expected: input.expected,
          observed: observedValue,
          evidenceRef: screenshot?.path,
          reason: verified ? 'The requested application state matched the current observation.' : 'The current application state did not match the requested expectation.',
        })
      }
      catch (error) {
        const message = errorMessageFromValue(error)
        return attachBusinessVerificationContract({
          isError: true,
          content: [textContent(`computer_verify failed: ${message}`)],
          structuredContent: { status: 'error', check: input.check, error: message },
        }, {
          kind: 'business_verification',
          executionId: input.executionId,
          status: 'unknown',
          check: input.check,
          expected: input.expected,
          reason: message,
        })
      }
    },
  })
}
