import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { TerminalOrigin } from '@proj-airi/stage-shared/terminal-approval'

import type { ModelDecisionContract } from '../contracts/agent-execution'
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
  TerminalExecution,
  TerminalState,
} from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { hostname } from 'node:os'
import { platform } from 'node:process'

import { terminalSnapshotSchema } from '@proj-airi/stage-shared/terminal-approval'

import * as v from 'valibot'

import { normalizeConfiguredAppAction } from '../app-aliases'
import { decideBrowserTypeAction } from '../browser-action-router'
import { diagnoseBrowserActionError } from '../browser-dom/browser-repair-contract'
import { isBrowserDomActionSupported } from '../browser-dom/capabilities'
import { attachAgentExecutionContracts, buildAgentExecutionContracts, createModelDecision } from '../contracts/agent-execution'
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
import { describeExecutionTarget, describeTerminalBackend } from './formatters'
import { refreshRuntimeRunState } from './refresh-run-state'
import {
  buildApprovalResponse,
  buildDeniedResponse,
  buildExecutionErrorResponse,
  buildSuccessResponse,
} from './responses'

export interface ExecuteActionOptions {
  skipApprovalQueue?: boolean
  modelDecision?: ModelDecisionContract
  /** Identifies the authority that allowed a previously pending action. */
  authorizationSource?: 'policy' | 'host'
  executionSignal?: AbortSignal
  /** Foreground context captured when the Host approval was requested. */
  approvedContext?: ForegroundContext
  terminalOrigin?: TerminalOrigin
  /** The private Host handler supplies the final check and synchronous executor start. Public tools cannot supply callbacks. */
  terminalExecution?: () => TerminalExecution
}

export type ExecuteAction = (action: ActionInvocation, toolName: string, options?: ExecuteActionOptions) => Promise<CallToolResult>

function isMutatingAction(action: ActionInvocation) {
  return !['screenshot', 'observe_windows', 'wait', 'terminal_reset', 'clipboard_read_text', 'secret_read_env_value'].includes(action.kind)
}

async function captureOptionalScreenshot(params: {
  action: ActionInvocation
  executor: DesktopExecutor
  config: ComputerUseConfig
  signal?: AbortSignal
  targetWindowContext?: ForegroundContext
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
  }, { signal: params.signal, targetWindowContext: params.targetWindowContext })
}

function isAuvWindowBoundAction(action: ActionInvocation) {
  return ['click', 'desktop_click_target', 'type_text', 'press_keys', 'scroll'].includes(action.kind)
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

function displaySnapshotFromDisplayInfo(displayInfo: DisplayInfo): MultiDisplaySnapshot | undefined {
  if (!displayInfo.displays?.length) {
    return undefined
  }

  return {
    displays: displayInfo.displays.map(display => ({
      displayId: display.displayId,
      isMain: display.isMain,
      isBuiltIn: display.isBuiltIn,
      bounds: display.bounds,
      visibleBounds: display.visibleBounds,
      scaleFactor: display.scaleFactor,
      pixelWidth: display.pixelWidth,
      pixelHeight: display.pixelHeight,
    })),
    combinedBounds: displayInfo.combinedBounds ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
    capturedAt: displayInfo.capturedAt ?? new Date(0).toISOString(),
  }
}

function getCoordinateMutationTarget(action: ActionInvocation): { x: number, y: number } | undefined {
  switch (action.kind) {
    case 'click':
      return { x: action.input.x, y: action.input.y }
    case 'type_text':
      if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
        return { x: action.input.x, y: action.input.y }
      }
      return undefined
    case 'scroll':
      if (typeof action.input.x === 'number' && typeof action.input.y === 'number') {
        return { x: action.input.x, y: action.input.y }
      }
      return undefined
    default:
      return undefined
  }
}

function getBrowserDomSelector(action: ActionInvocation): string | undefined {
  switch (action.kind) {
    case 'browser_dom_click':
    case 'browser_dom_set_input_value':
    case 'browser_dom_check_checkbox':
    case 'browser_dom_select_option':
    case 'browser_dom_trigger_event':
      return action.input.selector
    default:
      return undefined
  }
}

