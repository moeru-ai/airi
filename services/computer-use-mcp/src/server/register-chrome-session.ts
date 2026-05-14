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

function getChromeSessionAction(runtime: ComputerUseServerRuntime): ActionInvocation {
  const sessionInfo = runtime.chromeSessionManager.getSessionInfo()
  return {
    kind: sessionInfo ? 'focus_app' : 'open_app',
    input: {
      app: CHROME_APP_NAME,
    },
  }
}

export async function executeChromeEnsure(
  runtime: ComputerUseServerRuntime,
  input: DesktopEnsureChromeApprovalInput,
  operationUnits?: number,
): Promise<CallToolResult> {
  const sessionInfo = await runtime.chromeSessionManager.ensureAgentWindow({
    url: input.url,
    cdpPort: input.cdpPort,
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
      appName: 'Google Chrome',
      windowId: sessionInfo.windowId,
      pid: sessionInfo.pid,
      agentLaunched: sessionInfo.agentOwned,
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
      cdpStatus = `connect failed: ${cdpError instanceof Error ? cdpError.message : String(cdpError)}`
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
      status: 'ok',
      pid: sessionInfo.pid,
      windowId: sessionInfo.windowId,
      agentOwned: sessionInfo.agentOwned,
      wasAlreadyRunning: sessionInfo.wasAlreadyRunning,
      cdpUrl: sessionInfo.cdpUrl,
      cdpStatus,
      initialUrl: sessionInfo.initialUrl,
    },
  }
}

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
      const policyAction = getChromeSessionAction(runtime)
      const ensureAction = {
        kind: TOOL_NAME,
        input: {
          ...(url !== undefined ? { url } : {}),
          ...(cdpPort !== undefined ? { cdpPort } : {}),
        },
      } satisfies { kind: 'desktop_ensure_chrome', input: DesktopEnsureChromeApprovalInput }
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
          event: 'requested',
          toolName: TOOL_NAME,
          action: ensureAction,
          context,
          policy: decision,
          result: {
            approvalAction: policyAction,
            executionTarget,
          },
        })

        if (!decision.allowed) {
          await runtime.session.record({
            event: 'denied',
            toolName: TOOL_NAME,
            action: ensureAction,
            context,
            policy: decision,
            result: {
              approvalAction: policyAction,
              executionTarget,
            },
          })

          return buildDeniedResponse(decision, context, executionTarget)
        }

        if (decision.requiresApproval) {
          const pending = runtime.session.createPendingAction({
            toolName: TOOL_NAME,
            action: ensureAction,
            context,
            policy: decision,
          })
          runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

          await runtime.session.record({
            event: 'approval_required',
            toolName: TOOL_NAME,
            action: ensureAction,
            context,
            policy: decision,
            result: {
              approvalAction: policyAction,
              executionTarget,
              pendingActionId: pending.id,
            },
          })

          return buildApprovalResponse(pending, decision, context, {
            intent: policyAction.kind === 'open_app'
              ? 'Open an agent Chrome window with CDP support'
              : 'Bring the agent Chrome window to the foreground',
            approvalReason: 'Starting or foregrounding Chrome is a mutating desktop action and follows the same approval and audit pipeline as other app-control tools.',
          })
        }

        const result = await executeChromeEnsure(runtime, ensureAction.input, decision.estimatedOperationUnits)
        await runtime.session.record({
          event: 'executed',
          toolName: TOOL_NAME,
          action: ensureAction,
          context,
          policy: decision,
          result: {
            approvalAction: policyAction,
            executionTarget,
            ...(typeof result.structuredContent === 'object' && result.structuredContent !== null
              ? result.structuredContent as Record<string, unknown>
              : {}),
          },
        })

        return result
      }
      catch (error) {
        const message = errorMessageFrom(error) ?? 'Unknown desktop_ensure_chrome failure'

        if (decision && context && executionTarget) {
          await runtime.session.record({
            event: 'failed',
            toolName: TOOL_NAME,
            action: ensureAction,
            context,
            policy: decision,
            result: {
              executionTarget,
              error: message,
            },
          })

          return buildExecutionErrorResponse({
            errorMessage: message,
            action: policyAction,
            context,
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
  })
}
