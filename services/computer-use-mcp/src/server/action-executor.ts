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
import type { VerificationContractSummary } from '../verification-contracts'
import type { ComputerUseServerRuntime } from './runtime'
import type { RuntimeSnapshot } from './runtime-coordinator'
import type { VerificationRunResult } from './verification-runner'

import { normalizeConfiguredAppAction } from '../app-aliases'
import { CodingPrimitives } from '../coding/primitives'
import {
  buildCodingApplyPatchBackendResult,
  buildCodingReadFileBackendResult,
} from '../coding/result-shape'
import {
  getOperationInvalidationTags,
  isMutatingOperationContract,
  requireOperationContract,
} from '../operation-contracts'
import { estimateOperationUnits } from '../operation-units'
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
import {
  requireVerificationContract,
  toVerificationContractSummary,
} from '../verification-contracts'
import { describeExecutionTarget } from './formatters'
import {
  buildApprovalResponse,
  buildDeniedResponse,
  buildExecutionErrorResponse,
  buildSuccessResponse,
} from './responses'
import { toRuntimeFactSummary } from './runtime-facts'
import {
  buildRepairedVerification,
  formatVerificationFailure,
  runPostActionVerification,
  runVerificationRepairAttempt,
} from './verification-runner'

export interface ExecuteActionOptions {
  skipApprovalQueue?: boolean
}

export type ExecuteAction = (action: ActionInvocation, toolName: string, options?: ExecuteActionOptions) => Promise<CallToolResult>

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

function toOperationContractSummary(contract: ReturnType<typeof requireOperationContract>) {
  return {
    effectType: contract.effectType,
    targetSurface: contract.targetSurface,
    postconditionRequired: contract.postconditionRequired,
    approvalScope: contract.approvalScope,
  }
}

function buildTraceMetadata(params: {
  operationContractSummary: ReturnType<typeof toOperationContractSummary>
  verificationSummary?: VerificationContractSummary
}) {
  return {
    ...params.operationContractSummary,
    ...(params.verificationSummary
      ? {
          verification: params.verificationSummary,
        }
      : {}),
  }
}

function toVerificationResultContent(verification: VerificationRunResult) {
  return {
    status: verification.status,
    ...verification.summary,
    reason: verification.reason,
    observedContext: verification.observedContext,
    repairAttempt: verification.repairAttempt,
  }
}

function buildRuntimeFactsSummary(snapshot: RuntimeSnapshot) {
  const summary: Record<string, any> = {
    foregroundContext: toRuntimeFactSummary(snapshot.facts.foregroundContext),
    executionTarget: toRuntimeFactSummary(snapshot.facts.executionTarget),
  }
  if (snapshot.facts.lastScreenshot) {
    summary.lastScreenshot = toRuntimeFactSummary(snapshot.facts.lastScreenshot)
  }
  return summary
}

