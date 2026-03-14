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

import { normalizeConfiguredAppAction } from '../app-aliases'
import { CodingPrimitives } from '../coding/primitives'
import {
  buildCodingApplyPatchBackendResult,
  buildCodingReadFileBackendResult,
} from '../coding/result-shape'
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
import {
  maskClipboardPreview,
  readClipboardText,
  writeClipboardText,
} from '../utils/clipboard'
import {
  maskEnvValuePreview,
  readEnvValue,
} from '../utils/env-file'
import { describeExecutionTarget } from './formatters'
import { refreshRuntimeRunState } from './refresh-run-state'
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
  return !['screenshot', 'observe_windows', 'wait', 'terminal_reset', 'clipboard_read_text', 'secret_read_env_value'].includes(action.kind)
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
    const normalizedAction = normalizeConfiguredAppAction(action, runtime.config.openableApps)
    const { executionTarget, context, displayInfo } = await refreshRuntimeRunState(runtime)

    const budget = runtime.session.getBudgetState()
    const preflight = getRuntimePreflight({
      config: runtime.config,
      lastScreenshot: runtime.session.getLastScreenshot(),
      displayInfo,
      executionTarget,
    })
    const decision = evaluateActionPolicy({
      action: normalizedAction,
      config: runtime.config,
      context,
      operationsExecuted: budget.operationsExecuted,
      operationUnitsConsumed: budget.operationUnitsConsumed,
    })
    runtime.stateManager.updatePolicyDecision(decision)

    // Evaluate strategy advisories.
    const advisories = evaluateStrategy({
      proposedAction: normalizedAction,
      state: runtime.stateManager.getState(),
      freshContext: context,
    })
    const advisorySummary = summarizeAdvisories(advisories)

    // Build transparency: explain what we're about to do and why.
    const intent = explainActionIntent(normalizedAction, runtime.stateManager.getState())

    await runtime.session.record({
      event: 'requested',
      toolName,
      action: normalizedAction,
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
        action: normalizedAction,
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

    if (isMutatingAction(normalizedAction) && preflight.mutationReadinessIssues.length > 0) {
      const deniedDecision = buildDeniedDecision({
        decision,
        issues: preflight.mutationReadinessIssues,
      })

      await runtime.session.record({
        event: 'denied',
        toolName,
        action: normalizedAction,
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
        action: normalizedAction,
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
        action: normalizedAction,
        context,
        policy: decision,
      })
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

      await runtime.session.record({
        event: 'approval_required',
        toolName,
        action: normalizedAction,
        context,
        policy: decision,
        result: {
          executionTarget,
          pendingActionId: pending.id,
        },
      })

      // Transparency: explain why approval is needed.
      const approvalExplanation = explainApprovalReason(normalizedAction, decision, context)
      return buildApprovalResponse(pending, decision, context, {
        intent,
        approvalReason: approvalExplanation,
        advisorySummary,
      })
    }

    try {
      let backendResult: Record<string, unknown> = {}
      let clipboardStructuredContent: Record<string, unknown> | undefined
      let secretStructuredContent: Record<string, unknown> | undefined

      switch (normalizedAction.kind) {
        // Coding Execution Core actions
        case 'coding_review_workspace': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.reviewWorkspace(normalizedAction.input.workspacePath)
          backendResult = result
          break
        }

        case 'coding_read_file': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.readFile(normalizedAction.input.filePath, normalizedAction.input.startLine, normalizedAction.input.endLine)
          backendResult = buildCodingReadFileBackendResult({
            filePath: normalizedAction.input.filePath,
            content: result,
            startLine: normalizedAction.input.startLine,
            endLine: normalizedAction.input.endLine,
          })
          break
        }
        case 'coding_apply_patch': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.applyPatch(normalizedAction.input.filePath, normalizedAction.input.oldString, normalizedAction.input.newString)
          backendResult = buildCodingApplyPatchBackendResult({
            filePath: normalizedAction.input.filePath,
            summary: result,
          })
          break
        }
        case 'coding_compress_context': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.compressContext(normalizedAction.input.goal, normalizedAction.input.filesSummary, normalizedAction.input.recentResultSummary, normalizedAction.input.unresolvedIssues, normalizedAction.input.nextStepRecommendation)
          backendResult = result
          break
        }
        case 'coding_report_status': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.reportStatus(normalizedAction.input.status, normalizedAction.input.summary, normalizedAction.input.filesTouched, normalizedAction.input.commandsRun, normalizedAction.input.checks, normalizedAction.input.nextStep)
          backendResult = result
          break
        }

        case 'screenshot': {
          const screenshot = await runtime.executor.takeScreenshot(normalizedAction.input)
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
            action: normalizedAction,
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
              action: normalizedAction.kind,
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
          const observation = await runtime.executor.observeWindows(normalizedAction.input)
          runtime.stateManager.updateWindowObservation(observation)
          backendResult = { observation }
          break
        }
        case 'open_app': {
          const result = await runtime.executor.openApp(normalizedAction.input)
          backendResult = {
            ...result,
            app: normalizedAction.input.app,
          }
          break
        }
        case 'focus_app': {
          const result = await runtime.executor.focusApp(normalizedAction.input)
          backendResult = {
            ...result,
            app: normalizedAction.input.app,
          }
          break
        }
        case 'click': {
          const pointerTrace = buildPointerTrace({
            from: runtime.session.getPointerPosition(),
            to: { x: normalizedAction.input.x, y: normalizedAction.input.y },
            bounds: runtime.config.allowedBounds,
          })
          const result = await runtime.executor.click({
            ...normalizedAction.input,
            pointerTrace,
          })
          runtime.session.setPointerPosition({ x: normalizedAction.input.x, y: normalizedAction.input.y })
          backendResult = {
            ...result,
            pointerTrace,
          }
          break
        }
        case 'type_text': {
          if (typeof normalizedAction.input.x === 'number' && typeof normalizedAction.input.y === 'number') {
            const pointerTrace = buildPointerTrace({
              from: runtime.session.getPointerPosition(),
              to: { x: normalizedAction.input.x, y: normalizedAction.input.y },
              bounds: runtime.config.allowedBounds,
            })
            // NOTICE: The preparatory click must succeed before we type.
            // If focus fails the text would go to the wrong element.
            try {
              await runtime.executor.click({
                x: normalizedAction.input.x,
                y: normalizedAction.input.y,
                button: 'left',
                clickCount: 1,
                pointerTrace,
              })
              runtime.session.setPointerPosition({ x: normalizedAction.input.x, y: normalizedAction.input.y })
              backendResult.focusPointerTrace = pointerTrace
            }
            catch (clickError) {
              const msg = clickError instanceof Error ? clickError.message : String(clickError)
              throw new Error(`Preparatory click at (${normalizedAction.input.x}, ${normalizedAction.input.y}) failed before typing: ${msg}`)
            }
          }
          const result = await runtime.executor.typeText(normalizedAction.input)
          backendResult = {
            ...backendResult,
            ...result,
          }
          break
        }
        case 'press_keys': {
          const result = await runtime.executor.pressKeys(normalizedAction.input)
          backendResult = { ...result }
          break
        }
        case 'scroll': {
          const result = await runtime.executor.scroll(normalizedAction.input)
          if (typeof normalizedAction.input.x === 'number' && typeof normalizedAction.input.y === 'number') {
            runtime.session.setPointerPosition({ x: normalizedAction.input.x, y: normalizedAction.input.y })
          }
          backendResult = { ...result }
          break
        }
        case 'wait': {
          const result = await runtime.executor.wait(normalizedAction.input)
          backendResult = { ...result }
          break
        }
        case 'terminal_exec': {
          const result = await runtime.terminalRunner.execute(normalizedAction.input)
          runtime.session.setTerminalState(runtime.terminalRunner.getState())
          runtime.stateManager.updateTerminalResult(result)
          backendResult = {
            ...result,
            terminalState: toTerminalStateContent(runtime.session.getTerminalState()),
          }
          break
        }
        case 'terminal_reset': {
          const state = runtime.terminalRunner.resetState(normalizedAction.input.reason)
          runtime.session.setTerminalState(state)
          backendResult = {
            terminalState: toTerminalStateContent(state),
          }
          break
        }
        case 'secret_read_env_value': {
          const result = await readEnvValue(normalizedAction.input)
          backendResult = {
            filePath: result.filePath,
            key: result.key,
            valueLength: result.value.length,
            preview: maskEnvValuePreview(result.value),
          }
          secretStructuredContent = {
            filePath: result.filePath,
            key: result.key,
            value: result.value,
            valueLength: result.value.length,
          }
          break
        }
        case 'clipboard_read_text': {
          const result = await readClipboardText(runtime.config, normalizedAction.input)
          backendResult = {
            textLength: result.originalLength,
            returnedLength: result.returnedLength,
            trimmed: result.trimmed,
            truncated: result.truncated,
            preview: maskClipboardPreview(result.text),
          }
          clipboardStructuredContent = {
            text: result.text,
            textLength: result.originalLength,
            returnedLength: result.returnedLength,
            trimmed: result.trimmed,
            truncated: result.truncated,
          }
          break
        }
        case 'clipboard_write_text': {
          const result = await writeClipboardText(runtime.config, normalizedAction.input.text)
          backendResult = {
            textLength: result.textLength,
            preview: maskClipboardPreview(normalizedAction.input.text),
          }
          clipboardStructuredContent = {
            textLength: result.textLength,
          }
          break
        }
      }

      runtime.session.consumeOperation(decision.estimatedOperationUnits)
      const screenshot = await captureOptionalScreenshot({
        action: normalizedAction,
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
        action: normalizedAction,
        succeeded: true,
        terminalResult: normalizedAction.kind === 'terminal_exec' ? (backendResult as unknown as TerminalCommandResult) : undefined,
        context,
      })

      await runtime.session.record({
        event: 'executed',
        toolName,
        action: normalizedAction,
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
          action: normalizedAction.kind,
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
          secret: secretStructuredContent,
          clipboard: clipboardStructuredContent,
          terminalState: normalizedAction.kind.startsWith('terminal_') ? toTerminalStateContent(runtime.session.getTerminalState()) : undefined,
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
        action: normalizedAction,
        succeeded: false,
        errorMessage,
        context,
      })

      await runtime.session.record({
        event: 'failed',
        toolName,
        action: normalizedAction,
        context,
        policy: decision,
        result: {
          executionTarget,
          error: errorMessage,
        },
      })

      return buildExecutionErrorResponse({
        errorMessage: `${failureExplanation}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
        action: normalizedAction,
        context,
        executionTarget,
        policy: decision,
      })
    }
  }
}