function toStructuredDisplayPoint(resolution: DisplayPointResolution) {
  return {
    coordinateSpace: 'global-logical',
    global: resolution.global,
    displayId: resolution.display.displayId,
    displayBounds: resolution.display.bounds,
    local: resolution.local,
    backingPixel: resolution.backingPixel,
    scaleFactor: resolution.display.scaleFactor,
  }
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
      status: 'outside' as const,
      target,
      reason: combined
        ? `target point (${target.x}, ${target.y}) is outside connected display bounds ${combined.width}x${combined.height} @ (${combined.x},${combined.y})`
        : `target point (${target.x}, ${target.y}) is outside connected display bounds`,
    }
  }

  return {
    status: 'ok' as const,
    target,
    resolution,
    structured: toStructuredDisplayPoint(resolution),
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
    available: true,
    appName: activeSession.controlledApp,
    platform: params.actualContext.platform,
  }
}

export function createExecuteAction(runtime: ComputerUseServerRuntime): ExecuteAction {
  const executeAction: ExecuteAction = async (action, toolName, options = {}) => {
    options.executionSignal?.throwIfAborted()
    const normalizedAction = normalizeConfiguredAppAction(action, runtime.config.openableApps)
    const modelDecision = options.modelDecision ?? createModelDecision(toolName, normalizedAction)
    const finalize = (result: CallToolResult, authorizationSource?: 'policy' | 'host') => attachAgentExecutionContracts(
      result,
      buildAgentExecutionContracts({ result, modelDecision, authorizationSource }),
    )
    const isTerminal = normalizedAction.kind === 'terminal_exec' || normalizedAction.kind === 'terminal_reset'
    const isBrowserDomAction = normalizedAction.kind.startsWith('browser_dom_')
    const { executionTarget, context: actualContext, displayInfo } = isTerminal && runtime.config.executor === 'auv'
      ? getAuvTerminalRunState(runtime)
      : await refreshRuntimeRunState(runtime, { probeBrowser: !isTerminal })
    options.executionSignal?.throwIfAborted()
    const terminalBackend = isTerminal ? runtime.terminalRunner.describe().kind : undefined
    const observedPolicyContext = getPolicyEvaluationContext({
      action: normalizedAction,
      actualContext,
      runtime,
    })
    const targetWindowContext = options.approvedContext ?? observedPolicyContext
    const context = runtime.config.executor === 'auv'
      && options.approvedContext
      && (isAuvWindowBoundAction(normalizedAction) || normalizedAction.kind === 'open_app' || normalizedAction.kind === 'focus_app')
      ? options.approvedContext
      : observedPolicyContext
    const actualForegroundContext = context === actualContext ? undefined : actualContext

    const budget = runtime.session.getBudgetState()
    const preflight = getRuntimePreflight({
      config: runtime.config,
      lastScreenshot: runtime.session.getLastScreenshot(),
      displayInfo,
      executionTarget,
      foregroundContext: context,
    })
    const baseDecision = evaluateActionPolicy({
      action: normalizedAction,
      config: runtime.config,
      context,
      operationsExecuted: budget.operationsExecuted,
      operationUnitsConsumed: budget.operationUnitsConsumed,
    })
    const decision = baseDecision
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
        actualForegroundContext,
      },
    })

    if (!isBrowserDomAction && preflight.blockingIssues.length > 0) {
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

      return finalize(buildDeniedResponse(deniedDecision, context, executionTarget, terminalBackend), options.authorizationSource)
    }

    const isMutationBlockedByPreflight = !isBrowserDomAction && isMutatingAction(normalizedAction)
      && (runtime.config.executor !== 'auv' || normalizedAction.kind !== 'terminal_exec')
      && preflight.mutationReadinessIssues.length > 0

    if (isMutationBlockedByPreflight) {
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

      return finalize(buildDeniedResponse(deniedDecision, context, executionTarget, terminalBackend), options.authorizationSource)
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

      return finalize(buildDeniedResponse(decision, context, executionTarget, terminalBackend), options.authorizationSource)
    }

    const actionDisplayPoint = resolveActionDisplayPoint(normalizedAction, displayInfo)
    if (actionDisplayPoint?.status === 'outside') {
      const deniedDecision = buildDeniedDecision({
        decision,
        issues: [actionDisplayPoint.reason],
      })

      await runtime.session.record({
        event: 'denied',
        toolName,
        action: normalizedAction,
        context,
        policy: deniedDecision,
        result: {
          executionTarget,
          displayInfo,
          coordinateSpace: preflight.coordinateSpace,
          targetPoint: actionDisplayPoint.target,
        },
      })

      return finalize(buildDeniedResponse(deniedDecision, context, executionTarget), options.authorizationSource)
    }
    const structuredDisplayPoint = actionDisplayPoint?.status === 'ok'
      ? actionDisplayPoint.structured
      : undefined

    if (decision.requiresApproval && !options.skipApprovalQueue) {
      const pending = runtime.session.createPendingAction({
        toolName,
        action: normalizedAction,
        context,
        policy: decision,
        modelDecision,
      })
      try {
        if (normalizedAction.kind === 'terminal_exec' && options.terminalOrigin) {
          if (options.terminalOrigin.nonce !== runtime.terminalControlNonce || !runtime.terminalRunner.prepare)
            throw new Error('The executor cannot prepare this Host Terminal operation.')
          const snapshot = v.parse(terminalSnapshotSchema, {
            protocol: 'airi-terminal-approval/1' as const,
            preparedId: pending.id,
            requestId: options.terminalOrigin.requestId,
            toolCallId: options.terminalOrigin.toolCallId,
            ...runtime.terminalRunner.prepare(normalizedAction.input),
          })
          Object.freeze(snapshot.argv)
          pending.preparedTerminal = Object.freeze(snapshot)
        }
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

        return finalize(buildApprovalResponse(pending, decision, context, {
          intent,
          approvalReason: explainApprovalReason(normalizedAction, decision, context),
          advisorySummary,
        }), 'host')
      }
      catch (error) {
        // No approval result was sent. The caller has no prepared ID to discard.
        runtime.session.removePendingAction(pending.id)
        runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
        throw error
      }
    }

    try {
      options.executionSignal?.throwIfAborted()
      let backendResult: Record<string, unknown> = {}
      let terminalResult: TerminalCommandResult | undefined
      let clipboardStructuredContent: Record<string, unknown> | undefined
      let secretStructuredContent: Record<string, unknown> | undefined
      let summaryOverride: string | undefined

      switch (normalizedAction.kind) {
        case 'screenshot': {
          const screenshot = await runtime.executor.takeScreenshot(normalizedAction.input, {
            signal: options.executionSignal,
            targetWindowContext,
          })
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
            sourceWindowId: screenshot.sourceWindowId,
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

          return finalize(buildSuccessResponse({
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
          }), options.authorizationSource)
        }
        case 'observe_windows': {
          const observation = await runtime.executor.observeWindows(normalizedAction.input, { signal: options.executionSignal })
          runtime.stateManager.updateWindowObservation(observation)
          backendResult = { observation }
          break
        }
        case 'open_app': {
          const result = await runtime.executor.openApp(normalizedAction.input, { signal: options.executionSignal })
          backendResult = {
            ...result,
            app: normalizedAction.input.app,
          }
          break
        }
        case 'focus_app': {
          const result = await runtime.executor.focusApp(normalizedAction.input, { signal: options.executionSignal })
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
          }, {
            signal: options.executionSignal,
            targetWindowId: targetWindowContext.windowId,
            targetWindowContext,
          })
          runtime.session.setPointerPosition({ x: normalizedAction.input.x, y: normalizedAction.input.y })
          backendResult = {
            ...result,
            pointerTrace,
            displayPoint: structuredDisplayPoint,
          }
          break
        }
        case 'type_text': {
          const hasExplicitCoordinates
            = typeof normalizedAction.input.x === 'number'
              && typeof normalizedAction.input.y === 'number'

          if (hasExplicitCoordinates) {
            const pointerTrace = buildPointerTrace({
              from: runtime.session.getPointerPosition(),
              to: { x: normalizedAction.input.x!, y: normalizedAction.input.y! },
              bounds: runtime.config.allowedBounds,
            })
            // NOTICE: The preparatory click must succeed before we type.
            // If focus fails the text would go to the wrong element.
            try {
              await runtime.executor.click({
                x: normalizedAction.input.x!,
                y: normalizedAction.input.y!,
                button: 'left',
                clickCount: 1,
                pointerTrace,
              }, {
                signal: options.executionSignal,
                targetWindowId: targetWindowContext.windowId,
                targetWindowContext,
              })
              runtime.session.setPointerPosition({ x: normalizedAction.input.x!, y: normalizedAction.input.y! })
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
                  options.executionSignal?.throwIfAborted()
                  await runtime.browserDomBridge!.setInputValue({
                    selector: typeDecision.selector,
                    value: normalizedAction.input.text,
                    simulateKeystrokes: false,
                    blur: !normalizedAction.input.pressEnter,
                    frameIds: typeDecision.frameId !== undefined
                      ? [typeDecision.frameId]
                      : undefined,
                  })
                  usedBrowserDom = true
                  backendResult.browserDomRoute = {
                    method: 'setInputValue',
                    selector: typeDecision.selector,
                    reason: typeDecision.reason,
                  }
                }
                catch (error) {
                  if (options.executionSignal?.aborted)
                    throw error
                  // Fallback to OS typeText below
                }
              }
            }
          }

          if (!usedBrowserDom) {
            options.executionSignal?.throwIfAborted()
            const result = await runtime.executor.typeText(normalizedAction.input, {
              signal: options.executionSignal,
              targetWindowId: targetWindowContext.windowId,
              targetWindowContext,
            })
            backendResult = {
              ...backendResult,
              ...result,
            }
          }

          // Handle pressEnter even when browser-dom was used
          if (usedBrowserDom && normalizedAction.input.pressEnter) {
            options.executionSignal?.throwIfAborted()
            await runtime.executor.pressKeys({ keys: ['Return'] }, {
              signal: options.executionSignal,
              targetWindowId: targetWindowContext.windowId,
              targetWindowContext,
            })
          }
          break
        }
        case 'press_keys': {
          const result = await runtime.executor.pressKeys(normalizedAction.input, {
            signal: options.executionSignal,
            targetWindowId: targetWindowContext.windowId,
            targetWindowContext,
          })
          backendResult = { ...result }
          break
        }
        case 'scroll': {
          const result = await runtime.executor.scroll(normalizedAction.input, {
            signal: options.executionSignal,
            targetWindowId: targetWindowContext.windowId,
            targetWindowContext,
          })
          if (typeof normalizedAction.input.x === 'number' && typeof normalizedAction.input.y === 'number') {
            runtime.session.setPointerPosition({ x: normalizedAction.input.x, y: normalizedAction.input.y })
          }
          backendResult = {
            ...result,
            displayPoint: structuredDisplayPoint,
          }
          break
        }
        case 'wait': {
          const result = await runtime.executor.wait(normalizedAction.input, { signal: options.executionSignal })
          backendResult = { ...result }
          break
        }
        case 'terminal_exec': {
          let result: TerminalCommandResult
          if (options.terminalExecution) {
            const execution = options.terminalExecution()
            try {
              result = await execution.result
            }
            finally {
              await execution.lifecycle
            }
          }
          else {
            result = await runtime.terminalRunner.execute(normalizedAction.input)
          }
          terminalResult = result
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
        case 'browser_dom_click': {
          const result = await runtime.browserDomBridge.clickSelector(normalizedAction.input)
          const clickSucceeded = result.clickResults.some(frame => (frame.result as Record<string, unknown>)?.success === true)
          if (!clickSucceeded)
            throw new Error(`No browser DOM click succeeded for selector "${normalizedAction.input.selector}".`)
          backendResult = {
            targetFrameId: result.targetFrameId,
            targetPoint: result.targetPoint,
            targetElement: result.targetElement,
            clickResults: result.clickResults,
          }
          break
        }
        case 'browser_dom_set_input_value': {
          const results = await runtime.browserDomBridge.setInputValue(normalizedAction.input)
          backendResult = {
            selector: normalizedAction.input.selector,
            valueLength: normalizedAction.input.value.length,
            results,
          }
          break
        }
        case 'browser_dom_check_checkbox': {
          const results = await runtime.browserDomBridge.checkCheckbox(normalizedAction.input)
          backendResult = {
            selector: normalizedAction.input.selector,
            checked: normalizedAction.input.checked,
            results,
          }
          break
        }
        case 'browser_dom_select_option': {
          const results = await runtime.browserDomBridge.selectOption(normalizedAction.input)
          backendResult = {
            selector: normalizedAction.input.selector,
            value: normalizedAction.input.value,
            results,
          }
          break
        }
        case 'browser_dom_trigger_event': {
          const results = await runtime.browserDomBridge.triggerEvent(normalizedAction.input)
          backendResult = {
            selector: normalizedAction.input.selector,
            eventName: normalizedAction.input.eventName,
            eventType: normalizedAction.input.eventType,
            results,
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
        case 'desktop_click_target': {
          const result = await executeDesktopClickTarget(runtime, normalizedAction.input, {
            signal: options.executionSignal,
            targetWindowId: context.windowId,
            targetWindowContext,
          })
          backendResult = result.backendResult
          summaryOverride = result.summary
          break
        }
      }

      runtime.session.consumeOperation(decision.estimatedOperationUnits)
      let screenshot: ScreenshotArtifact | undefined
      let postActionCaptureError: string | undefined
      try {
        screenshot = await captureOptionalScreenshot({
          action: normalizedAction,
          executor: runtime.executor,
          config: runtime.config,
          signal: options.executionSignal,
          targetWindowContext: isAuvWindowBoundAction(normalizedAction) ? targetWindowContext : undefined,
        })
      }
      catch (error) {
        if (runtime.config.executor !== 'auv' || !isMutatingAction(normalizedAction))
          throw error
        postActionCaptureError = errorMessageFromValue(error)
      }
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
          sourceWindowId: screenshot.sourceWindowId,
          sourceSessionTag: screenshot.sourceSessionTag,
        })
      }

      // Transparency: explain what just happened.
      let outcome = explainActionOutcome({
        action: normalizedAction,
        succeeded: true,
        terminalResult,
        context,
      })
      if (terminalBackend)
        outcome += ` ${describeTerminalBackend(terminalBackend)}`
      if (runtime.config.executor === 'auv' && ['click', 'desktop_click_target', 'type_text', 'press_keys', 'scroll'].includes(normalizedAction.kind)) {
        outcome = `AUV reported input delivery; the target application's state has not been verified. ${outcome}`
      }
      if (postActionCaptureError) {
        outcome += ` The post-action screenshot failed, so inspect the current application state before retrying: ${postActionCaptureError}`
        backendResult.postActionCapture = { status: 'failed', error: postActionCaptureError, doNotReplay: true }
      }

      await runtime.session.record({
        event: 'executed',
        toolName,
        action: normalizedAction,
        context,
        policy: decision,
        result: {
          ...backendResult,
          executionTarget,
          terminalBackend,
          screenshotPath: screenshot?.path,
          displayInfo,
        },
      })

      return finalize(buildSuccessResponse({
        summary: summaryOverride ?? `${intent} ${outcome}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
        screenshot,
        structuredContent: {
          status: 'executed',
          action: normalizedAction.kind,
          context,
          policy: decision,
          launchContext: preflight.launchContext,
          executionTarget,
          terminalBackend,
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
      }), options.authorizationSource)
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
          terminalBackend,
          error: errorMessage,
        },
      })

      return finalize(buildExecutionErrorResponse({
        errorMessage: `${failureExplanation}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
        action: normalizedAction,
        context,
        executionTarget,
        terminalBackend,
        policy: decision,
        repairSuggestion: (() => {
          const selector = getBrowserDomSelector(normalizedAction)
          const suggestion = selector ? diagnoseBrowserActionError(error, selector, normalizedAction.kind) : null
          return suggestion ? { ...suggestion } : undefined
        })(),
      }), options.authorizationSource)
    }
  }
  return executeAction
}

/** Terminal execution is independent of desktop observation and must remain usable when AUV is unavailable. */
function getAuvTerminalRunState(runtime: ComputerUseServerRuntime) {
  const state = runtime.stateManager.getState()
  const executionTarget = state.executionTarget ?? {
    mode: 'local-windowed' as const,
    transport: 'local' as const,
    hostName: hostname(),
    sessionTag: runtime.config.sessionTag,
    isolated: false,
    tainted: false,
    note: 'AUV desktop was not probed for this Terminal action',
  }
  const context = state.foregroundContext ?? {
    available: false,
    platform,
    unavailableReason: 'AUV desktop was not probed for this Terminal action',
  }
  const displayInfo = state.displayInfo ?? {
    available: false,
    platform,
    note: 'AUV desktop was not probed for this Terminal action',
  }
  runtime.stateManager.updateExecutionTarget(executionTarget)
  runtime.stateManager.updateForegroundContext(context)
  runtime.stateManager.updateDisplayInfo(displayInfo)
  runtime.stateManager.updateTerminalState(runtime.terminalRunner.getState())
  runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
  return { executionTarget, context, displayInfo, browserSurfaceAvailability: state.browserSurfaceAvailability }
}
