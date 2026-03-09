import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type {
  ActionInvocation,
  ComputerUseConfig,
  DesktopExecutor,
  PolicyDecision,
  ScreenshotArtifact,
  TerminalCommandResult,
  TerminalState,
} from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { evaluateActionPolicy } from '../policy'
import { getRuntimePreflight } from '../preflight'
import { buildCoordinateSpaceInfo } from '../runtime-probes'
import { evaluateStrategy, summarizeAdvisories } from '../strategy'
import { buildPointerTrace } from '../trace'
import {
  explainActionIntent,
  explainActionOutcome,
  explainApprovalReason,
} from '../transparency'
import { describeExecutionTarget } from './formatters'
import {
  buildApprovalResponse,
  buildDeniedResponse,
  buildExecutionErrorResponse,
  buildSuccessResponse,
} from './responses'

export interface ExecuteActionOptions {
  skipApprovalQueue?: boolean
}

export type ExecuteAction = (action: ActionInvocation, toolName: string, options?: ExecuteActionOptions) => Promise<CallToolResult>

function isMutatingAction(action: ActionInvocation) {
  return !['screenshot', 'observe_windows', 'wait', 'terminal_reset'].includes(action.kind)
}

async function captureOptionalScreenshot(params: {
  action: ActionInvocation
  executor: DesktopExecutor
  config: ComputerUseConfig
}) {
  let captureAfter = params.config.defaultCaptureAfter

  switch (params.action.kind) {
    case 'click':
    case 'type_text':
    case 'press_keys':
    case 'scroll':
    case 'wait':
      captureAfter = params.action.input.captureAfter ?? params.config.defaultCaptureAfter
      break
    case 'screenshot':
      captureAfter = true
      break
    default:
      captureAfter = false
      break
  }

  if (!captureAfter)
    return undefined

  return await params.executor.takeScreenshot({
    label: `${params.action.kind}-after`,
  })
}

function buildDeniedDecision(params: {
  decision: PolicyDecision
  issues: string[]
}): PolicyDecision {
  return {
    ...params.decision,
    allowed: false,
    reasons: [...params.decision.reasons, ...params.issues],
    reason: params.decision.reason || params.issues[0],
  }
}

function toScreenshotContent(screenshot: ScreenshotArtifact) {
  return {
    path: screenshot.path,
    publicUrl: screenshot.publicUrl,
    observationRef: screenshot.observationRef,
    width: screenshot.width,
    height: screenshot.height,
    placeholder: screenshot.placeholder ?? false,
    note: screenshot.note,
  }
}

function toTerminalStateContent(state: TerminalState) {
  return {
    effectiveCwd: state.effectiveCwd,
    lastExitCode: state.lastExitCode,
    lastCommandSummary: state.lastCommandSummary,
    approvalSessionActive: state.approvalSessionActive ?? false,
    approvalGrantedScope: state.approvalGrantedScope,
  }
}