export function createExecuteAction(runtime: ComputerUseServerRuntime): ExecuteAction {
  // Use the shared coordinator from the runtime wrapper
  const coordinator = runtime.coordinator

  return async (action, toolName, options = {}) => {
    const normalizedAction = normalizeConfiguredAppAction(action, runtime.config.openableApps)
    const operationContract = requireOperationContract(normalizedAction.kind)
    const operationContractSummary = toOperationContractSummary(operationContract)
    const verificationContract = requireVerificationContract(normalizedAction.kind)
    const verificationSummary = verificationContract.requirement !== 'none'
      ? toVerificationContractSummary(verificationContract)
      : undefined
    const traceMetadata = buildTraceMetadata({
      operationContractSummary,
      verificationSummary,
    })

    // Refresh runtime snapshot once at entry
    const snapshot = await coordinator.refreshSnapshot('tool_entry')
    const { executionTarget, foregroundContext: context, displayInfo } = snapshot

    const budget = snapshot.sessionBudget
    const preflight = getRuntimePreflight({
      config: runtime.config,
      lastScreenshot: snapshot.lastScreenshot,
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
      metadata: traceMetadata,
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
        metadata: traceMetadata,
        result: {
          executionTarget,
          coordinateSpace: preflight.coordinateSpace,
          launchContext: preflight.launchContext,
        },
      })

      return buildDeniedResponse(deniedDecision, context, executionTarget)
    }

    if (isMutatingOperationContract(operationContract) && preflight.mutationReadinessIssues.length > 0) {
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
        metadata: traceMetadata,
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
        metadata: traceMetadata,
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
        metadata: traceMetadata,
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
        case 'coding_search_text': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.searchText(
            normalizedAction.input.query,
            normalizedAction.input.targetPath,
            normalizedAction.input.glob,
            normalizedAction.input.limit,
          )
          backendResult = result as Record<string, unknown>
          break
        }
        case 'coding_search_symbol': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.searchSymbol(
            normalizedAction.input.symbolName,
            normalizedAction.input.targetPath,
            normalizedAction.input.glob,
            normalizedAction.input.limit,
          )
          backendResult = result as Record<string, unknown>
          break
        }
        case 'coding_find_references': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.findReferences(
            normalizedAction.input.filePath,
            normalizedAction.input.targetLine,
            normalizedAction.input.targetColumn,
            normalizedAction.input.limit,
          )
          backendResult = result as Record<string, unknown>
          break
        }
        case 'coding_analyze_impact': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.analyzeImpact({
            targetFile: normalizedAction.input.targetFile,
            targetPath: normalizedAction.input.targetPath,
            targetSymbol: normalizedAction.input.targetSymbol,
            searchQuery: normalizedAction.input.searchQuery,
            maxDepth: normalizedAction.input.maxDepth,
          })
          backendResult = result as unknown as Record<string, unknown>
          break
        }
        case 'coding_validate_hypothesis': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.validateHypothesis({
            targetFile: normalizedAction.input.targetFile,
            targetPath: normalizedAction.input.targetPath,
            targetSymbol: normalizedAction.input.targetSymbol,
            searchQuery: normalizedAction.input.searchQuery,
            changeIntent: normalizedAction.input.changeIntent,
          })
          backendResult = result as unknown as Record<string, unknown>
          break
        }
        case 'coding_select_target': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.selectTarget({
            targetFile: normalizedAction.input.targetFile,
            targetPath: normalizedAction.input.targetPath,
            targetSymbol: normalizedAction.input.targetSymbol,
            searchQuery: normalizedAction.input.searchQuery,
            changeIntent: normalizedAction.input.changeIntent,
          })
          backendResult = result as unknown as Record<string, unknown>
          break
        }
        case 'coding_plan_changes': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.planChanges({
            intent: normalizedAction.input.intent,
            allowMultiFile: normalizedAction.input.allowMultiFile,
            maxPlannedFiles: normalizedAction.input.maxPlannedFiles,
            changeIntent: normalizedAction.input.changeIntent,
            sessionAware: normalizedAction.input.sessionAware,
          })
          backendResult = result as unknown as Record<string, unknown>
          break
        }
        case 'coding_review_changes': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.reviewChanges({
            currentFilePath: normalizedAction.input.currentFilePath,
          })
          backendResult = result as unknown as Record<string, unknown>
          break
        }
        case 'coding_diagnose_changes': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.diagnoseChanges({
            currentFilePath: normalizedAction.input.currentFilePath,
            validationOutput: normalizedAction.input.validationOutput,
          })
          backendResult = result as unknown as Record<string, unknown>
          break
        }
        case 'coding_capture_validation_baseline': {
          const primitives = new CodingPrimitives(runtime)
          const result = await primitives.captureValidationBaseline({
            workspacePath: normalizedAction.input.workspacePath,
            createTemporaryWorktree: normalizedAction.input.createTemporaryWorktree,
          })
          backendResult = result as unknown as Record<string, unknown>
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
            metadata: traceMetadata,
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
          const primitives = new CodingPrimitives(runtime)
          let resolvedScopedValidation: Record<string, unknown> | undefined
          let terminalExecInput = normalizedAction.input

          if (normalizedAction.input.command.trim().toLowerCase() === 'auto') {
            const scopedValidation = await primitives.resolveScopedValidationCommand()
            terminalExecInput = {
              ...normalizedAction.input,
              command: scopedValidation.command,
            }
            resolvedScopedValidation = scopedValidation as unknown as Record<string, unknown>
          }

          const result = await runtime.terminalRunner.execute(terminalExecInput)
          runtime.session.setTerminalState(runtime.terminalRunner.getState())
          runtime.stateManager.updateTerminalResult(result)
          backendResult = {
            ...result,
            ...(resolvedScopedValidation ? { resolvedScopedValidation } : {}),
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
      let screenshot = await captureOptionalScreenshot({
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

      let verificationResult: VerificationRunResult | undefined

      if (verificationContract.requirement !== 'none') {
        const verificationSnapshot = await coordinator.refreshSnapshot('verification_check')
        verificationResult = runPostActionVerification({
          action: normalizedAction,
          postActionSnapshot: verificationSnapshot,
          screenshot,
        })

        if (verificationResult?.status === 'failed') {
          await runtime.session.record({
            event: 'verification_failed',
            toolName,
            action: normalizedAction,
            context,
            policy: decision,
            metadata: traceMetadata,
            result: {
              executionTarget,
              verification: toVerificationResultContent(verificationResult),
              runtimeFacts: buildRuntimeFactsSummary(verificationSnapshot),
            },
          })

          if (verificationResult.summary.failureDisposition === 'repair_hint' && verificationResult.summary.repairHint !== 'none') {
            const repairResult = await runVerificationRepairAttempt({
              runtime,
              action: normalizedAction,
              failedVerification: verificationResult,
              screenshot,
            })

            const repairAttempt = repairResult.repairAttempt
            screenshot = repairResult.screenshot ?? screenshot
            verificationResult = repairResult.verification

            if (repairAttempt.attempted) {
              if (repairAttempt.hint === 'refocus_target_app' || repairAttempt.hint === 'reopen_target_app') {
                runtime.session.consumeOperation(estimateOperationUnits(normalizedAction))
              }

              await runtime.session.record({
                event: 'repair_attempted',
                toolName,
                action: normalizedAction,
                context,
                policy: decision,
                metadata: traceMetadata,
                result: {
                  executionTarget,
                  repairAttempt,
                  runtimeFacts: buildRuntimeFactsSummary(verificationSnapshot),
                },
              })

              if (repairAttempt.succeeded) {
                coordinator.enqueueInvalidation(repairResult.invalidationTags)
                const repairSnapshot = await coordinator.refreshSnapshot('repair_check')
                const recheckVerificationResult = runPostActionVerification({
                  action: normalizedAction,
                  postActionSnapshot: repairSnapshot,
                  screenshot,
                })

                if (recheckVerificationResult?.status === 'passed') {
                  verificationResult = buildRepairedVerification({
                    verification: recheckVerificationResult,
                    repairAttempt,
                  })

                  await runtime.session.record({
                    event: 'repair_succeeded',
                    toolName,
                    action: normalizedAction,
                    context,
                    policy: decision,
                    metadata: traceMetadata,
                    result: {
                      executionTarget,
                      verification: toVerificationResultContent(verificationResult),
                      runtimeFacts: buildRuntimeFactsSummary(repairSnapshot),
                    },
                  })
                }
                else {
                  verificationResult = {
                    ...(recheckVerificationResult ?? verificationResult),
                    status: 'failed',
                    reason: recheckVerificationResult?.reason || verificationResult.reason || 'verification still failed after repair',
                    repairAttempt,
                  }

                  await runtime.session.record({
                    event: 'repair_failed',
                    toolName,
                    action: normalizedAction,
                    context,
                    policy: decision,
                    metadata: traceMetadata,
                    result: {
                      executionTarget,
                      verification: toVerificationResultContent(verificationResult),
                      runtimeFacts: buildRuntimeFactsSummary(repairSnapshot),
                    },
                  })
                }
              }
              else {
                await runtime.session.record({
                  event: 'repair_failed',
                  toolName,
                  action: normalizedAction,
                  context,
                  policy: decision,
                  metadata: traceMetadata,
                  result: {
                    executionTarget,
                    verification: toVerificationResultContent(verificationResult),
                    runtimeFacts: buildRuntimeFactsSummary(verificationSnapshot),
                  },
                })
              }
            }
          }

          if (verificationResult.status !== 'repaired') {
            const verificationError = formatVerificationFailure({
              action: normalizedAction,
              verification: verificationResult,
            })

            await runtime.session.record({
              event: 'failed',
              toolName,
              action: normalizedAction,
              context,
              policy: decision,
              metadata: traceMetadata,
              result: {
                executionTarget,
                error: verificationError,
                verification: toVerificationResultContent(verificationResult),
              },
            })

            return buildExecutionErrorResponse({
              errorMessage: `${verificationError}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
              action: normalizedAction,
              context,
              executionTarget,
              policy: decision,
              verification: toVerificationResultContent(verificationResult),
            })
          }
        }
      }

      // Transparency: explain what just happened.
      const outcome = explainActionOutcome({
        action: normalizedAction,
        succeeded: true,
        terminalResult: normalizedAction.kind === 'terminal_exec' ? (backendResult as unknown as TerminalCommandResult) : undefined,
        context,
      })
      const verificationRecoverySummary = verificationResult?.status === 'repaired'
        ? ' Verification recovered after repair.'
        : ''

      await runtime.session.record({
        event: 'executed',
        toolName,
        action: normalizedAction,
        context,
        policy: decision,
        metadata: traceMetadata,
        result: {
          ...backendResult,
          executionTarget,
          screenshotPath: screenshot?.path,
          displayInfo,
        },
      })

      // Enqueue invalidation tags from this action's operation contract so the
      // next refreshSnapshot selectively re-probes the affected facts.
      coordinator.enqueueInvalidation(getOperationInvalidationTags(normalizedAction.kind))

      return buildSuccessResponse({
        summary: `${intent} ${outcome}${verificationRecoverySummary}${advisorySummary ? ` Strategy: ${advisorySummary}` : ''}`,
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
        metadata: traceMetadata,
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
