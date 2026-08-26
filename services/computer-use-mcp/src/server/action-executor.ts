import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { DisplayPointResolution, MultiDisplaySnapshot } from '../display'
import type {
  ActionInvocation,
  ComputerUseConfig,
  DesktopExecutor,
  DisplayInfo,
  ForegroundContext,
  PolicyDecision,
  ScreenshotArtifact,
  TerminalCommandResult,
  TerminalState,
} from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { normalizeConfiguredAppAction } from '../app-aliases'
import { decideBrowserTypeAction } from '../browser-action-router'
import { isBrowserDomActionSupported } from '../browser-dom/capabilities'
import { resolveDisplayPoint } from '../display'
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
import { errorMessageFromValue } from '../utils/error-message'
import { executeDesktopClickTarget } from './desktop-grounding-actions'
import { describeExecutionTarget } from './formatters'
import { refreshRuntimeRunState } from './refresh-run-state'
import {
  buildApprovalResponse,
  buildDeniedResponse,
  buildExecutionErrorResponse,
  buildSuccessResponse,
} from './responses'

export type ExecuteAction = (action: ActionInvocation, toolName: string, options?: ExecuteActionOptions) => Promise<CallToolResult>

export interface ExecuteActionOptions {
  skipApprovalQueue?: boolean
}