export function createExecuteAction(runtime: ComputerUseServerRuntime): ExecuteAction {
  return async (action, toolName, options = {}) => {
    const [executionTarget, context, displayInfo] = await Promise.all([
      runtime.executor.getExecutionTarget(),
      runtime.executor.getForegroundContext(),
      runtime.executor.getDisplayInfo(),
    ])

    // Update run state with fresh context.
    runtime.stateManager.updateForegroundContext(context)
    runtime.stateManager.updateExecutionTarget(executionTarget)
    runtime.stateManager.updateDisplayInfo(displayInfo)
    runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

    const budget = runtime.session.getBudgetState()
    const preflight = getRuntimePreflight({
      config: runtime.config,
      lastScreenshot: runtime.session.getLastScreenshot(),
      displayInfo,
      executionTarget,
    })
    const decision = evaluateActionPolicy({
      action,
      config: runtime.config,
      context,
      operationsExecuted: budget.operationsExecuted,
      operationUnitsConsumed: budget.operationUnitsConsumed,
    })
    runtime.stateManager.updatePolicyDecision(decision)

    // Evaluate strategy advisories.
    const advisories = evaluateStrategy({
      proposedAction: action,
      state: runtime.stateManager.getState(),
      freshContext: context,
    })
    const advisorySummary = summarizeAdvisories(advisories)

    // Build transparency: explain what we're about to do and why.
    const intent = explainActionIntent(action, runtime.stateManager.getState())

    await runtime.session.record({
      event: 'requested',
      toolName,
      action,
      context,
      policy: decision,
      result: {
        executionTarget,
        displayInfo,
        coordinateSpace: preflight.coordinateSpace,
      },
    })

    if (preflight.blockingIssues.length > 0) {
      const deniedDecision = buildDeniedDecision({
        decision,
        issues: preflight.blockingIssues,
      })

      await runtime.session.record({
        event: 'denied',
        toolName,
        action,
        context,
        policy: deniedDecision,
        result: {
          executionTarget,
          coordinateSpace: preflight.coordinateSpace,
          launchContext: preflight.launchContext,
        },
      })

      return buildDeniedResponse(deniedDecision, context, executionTarget)
    }

    if (isMutatingAction(action) && preflight.mutationReadinessIssues.length > 0) {
      const deniedDecision = buildDeniedDecision({
        decision,
        issues: preflight.mutationReadinessIssues,
      })

      await runtime.session.record({
        event: 'denied',
        toolName,
        action,
        context,
        policy: deniedDecision,
        result: {
          executionTarget,
          coordinateSpace: preflight.coordinateSpace,
          launchContext: preflight.launchContext,
        },
      })

      return buildDeniedResponse(deniedDecision, context, executionTarget)
    }

    if (!decision.allowed) {
      await runtime.session.record({
        event: 'denied',
        toolName,
        action,
        context,
        policy: decision,
        result: {
          executionTarget,
        },
      })

      return buildDeniedResponse(decision, context, executionTarget)
    }

    if (decision.requiresApproval && !options.skipApprovalQueue) {
      const pending = runtime.session.createPendingAction({
        toolName,
        action,
        context,
        policy: decision,
      })
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

      await runtime.session.record({
        event: 'approval_required',
        toolName,
        action,
        context,
        policy: decision,
        result: {
          executionTarget,
          pendingActionId: pending.id,
        },
      })

      // Transparency: explain why approval is needed.
      const approvalExplanation = explainApprovalReason(action, decision, context)
      return buildApprovalResponse(pending, decision, context, {
        intent,
        approvalReason: approvalExplanation,
        advisorySummary,
      })
    }

    try {
      let backendResult: Record<string, unknown> = {}

      switch (action.kind) {
        case 'screenshot': {
          const screenshot = await runtime.executor.takeScreenshot(action.input)
          runtime.session.setLastScreenshot(screenshot)
          runtime.stateManager.updateLastScreenshot({
            path: screenshot.path,
            width: screenshot.width,
            height: screenshot.height,
            capturedAt: screenshot.capturedAt,
            placeholder: screenshot.placeholder ?? false,
            note: screenshot.note,
            executionTargetMode: screenshot.executionTargetMode,
            sourceHostName: screenshot.sourceHostName,
            sourceDisplayId: screenshot.sourceDisplayId,
            sourceSessionTag: screenshot.sourceSessionTag,
          })
          runtime.session.consumeOperation(decision.estimatedOperationUnits)

          await runtime.session.record({
            event: 'executed',
            toolName,
            action,
            context,
            policy: decision,
            result: {
              executionTarget,
              screenshotPath: screenshot.path,
              width: screenshot.width,
              height: screenshot.height,
              placeholder: screenshot.placeholder ?? false,
            },
          })

          return buildSuccessResponse({
            summary: `Screenshot captured (${screenshot.width || '?'}x${screenshot.height || '?'}) on ${describeExecutionTarget(executionTarget)}.`,
            screenshot,
            structuredContent: {
              status: 'executed',
              action: action.kind,
              context,
              policy: decision,
              launchContext: preflight.launchContext,
              executionTarget,
              displayInfo,
              coordinateSpace: buildCoordinateSpaceInfo({
                config: runtime.config,
                lastScreenshot: runtime.session.getLastScreenshot(),
                displayInfo,
              }),
              screenshot: toScreenshotContent(screenshot),
            },
          })
        }
        case 'observe_windows': {
          const observation = await runtime.executor.observeWindows(action.input)
          runtime.stateManager.updateWindowObservation(observation)
          backendResult = { observation }
          break
        }
        case 'open_app': {
          const result = await runtime.executor.openApp(action.input)
          backendResult = {
            ...result,
            app: action.input.app,
          }
          break
        }
        case 'focus_app': {
          const result = await runtime.executor.focusApp(action.input)
          backendResult = {
            ...result,
            app: action.input.app,
          }
          break
        }
        case 'click': {
          const pointerTrace = buildPointerTrace({
            from: runtime.session.getPointerPosition(),
            to: { x: action.input.x, y: action.input.y },
            bounds: runtime.config.allowedBounds,
          })
          const result = await runtime.executor.click({
            ...action.input,
            pointerTrace,
          })
          runtime.session.setPointerPosition({ x: action.input.x, y: action.input.y })
          backendResult = {
            ...result,
            pointerTrace,
          }
          break
        }
        case 'type_text': {
          if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
            const pointerTrace = buildPointerTrace({
              from: runtime.session.getPointerPosition(),
              to: { x: action.input.x, y: action.input.y },
              bounds: runtime.config.allowedBounds,
            })
            // NOTICE: The preparatory click must succeed before we type.
            // If focus fails the text would go to the wrong element.
            try {
              await runtime.executor.click({
                x: action.input.x,
                y: action.input.y,
                button: 'left',
                clickCount: 1,
                pointerTrace,
              })
              runtime.session.setPointerPosition({ x: action.input.x, y: action.input.y })
              backendResult.focusPointerTrace = pointerTrace
            }
            catch (clickError) {
              const msg = clickError instanceof Error ? clickError.message : String(clickError)
              throw new Error(`Preparatory click at (${action.input.x}, ${action.input.y}) failed before typing: ${msg}`)
            }
          }
          const result = await runtime.executor.typeText(action.input)
          backendResult = {
            ...backendResult,
            ...result,
          }
          break
        }
        case 'press_keys': {
          const result = await runtime.executor.pressKeys(action.input)
          backendResult = { ...result }
          break
        }
        case 'scroll': {
          const result = await runtime.executor.scroll(action.input)
          if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
            runtime.session.setPointerPosition({ x: action.input.x, y: action.input.y })
          }
          backendResult = { ...result }
          break
        }
        case 'wait': {
          const result = await runtime.executor.wait(action.input)
          backendResult = { ...result }
          break
        }
        case 'terminal_exec': {
          const result = await runtime.terminalRunner.execute(action.input)
          runtime.session.setTerminalState(runtime.terminalRunner.getState())
          runtime.stateManager.updateTerminalResult(result)
          backendResult = {
            ...result,
            terminalState: toTerminalStateContent(runtime.session.getTerminalState()),
          }
          break
        }
        case 'terminal_reset': {
          const state = runtime.terminalRunner.resetState(action.input.reason)
          runtime.session.setTerminalState(state)
          backendResult = {
            terminalState: toTerminalStateContent(state),
          }
          break
        }
      }

      runtime.session.consumeOperation(decision.estimatedOperationUnits)
      const screenshot = await captureOptionalScreenshot({
        action,
        executor: runtime.executor,
        config: runtime.config,
      })
      if (screenshot) {
        runtime.session.setLastScreenshot(screenshot)
        runtime.stateManager.updateLastScreenshot({
          path: screenshot.path,
          width: screenshot.width,
          height: screenshot.height,
          capturedAt: screenshot.capturedAt,
          placeholder: screenshot.placeholder ?? false,
          note: screenshot.note,
          executionTargetMode: screenshot.executionTargetMode,
          sourceHostName: screenshot.sourceHostName,
          sourceDisplayId: screenshot.sourceDisplayId,
          sourceSessionTag: screenshot.sourceSessionTag,
        })
      }

      // Transparency: explain what just happened.
      const outcome = explainActionOutcome({
        action,
        succeeded: true,
        terminalResult: action.kind === 'terminal_exec' ? (backendResult as unknown as TerminalCommandResult) : undefined,
        context,
      })

      await runtime.session.record({
        event: 'executed',
        toolName,
        action,
        context,
        policy: decision,
        result: {
          ...backendResult,
          executionTarget,
          screenshotPath: screenshot?.path,
          displayInfo,
        },
      })

      return buildSuccessResponse({
        summary: `${intent} ${outcome}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
        screenshot,
        structuredContent: {
          status: 'executed',
          action: action.kind,
          context,
          policy: decision,
          launchContext: preflight.launchContext,
          executionTarget,
          displayInfo,
          coordinateSpace: buildCoordinateSpaceInfo({
            config: runtime.config,
            lastScreenshot: runtime.session.getLastScreenshot(),
            displayInfo,
          }),
          backendResult,
          terminalState: action.kind.startsWith('terminal_') ? toTerminalStateContent(runtime.session.getTerminalState()) : undefined,
          screenshot: screenshot
            ? toScreenshotContent(screenshot)
            : undefined,
          // Transparency fields.
          transparency: {
            intent,
            outcome,
            advisories: advisories.map(a => ({ kind: a.kind, reason: a.reason })),
          },
        },
      })
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Update run state with failure info.
      if (runtime.stateManager.hasActiveTask()) {
        runtime.stateManager.completeCurrentStep('failure', errorMessage)
      }

      // Transparency: explain what failed.
      const failureExplanation = explainActionOutcome({
        action,
        succeeded: false,
        errorMessage,
        context,
      })

      await runtime.session.record({
        event: 'failed',
        toolName,
        action,
        context,
        policy: decision,
        result: {
          executionTarget,
          error: errorMessage,
        },
      })

      return buildExecutionErrorResponse({
        errorMessage: `${failureExplanation}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
        action,
        context,
        executionTarget,
        policy: decision,
      })
    }
  }
}
