/**
 * MCP tool registration for `desktop_ensure_chrome`.
 *
 * Ensures the agent has a dedicated Chrome window with CDP support.
 * Idempotent — calling repeatedly returns the existing session.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ActionInvocation, DesktopEnsureChromeApprovalInput, ForegroundContext, PolicyDecision } from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { evaluateActionPolicy } from '../policy'
import { errorMessageFromValue } from '../utils/error-message'
import { textContent } from './content'
import { refreshRuntimeRunState } from './refresh-run-state'
import {
  buildApprovalResponse,
  buildDeniedResponse,
  buildExecutionErrorResponse,
} from './responses'
import { registerToolWithDescriptor, requireDescriptor } from './tool-descriptors/register-helper'

const TOOL_NAME = 'desktop_ensure_chrome'
const CHROME_APP_NAME = 'Google Chrome'

export async function executeChromeEnsure(
  runtime: ComputerUseServerRuntime,
  input: DesktopEnsureChromeApprovalInput,
  operationUnits?: number,
): Promise<CallToolResult> {
  const sessionInfo = await runtime.chromeSessionManager.ensureAgentWindow({
    cdpPort: input.cdpPort,
    url: input.url,
  })

  // Persist in state
  runtime.stateManager.updateChromeSession(sessionInfo)

  // Auto-begin a desktop session targeting Chrome
  // This enables observe/click handlers to use session-based foreground enforcement
  const sessionCtrl = runtime.desktopSessionController
  if (!sessionCtrl.getSession()) {
    const currentForeground = runtime.stateManager.getState().foregroundContext
    sessionCtrl.begin({
      controlledApp: 'Google Chrome',
      currentForeground,
    })
    sessionCtrl.addOwnedWindow({
      agentLaunched: sessionInfo.agentOwned,
      appName: 'Google Chrome',
      pid: sessionInfo.pid,
      windowId: sessionInfo.windowId,
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

  // Auto-connect CDP bridge when the agent owns Chrome and CDP is available.
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
      cdpStatus = `connect failed: ${errorMessageFromValue(cdpError)}`
    }
  }

  const lines = [
    'Chrome session launched:',
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

  if (operationUnits !== undefined) {
    runtime.session.consumeOperation(operationUnits)
  }

  return {
    content: [textContent(lines.join('\n'))],
    structuredContent: {
      agentOwned: sessionInfo.agentOwned,
      cdpStatus,
      cdpUrl: sessionInfo.cdpUrl,
      initialUrl: sessionInfo.initialUrl,
      pid: sessionInfo.pid,
      status: 'ok',
      wasAlreadyRunning: sessionInfo.wasAlreadyRunning,
      windowId: sessionInfo.windowId,
    },
  }
}

export function registerChromeSessionTools(params: {
  runtime: ComputerUseServerRuntime
  server: McpServer
}) {
  const { runtime, server } = params

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('desktop_ensure_chrome'),

    handler: async ({ cdpPort, url }) => {
      const policyAction = getChromeSessionAction(runtime)
      const ensureAction = {
        input: {
          ...(url !== undefined ? { url } : {}),
          ...(cdpPort !== undefined ? { cdpPort } : {}),
        },
        kind: TOOL_NAME,
      } satisfies { input: DesktopEnsureChromeApprovalInput, kind: 'desktop_ensure_chrome' }
      let decision: PolicyDecision | undefined
      let context: ForegroundContext | undefined
      let executionTarget: Awaited<ReturnType<typeof refreshRuntimeRunState>>['executionTarget'] | undefined

      try {
        const refreshed = await refreshRuntimeRunState(runtime)
        context = refreshed.context
        executionTarget = refreshed.executionTarget

        const budget = runtime.session.getBudgetState()
        decision = evaluateActionPolicy({
          action: policyAction,
          config: runtime.config,
          context,
          operationsExecuted: budget.operationsExecuted,
          operationUnitsConsumed: budget.operationUnitsConsumed,
        })
        runtime.stateManager.updatePolicyDecision(decision)

        await runtime.session.record({
          action: ensureAction,
          context,
          event: 'requested',
          policy: decision,
          result: {
            approvalAction: policyAction,
            executionTarget,
          },
          toolName: TOOL_NAME,
        })

        if (!decision.allowed) {
          await runtime.session.record({
            action: ensureAction,
            context,
            event: 'denied',
            policy: decision,
            result: {
              approvalAction: policyAction,
              executionTarget,
            },
            toolName: TOOL_NAME,
          })

          return buildDeniedResponse(decision, context, executionTarget)
        }

        if (decision.requiresApproval) {
          const pending = runtime.session.createPendingAction({
            action: ensureAction,
            context,
            policy: decision,
            toolName: TOOL_NAME,
          })
          runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

          await runtime.session.record({
            action: ensureAction,
            context,
            event: 'approval_required',
            policy: decision,
            result: {
              approvalAction: policyAction,
              executionTarget,
              pendingActionId: pending.id,
            },
            toolName: TOOL_NAME,
          })

          return buildApprovalResponse(pending, decision, context, {
            approvalReason: 'Starting or foregrounding Chrome is a mutating desktop action and follows the same approval and audit pipeline as other app-control tools.',
            intent: policyAction.kind === 'open_app'
              ? 'Open an agent Chrome window with CDP support'
              : 'Bring the agent Chrome window to the foreground',
          })
        }

        const result = await executeChromeEnsure(runtime, ensureAction.input, decision.estimatedOperationUnits)
        await runtime.session.record({
          action: ensureAction,
          context,
          event: 'executed',
          policy: decision,
          result: {
            approvalAction: policyAction,
            executionTarget,
            ...(typeof result.structuredContent === 'object' && result.structuredContent !== null
              ? result.structuredContent as Record<string, unknown>
              : {}),
          },
          toolName: TOOL_NAME,
        })

        return result
      }
      catch (error) {
        const message = errorMessageFrom(error) ?? 'Unknown desktop_ensure_chrome failure'

        if (decision && context && executionTarget) {
          await runtime.session.record({
            action: ensureAction,
            context,
            event: 'failed',
            policy: decision,
            result: {
              error: message,
              executionTarget,
            },
            toolName: TOOL_NAME,
          })

          return buildExecutionErrorResponse({
            action: policyAction,
            context,
            errorMessage: message,
            executionTarget,
            policy: decision,
          })
        }

        return {
          content: [textContent(`desktop_ensure_chrome failed: ${message}`)],
          isError: true,
        }
      }
    },

    schema: {
      cdpPort: z.number().int().min(1024).max(65535).optional().describe('CDP debugging port (default: 9222).'),
      url: z.string().optional().describe('Optional URL to navigate to in the new Chrome window.'),
    },
  })
}

function getChromeSessionAction(runtime: ComputerUseServerRuntime): ActionInvocation {
  const sessionInfo = runtime.chromeSessionManager.getSessionInfo()
  return {
    input: {
      app: CHROME_APP_NAME,
    },
    kind: sessionInfo ? 'focus_app' : 'open_app',
  }
}