export function createExecuteAction(runtime: ComputerUseServerRuntime): ExecuteAction {
  return async (action, toolName, options = {}) => {
    const normalizedAction = normalizeConfiguredAppAction(action, runtime.config.openableApps)
    const { context: actualContext, displayInfo, executionTarget } = await refreshRuntimeRunState(runtime)
    const context = getPolicyEvaluationContext({
      action: normalizedAction,
      actualContext,
      runtime,
    })
    const actualForegroundContext = context === actualContext ? undefined : actualContext

    const budget = runtime.session.getBudgetState()
    const preflight = getRuntimePreflight({
      config: runtime.config,
      displayInfo,
      executionTarget,
      lastScreenshot: runtime.session.getLastScreenshot(),
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
      freshContext: context,
      proposedAction: normalizedAction,
      state: runtime.stateManager.getState(),
    })
    const advisorySummary = summarizeAdvisories(advisories)

    // Build transparency: explain what we're about to do and why.
    const intent = explainActionIntent(normalizedAction, runtime.stateManager.getState())

    await runtime.session.record({
      action: normalizedAction,
      context,
      event: 'requested',
      policy: decision,
      result: {
        actualForegroundContext,
        coordinateSpace: preflight.coordinateSpace,
        displayInfo,
        executionTarget,
      },
      toolName,
    })

    if (preflight.blockingIssues.length > 0) {
      const deniedDecision = buildDeniedDecision({
        decision,
        issues: preflight.blockingIssues,
      })

      await runtime.session.record({
        action: normalizedAction,
        context,
        event: 'denied',
        policy: deniedDecision,
        result: {
          coordinateSpace: preflight.coordinateSpace,
          executionTarget,
          launchContext: preflight.launchContext,
        },
        toolName,
      })

      return buildDeniedResponse(deniedDecision, context, executionTarget)
    }

    if (isMutatingAction(normalizedAction) && preflight.mutationReadinessIssues.length > 0) {
      const deniedDecision = buildDeniedDecision({
        decision,
        issues: preflight.mutationReadinessIssues,
      })

      await runtime.session.record({
        action: normalizedAction,
        context,
        event: 'denied',
        policy: deniedDecision,
        result: {
          coordinateSpace: preflight.coordinateSpace,
          executionTarget,
          launchContext: preflight.launchContext,
        },
        toolName,
      })

      return buildDeniedResponse(deniedDecision, context, executionTarget)
    }

    if (!decision.allowed) {
      await runtime.session.record({
        action: normalizedAction,
        context,
        event: 'denied',
        policy: decision,
        result: {
          executionTarget,
        },
        toolName,
      })

      return buildDeniedResponse(decision, context, executionTarget)
    }

    const actionDisplayPoint = resolveActionDisplayPoint(normalizedAction, displayInfo)
    if (actionDisplayPoint?.status === 'outside') {
      const deniedDecision = buildDeniedDecision({
        decision,
        issues: [actionDisplayPoint.reason],
      })

      await runtime.session.record({
        action: normalizedAction,
        context,
        event: 'denied',
        policy: deniedDecision,
        result: {
          coordinateSpace: preflight.coordinateSpace,
          displayInfo,
          executionTarget,
          targetPoint: actionDisplayPoint.target,
        },
        toolName,
      })

      return buildDeniedResponse(deniedDecision, context, executionTarget)
    }
    const structuredDisplayPoint = actionDisplayPoint?.status === 'ok'
      ? actionDisplayPoint.structured
      : undefined

    if (decision.requiresApproval && !options.skipApprovalQueue) {
      const pending = runtime.session.createPendingAction({
        action: normalizedAction,
        context,
        policy: decision,
        toolName,
      })
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

      await runtime.session.record({
        action: normalizedAction,
        context,
        event: 'approval_required',
        policy: decision,
        result: {
          executionTarget,
          pendingActionId: pending.id,
        },
        toolName,
      })

      // Transparency: explain why approval is needed.
      const approvalExplanation = explainApprovalReason(normalizedAction, decision, context)
      return buildApprovalResponse(pending, decision, context, {
        advisorySummary,
        approvalReason: approvalExplanation,
        intent,
      })
    }

    try {
      let backendResult: Record<string, unknown> = {}
      let clipboardStructuredContent: Record<string, unknown> | undefined
      let secretStructuredContent: Record<string, unknown> | undefined
      let summaryOverride: string | undefined

      switch (normalizedAction.kind) {
        case 'click': {
          const pointerTrace = buildPointerTrace({
            bounds: runtime.config.allowedBounds,
            from: runtime.session.getPointerPosition(),
            to: { x: normalizedAction.input.x, y: normalizedAction.input.y },
          })
          const result = await runtime.executor.click({
            ...normalizedAction.input,
            pointerTrace,
          })
          runtime.session.setPointerPosition({ x: normalizedAction.input.x, y: normalizedAction.input.y })
          backendResult = {
            ...result,
            displayPoint: structuredDisplayPoint,
            pointerTrace,
          }
          break
        }
        case 'clipboard_read_text': {
          const result = await readClipboardText(runtime.config, normalizedAction.input)
          backendResult = {
            preview: maskClipboardPreview(result.text),
            returnedLength: result.returnedLength,
            textLength: result.originalLength,
            trimmed: result.trimmed,
            truncated: result.truncated,
          }
          clipboardStructuredContent = {
            returnedLength: result.returnedLength,
            text: result.text,
            textLength: result.originalLength,
            trimmed: result.trimmed,
            truncated: result.truncated,
          }
          break
        }
        case 'clipboard_write_text': {
          const result = await writeClipboardText(runtime.config, normalizedAction.input.text)
          backendResult = {
            preview: maskClipboardPreview(normalizedAction.input.text),
            textLength: result.textLength,
          }
          clipboardStructuredContent = {
            textLength: result.textLength,
          }
          break
        }
        case 'desktop_click_target': {
          const result = await executeDesktopClickTarget(runtime, normalizedAction.input)
          backendResult = result.backendResult
          summaryOverride = result.summary
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
        case 'press_keys': {
          const result = await runtime.executor.pressKeys(normalizedAction.input)
          backendResult = { ...result }
          break
        }
        case 'screenshot': {
          const screenshot = await runtime.executor.takeScreenshot(normalizedAction.input)
          runtime.session.setLastScreenshot(screenshot)
          runtime.stateManager.updateLastScreenshot({
            capturedAt: screenshot.capturedAt,
            executionTargetMode: screenshot.executionTargetMode,
            height: screenshot.height,
            note: screenshot.note,
            path: screenshot.path,
            placeholder: screenshot.placeholder ?? false,
            sourceDisplayId: screenshot.sourceDisplayId,
            sourceHostName: screenshot.sourceHostName,
            sourceSessionTag: screenshot.sourceSessionTag,
            width: screenshot.width,
          })
          runtime.session.consumeOperation(decision.estimatedOperationUnits)

          await runtime.session.record({
            action: normalizedAction,
            context,
            event: 'executed',
            policy: decision,
            result: {
              executionTarget,
              height: screenshot.height,
              placeholder: screenshot.placeholder ?? false,
              screenshotPath: screenshot.path,
              width: screenshot.width,
            },
            toolName,
          })

          return buildSuccessResponse({
            screenshot,
            structuredContent: {
              action: normalizedAction.kind,
              context,
              coordinateSpace: buildCoordinateSpaceInfo({
                config: runtime.config,
                displayInfo,
                lastScreenshot: runtime.session.getLastScreenshot(),
              }),
              displayInfo,
              executionTarget,
              launchContext: preflight.launchContext,
              policy: decision,
              screenshot: toScreenshotContent(screenshot),
              status: 'executed',
            },
            summary: `Screenshot captured (${screenshot.width || '?'}x${screenshot.height || '?'}) on ${describeExecutionTarget(executionTarget)}.`,
          })
        }
        case 'scroll': {
          const result = await runtime.executor.scroll(normalizedAction.input)
          if (typeof normalizedAction.input.x === 'number' && typeof normalizedAction.input.y === 'number') {
            runtime.session.setPointerPosition({ x: normalizedAction.input.x, y: normalizedAction.input.y })
          }
          backendResult = {
            ...result,
            displayPoint: structuredDisplayPoint,
          }
          break
        }
        case 'secret_read_env_value': {
          const result = await readEnvValue(normalizedAction.input)
          backendResult = {
            filePath: result.filePath,
            key: result.key,
            preview: maskEnvValuePreview(result.value),
            valueLength: result.value.length,
          }
          secretStructuredContent = {
            filePath: result.filePath,
            key: result.key,
            value: result.value,
            valueLength: result.value.length,
          }
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
        case 'type_text': {
          const hasExplicitCoordinates
            = typeof normalizedAction.input.x === 'number'
              && typeof normalizedAction.input.y === 'number'

          if (hasExplicitCoordinates) {
            const pointerTrace = buildPointerTrace({
              bounds: runtime.config.allowedBounds,
              from: runtime.session.getPointerPosition(),
              to: { x: normalizedAction.input.x, y: normalizedAction.input.y },
            })
            // NOTICE: The preparatory click must succeed before we type.
            // If focus fails the text would go to the wrong element.
            try {
              await runtime.executor.click({
                button: 'left',
                clickCount: 1,
                pointerTrace,
                x: normalizedAction.input.x,
                y: normalizedAction.input.y,
              })
              runtime.session.setPointerPosition({ x: normalizedAction.input.x, y: normalizedAction.input.y })
              backendResult.focusPointerTrace = pointerTrace
              backendResult.focusDisplayPoint = structuredDisplayPoint
            }
            catch (clickError) {
              const msg = errorMessageFromValue(clickError)
              throw new Error(`Preparatory click at (${normalizedAction.input.x}, ${normalizedAction.input.y}) failed before typing: ${msg}`)
            }
          }

          // Browser-dom type routing: if the last clicked grounding candidate
          // is a chrome_dom text input, use setInputValue for DOM precision
          let usedBrowserDom = false
          const runState = runtime.stateManager.getState()
          const lastSnapshot = runState.lastGroundingSnapshot
          const lastClickedId = runState.lastClickedCandidateId
          if (!hasExplicitCoordinates && lastClickedId && lastSnapshot) {
            const lastCandidate = lastSnapshot.targetCandidates.find(
              c => c.id === lastClickedId,
            )
            if (lastCandidate) {
              const bridgeConnected = runtime.browserDomBridge?.getStatus().connected ?? false
              const typeDecision = decideBrowserTypeAction(lastCandidate, bridgeConnected)
              if (
                typeDecision.route === 'browser_dom'
                && typeDecision.selector
                && isBrowserDomActionSupported(runtime.browserDomBridge, 'setInputValue')
              ) {
                try {
                  await runtime.browserDomBridge!.setInputValue({
                    blur: !normalizedAction.input.pressEnter,
                    frameIds: typeDecision.frameId !== undefined
                      ? [typeDecision.frameId]
                      : undefined,
                    selector: typeDecision.selector,
                    simulateKeystrokes: false,
                    value: normalizedAction.input.text,
                  })
                  usedBrowserDom = true
                  backendResult.browserDomRoute = {
                    method: 'setInputValue',
                    reason: typeDecision.reason,
                    selector: typeDecision.selector,
                  }
                }
                catch {
                  // Fallback to OS typeText below
                }
              }
            }
          }

          if (!usedBrowserDom) {
            const result = await runtime.executor.typeText(normalizedAction.input)
            backendResult = {
              ...backendResult,
              ...result,
            }
          }

          // Handle pressEnter even when browser-dom was used
          if (usedBrowserDom && normalizedAction.input.pressEnter) {
            await runtime.executor.pressKeys({ keys: ['Return'] })
          }
          break
        }
        case 'wait': {
          const result = await runtime.executor.wait(normalizedAction.input)
          backendResult = { ...result }
          break
        }
      }

      runtime.session.consumeOperation(decision.estimatedOperationUnits)
      const screenshot = await captureOptionalScreenshot({
        action: normalizedAction,
        config: runtime.config,
        executor: runtime.executor,
      })
      if (screenshot) {
        runtime.session.setLastScreenshot(screenshot)
        runtime.stateManager.updateLastScreenshot({
          capturedAt: screenshot.capturedAt,
          executionTargetMode: screenshot.executionTargetMode,
          height: screenshot.height,
          note: screenshot.note,
          path: screenshot.path,
          placeholder: screenshot.placeholder ?? false,
          sourceDisplayId: screenshot.sourceDisplayId,
          sourceHostName: screenshot.sourceHostName,
          sourceSessionTag: screenshot.sourceSessionTag,
          width: screenshot.width,
        })
      }

      // Transparency: explain what just happened.
      const outcome = explainActionOutcome({
        action: normalizedAction,
        context,
        succeeded: true,
        terminalResult: normalizedAction.kind === 'terminal_exec' ? (backendResult as unknown as TerminalCommandResult) : undefined,
      })

      await runtime.session.record({
        action: normalizedAction,
        context,
        event: 'executed',
        policy: decision,
        result: {
          ...backendResult,
          displayInfo,
          executionTarget,
          screenshotPath: screenshot?.path,
        },
        toolName,
      })

      return buildSuccessResponse({
        screenshot,
        structuredContent: {
          action: normalizedAction.kind,
          backendResult,
          clipboard: clipboardStructuredContent,
          context,
          coordinateSpace: buildCoordinateSpaceInfo({
            config: runtime.config,
            displayInfo,
            lastScreenshot: runtime.session.getLastScreenshot(),
          }),
          displayInfo,
          executionTarget,
          launchContext: preflight.launchContext,
          policy: decision,
          screenshot: screenshot
            ? toScreenshotContent(screenshot)
            : undefined,
          secret: secretStructuredContent,
          status: 'executed',
          terminalState: normalizedAction.kind.startsWith('terminal_') ? toTerminalStateContent(runtime.session.getTerminalState()) : undefined,
          // Transparency fields.
          transparency: {
            advisories: advisories.map(a => ({ kind: a.kind, reason: a.reason })),
            intent,
            outcome,
          },
        },
        summary: summaryOverride ?? `${intent} ${outcome}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
      })
    }
    catch (error) {
      const errorMessage = errorMessageFromValue(error)

      // Update run state with failure info.
      if (runtime.stateManager.hasActiveTask()) {
        runtime.stateManager.completeCurrentStep('failure', errorMessage)
      }

      // Transparency: explain what failed.
      const failureExplanation = explainActionOutcome({
        action: normalizedAction,
        context,
        errorMessage,
        succeeded: false,
      })

      await runtime.session.record({
        action: normalizedAction,
        context,
        event: 'failed',
        policy: decision,
        result: {
          error: errorMessage,
          executionTarget,
        },
        toolName,
      })

      return buildExecutionErrorResponse({
        action: normalizedAction,
        context,
        errorMessage: `${failureExplanation}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
        executionTarget,
        policy: decision,
      })
    }
  }
}

function buildDeniedDecision(params: {
  decision: PolicyDecision
  issues: string[]
}): PolicyDecision {
  return {
    ...params.decision,
    allowed: false,
    reason: params.decision.reason || params.issues[0],
    reasons: [...params.decision.reasons, ...params.issues],
  }
}

async function captureOptionalScreenshot(params: {
  action: ActionInvocation
  config: ComputerUseConfig
  executor: DesktopExecutor
}) {
  let captureAfter = params.config.defaultCaptureAfter

  switch (params.action.kind) {
    case 'click':
    case 'press_keys':
    case 'scroll':
    case 'type_text':
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

function displaySnapshotFromDisplayInfo(displayInfo: DisplayInfo): MultiDisplaySnapshot | undefined {
  if (!displayInfo.displays?.length) {
    return undefined
  }

  return {
    capturedAt: displayInfo.capturedAt ?? new Date(0).toISOString(),
    combinedBounds: displayInfo.combinedBounds ?? {
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    },
    displays: displayInfo.displays.map(display => ({
      bounds: display.bounds,
      displayId: display.displayId,
      isBuiltIn: display.isBuiltIn,
      isMain: display.isMain,
      pixelHeight: display.pixelHeight,
      pixelWidth: display.pixelWidth,
      scaleFactor: display.scaleFactor,
      visibleBounds: display.visibleBounds,
    })),
  }
}

function getCoordinateMutationTarget(action: ActionInvocation): undefined | { x: number, y: number } {
  switch (action.kind) {
    case 'click':
      return { x: action.input.x, y: action.input.y }
    case 'scroll':
      if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
        return { x: action.input.x, y: action.input.y }
      }
      return undefined
    case 'type_text':
      if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
        return { x: action.input.x, y: action.input.y }
      }
      return undefined
    default:
      return undefined
  }
}

function getPolicyEvaluationContext(params: {
  action: ActionInvocation
  actualContext: ForegroundContext
  runtime: ComputerUseServerRuntime
}): ForegroundContext {
  if (params.action.kind !== 'desktop_click_target') {
    return params.actualContext
  }

  const activeSession = params.runtime.desktopSessionController.getSession()
  if (!activeSession?.controlledApp) {
    return params.actualContext
  }

  if (params.actualContext.available && params.actualContext.appName === activeSession.controlledApp) {
    return params.actualContext
  }

  return {
    appName: activeSession.controlledApp,
    available: true,
    platform: params.actualContext.platform,
  }
}

function isMutatingAction(action: ActionInvocation) {
  return !['clipboard_read_text', 'observe_windows', 'screenshot', 'secret_read_env_value', 'terminal_reset', 'wait'].includes(action.kind)
}

function resolveActionDisplayPoint(action: ActionInvocation, displayInfo: DisplayInfo) {
  const target = getCoordinateMutationTarget(action)
  const snapshot = displaySnapshotFromDisplayInfo(displayInfo)

  if (!target || !snapshot) {
    return undefined
  }

  const resolution = resolveDisplayPoint(snapshot, target.x, target.y)
  if (!resolution) {
    const combined = displayInfo.combinedBounds
    return {
      reason: combined
        ? `target point (${target.x}, ${target.y}) is outside connected display bounds ${combined.width}x${combined.height} @ (${combined.x},${combined.y})`
        : `target point (${target.x}, ${target.y}) is outside connected display bounds`,
      status: 'outside' as const,
      target,
    }
  }

  return {
    resolution,
    status: 'ok' as const,
    structured: toStructuredDisplayPoint(resolution),
    target,
  }
}

function toScreenshotContent(screenshot: ScreenshotArtifact) {
  return {
    height: screenshot.height,
    note: screenshot.note,
    observationRef: screenshot.observationRef,
    path: screenshot.path,
    placeholder: screenshot.placeholder ?? false,
    publicUrl: screenshot.publicUrl,
    width: screenshot.width,
  }
}

function toStructuredDisplayPoint(resolution: DisplayPointResolution) {
  return {
    backingPixel: resolution.backingPixel,
    coordinateSpace: 'global-logical',
    displayBounds: resolution.display.bounds,
    displayId: resolution.display.displayId,
    global: resolution.global,
    local: resolution.local,
    scaleFactor: resolution.display.scaleFactor,
  }
}

function toTerminalStateContent(state: TerminalState) {
  return {
    approvalGrantedScope: state.approvalGrantedScope,
    approvalSessionActive: state.approvalSessionActive ?? false,
    effectiveCwd: state.effectiveCwd,
    lastCommandSummary: state.lastCommandSummary,
    lastExitCode: state.lastExitCode,
  }
}
