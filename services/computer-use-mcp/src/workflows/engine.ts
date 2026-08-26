/**
 * Workflow engine — executes a WorkflowDefinition step-by-step,
 * integrating with the run state, strategy layer, and transparency layer.
 *
 * The engine does NOT bypass the action executor's policy / approval
 * pipeline. Every action still goes through the normal MCP execution
 * path. The engine simply drives the sequence and handles recovery.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ExecuteAction } from '../server/action-executor'
import type { ActiveTask, RunStateManager, TaskStep } from '../state'
import type { StrategyAdvisory } from '../strategy'
import type { DisplayInfo } from '../types'
import type { WorkflowDefinition, WorkflowStepTemplate } from './types'

import process from 'node:process'

import { randomUUID } from 'node:crypto'

import { buildRecoveryPlan, evaluateStrategy, PREP_TOOL_POLICY } from '../strategy'
import {
  explainActionIntent,
  explainActionOutcome,
  explainNextStep,
  summarizeTaskProgress,
} from '../transparency'
import { errorMessageFromValue } from '../utils/error-message'
import { resolveTerminalSurface } from './surface-resolver'
import { resolveStepAction, resolveTerminalConfig } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Callback the engine invokes when surface resolution determines a step
 * needs a PTY. Implementations MUST go through the same approval / grant /
 * audit pipeline as an external `pty_create` — no shortcuts.
 */
export type AcquirePtyForStep = (params: {
  /** Whether the engine is running in auto-approve mode. */
  autoApprove: boolean
  cols?: number
  cwd?: string
  rows?: number
  stepId: string
  taskId: string
}) => Promise<AcquirePtyResult>

export interface AcquirePtyResult {
  /** Whether the PTY was successfully created. */
  acquired: boolean
  /** True when approval is pending — workflow should suspend at `before_pty_acquire`. */
  approvalPending?: boolean
  /** Error message (only when acquisition failed non-recoverably). */
  error?: string
  /** The allocated session id (only when `acquired` is true). */
  ptySessionId?: string
}

export type ExecutePrepTool = (toolName: string, options?: ExecutePrepToolOptions) => Promise<CallToolResult>

export interface ExecutePrepToolOptions {
  skipApprovalQueue?: boolean
}

/** Result of a single prep tool invocation within the engine. */
export interface PreparatoryResult {
  error?: string
  /** Metadata returned by the prep handler (slimmed for workflow use). */
  metadata?: Record<string, unknown>
  succeeded: boolean
  toolName: string
}

/** Terminal acquisition state for a single workflow step. */
export interface StepTerminalProgress {
  /** Pre-PTY preparations that completed before the pause. */
  completedPreparations: string[]
  /** Bound PTY session id (if already acquired before the pause). */
  ptySessionId?: string
  /** Where in the terminal acquisition lifecycle we are. */
  terminalPhase: 'acquired' | 'acquiring' | 'executing' | 'not_started'
}

export interface WorkflowExecutionResult {
  /**
   * When status is 'reroute_required', the advisory that triggered it
   * so the caller knows which surface to switch to.
   */
  rerouteAdvisory?: StrategyAdvisory
  /** Machine-readable overall status. */
  status: WorkflowStatus
  /** Per-step results. */
  stepResults: WorkflowStepResult[]
  /** Whether the workflow completed all steps successfully. */
  success: boolean
  /** Human-readable summary of the entire workflow execution. */
  summary: string
  /**
   * If the workflow was paused (e.g. awaiting approval), this contains
   * the state needed to resume it later via `resumeWorkflow()`.
   */
  suspension?: WorkflowSuspension
  /** The final task state. */
  task: ActiveTask
}

export type WorkflowStatus = 'completed' | 'failed' | 'paused' | 'reroute_required'

// ---------------------------------------------------------------------------
// PTY acquisition callback
// ---------------------------------------------------------------------------

export interface WorkflowStepResult {
  /** Strategy advisories evaluated before execution. */
  advisories: StrategyAdvisory[]
  /** Explanation of what happened. */
  explanation: string
  /** Results of preparatory tool invocations (if any). */
  preparatoryResults?: PreparatoryResult[]
  /** Machine-readable step-level status. */
  status: 'failure' | 'pending_approval' | 'prepared' | 'reroute_required' | 'success'
  step: WorkflowStepTemplate
  /** Whether this step succeeded. */
  succeeded: boolean
  /** MCP tool result (undefined for non-action steps). */
  toolResult?: CallToolResult
}

/**
 * Captures the state of a paused workflow so it can be resumed
 * after external approval or rejection.
 */
export interface WorkflowSuspension {
  overrides?: Record<string, unknown>
  pausedAtStepIndex: number
  pausedDuring: 'action_prep' | 'before_pty_acquire' | 'main_action'
  resumeAtStepIndex: number
  /**
   * Tracks the terminal acquisition progress of the paused step so that
   * on resume we don't replay already-completed work.
   */
  stepProgress?: StepTerminalProgress
  stepResults: WorkflowStepResult[]
  task: ActiveTask
  workflow: WorkflowDefinition
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export async function executeWorkflow(params: {
  /**
   * Internal: resume state from a previous suspension. Use `resumeWorkflow()`
   * instead of setting this directly.
   */
  _resume?: {
    existingTask: ActiveTask
    previousResults: WorkflowStepResult[]
    startIndex: number
  }
  /**
   * Callback to acquire a PTY session. The engine uses this when surface
   * resolution determines a step needs a PTY. The callback MUST go through
   * the same approval / grant / audit path as an external `pty_create`.
   * Returns the allocated session id, or undefined if approval is pending.
   */
  acquirePty?: AcquirePtyForStep
  /**
   * If true, all action steps within this workflow will bypass the
   * approval queue. The user has already expressed intent by invoking
   * the workflow tool, so individual-step confirmation is unnecessary.
   * Default: false.
   */
  autoApproveSteps?: boolean
  executeAction: ExecuteAction
  executePrepTool?: ExecutePrepTool
  /** Override parameters to inject at runtime (e.g. project path). */
  overrides?: Record<string, unknown>
  refreshState?: () => Promise<void>
  stateManager: RunStateManager
  workflow: WorkflowDefinition
}): Promise<WorkflowExecutionResult> {
  const { acquirePty, autoApproveSteps, executeAction, executePrepTool, overrides, refreshState, stateManager, workflow } = params
  const stepResults: WorkflowStepResult[] = params._resume?.previousResults ?? []
  const startIndex = params._resume?.startIndex ?? 0

  // Create the task in run state, or reuse existing task when resuming.
  const task: ActiveTask = params._resume?.existingTask ?? {
    currentStepIndex: 0,
    failureCount: 0,
    goal: workflow.name,
    id: randomUUID(),
    maxConsecutiveFailures: workflow.maxRetries,
    phase: 'executing',
    startedAt: new Date().toISOString(),
    steps: workflow.steps.map((s, i) => ({
      index: i + 1,
      label: s.label,
      outcome: undefined,
      stepId: `step_${randomUUID()}`,
      toolName: undefined,
    } satisfies TaskStep)),
    workflowId: workflow.id,
  }
  if (!params._resume) {
    stateManager.startTask(task)
  }
  else {
    // Resuming — ensure the phase is executing again.
    task.phase = 'executing'
    stateManager.updateTaskPhase('executing')
  }

  for (let i = startIndex; i < workflow.steps.length; i++) {
    const stepTemplate = workflow.steps[i]
    const taskStep = task.steps[i]
    task.currentStepIndex = i
    taskStep.startedAt = new Date().toISOString()
    stateManager.updateTaskPhase('executing')

    // Apply runtime overrides to step params.
    const resolvedParams = { ...stepTemplate.params }
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        if (resolvedParams[key] !== undefined && typeof resolvedParams[key] === 'string') {
          resolvedParams[key] = (resolvedParams[key] as string).replace(`{${key}}`, String(value))
        }
        // Also replace template strings like {projectPath} in any string param.
        for (const [pk, pv] of Object.entries(resolvedParams)) {
          if (typeof pv === 'string' && pv.includes(`{${key}}`)) {
            resolvedParams[pk] = pv.replace(`{${key}}`, String(value))
          }
        }
      }
    }

    const resolvedStep = { ...stepTemplate, params: resolvedParams }
    const action = resolveStepAction(resolvedStep)

    // -----------------------------------------------------------------------
    // PTY step family — direct PTY operations within the workflow.
    // These use executePrepTool to call the PTY tools through the normal
    // tool pipeline (same approval / grant / audit as external callers).
    // -----------------------------------------------------------------------
    const isPtyStepFamily = resolvedStep.kind === 'pty_send_input'
      || resolvedStep.kind === 'pty_read_screen'
      || resolvedStep.kind === 'pty_wait_for_output'
      || resolvedStep.kind === 'pty_destroy_session'

    if (isPtyStepFamily) {
      const ptyResult = await executePtyStepFamily({
        executePrepTool,
        stateManager,
        step: resolvedStep,
        task,
        taskStep,
      })

      stateManager.completeCurrentStep(ptyResult.succeeded ? 'success' : 'failure', ptyResult.explanation)
      taskStep.outcome = ptyResult.succeeded ? 'success' : 'failure'
      taskStep.finishedAt = new Date().toISOString()
      stepResults.push({
        advisories: [{ category: 'informational', kind: 'proceed', reason: 'PTY step family.', recommendedSurface: 'pty' }],
        explanation: ptyResult.explanation,
        status: ptyResult.succeeded ? 'success' : 'failure',
        step: resolvedStep,
        succeeded: ptyResult.succeeded,
      })

      if (!ptyResult.succeeded && resolvedStep.critical) {
        stateManager.finishTask('failed')
        break
      }
      continue
    }

    // Non-action steps (evaluate, summarize).
    if (!action) {
      const explanation = resolvedStep.kind === 'summarize'
        ? summarizeTaskProgress(task)
        : `Evaluation checkpoint: ${resolvedStep.description}`

      stateManager.completeCurrentStep('success')
      taskStep.outcome = 'success'
      taskStep.finishedAt = new Date().toISOString()
      stepResults.push({
        advisories: [{ category: 'informational', kind: 'proceed', reason: 'Non-action step.', recommendedSurface: 'none' }],
        explanation,
        status: 'success',
        step: resolvedStep,
        succeeded: true,
      })
      continue
    }

    if (refreshState) {
      await refreshState()
    }

    // Evaluate strategy before execution.
    let state = stateManager.getState()
    const initialAdvisories = evaluateStrategy({
      proposedAction: action,
      state,
    })
    let advisories = initialAdvisories
    let executionAdvisories = advisories

    // Check for abort advisory.
    const abortAdvisory = executionAdvisories.find(a => a.kind === 'abort_task')
    if (abortAdvisory) {
      stateManager.completeCurrentStep('failure', abortAdvisory.reason)
      stateManager.finishTask('failed')
      stepResults.push({
        advisories,
        explanation: `Aborted: ${abortAdvisory.reason}`,
        status: 'failure',
        step: resolvedStep,
        succeeded: false,
      })
      break
    }

    // -----------------------------------------------------------------------
    // Terminal Lane v2 — surface resolution + self-acquire PTY.
    //
    // For terminal steps (run_command / run_command_read_result), the engine
    // resolves the target surface BEFORE evaluating strategy advisories.
    // When the surface resolver says 'pty', the engine self-acquires the PTY
    // through the unified approval path (acquirePty callback) and continues
    // execution on the PTY — no outward reroute needed.
    //
    // The old v1 strategy-driven reroute is kept as a secondary fallback
    // when no acquirePty callback is provided.
    // -----------------------------------------------------------------------
    const isTerminalStep = (resolvedStep.kind === 'run_command' || resolvedStep.kind === 'run_command_read_result')
      && action?.kind === 'terminal_exec'

    if (isTerminalStep) {
      const terminalConfig = resolveTerminalConfig(resolvedStep)
      const surfaceResolution = resolveTerminalSurface({
        command: action.input.command as string,
        config: terminalConfig,
        state,
        stepId: taskStep.stepId,
        taskId: task.id,
      })

      if (surfaceResolution.surface === 'pty') {
        // -- PTY path --
        // Try to self-acquire PTY if the callback is available
        if (acquirePty) {
          let ptySessionId = surfaceResolution.boundPtySessionId

          if (!ptySessionId) {
            // Need to acquire a new PTY session
            const acquireResult = await acquirePty({
              autoApprove: autoApproveSteps ?? false,
              cwd: action.input.cwd as string | undefined,
              stepId: taskStep.stepId,
              taskId: task.id,
            })

            if (acquireResult.approvalPending) {
              // Suspend at before_pty_acquire — don't replay completed work
              stateManager.updateTaskPhase('awaiting_approval')
              stateManager.completeCurrentStep('pending_approval', 'Awaiting PTY creation approval')
              taskStep.outcome = 'pending_approval'
              taskStep.finishedAt = new Date().toISOString()
              stepResults.push({
                advisories,
                explanation: `PTY acquisition requires approval: ${surfaceResolution.explanation}`,
                status: 'pending_approval',
                step: resolvedStep,
                succeeded: false,
              })

              const suspension: WorkflowSuspension = {
                overrides,
                pausedAtStepIndex: i,
                pausedDuring: 'before_pty_acquire',
                // Resume at the SAME step (not i+1) — the PTY acquire logic replays
                resumeAtStepIndex: i,
                stepProgress: {
                  completedPreparations: [],
                  ptySessionId: undefined,
                  terminalPhase: 'acquiring',
                },
                stepResults: [...stepResults],
                task: { ...task },
                workflow,
              }

              return {
                status: 'paused',
                stepResults,
                success: false,
                summary: buildWorkflowSummary(workflow, task, stepResults),
                suspension,
                task,
              }
            }

            if (!acquireResult.acquired || !acquireResult.ptySessionId) {
              // Acquisition failed non-recoverably
              const errorMsg = acquireResult.error ?? 'PTY acquisition failed'
              stateManager.completeCurrentStep('failure', errorMsg)
              stateManager.finishTask('failed')
              stepResults.push({
                advisories,
                explanation: `PTY acquisition failed: ${errorMsg}`,
                status: 'failure',
                step: resolvedStep,
                succeeded: false,
              })
              return {
                status: 'failed',
                stepResults,
                success: false,
                summary: buildWorkflowSummary(workflow, task, stepResults),
                task,
              }
            }

            ptySessionId = acquireResult.ptySessionId
          }

          // PTY acquired — record surface decision + binding
          stateManager.recordSurfaceDecision({
            reason: surfaceResolution.explanation,
            source: `surface_resolver:${surfaceResolution.reason}`,
            surface: 'pty',
            transport: 'pty',
          })
          stateManager.addStepTerminalBinding({
            ptySessionId,
            stepId: taskStep.stepId,
            surface: 'pty',
            taskId: task.id,
          })
          if (!surfaceResolution.boundPtySessionId) {
            stateManager.bindPtySessionToStepId(ptySessionId, taskStep.stepId)
          }

          // Execute the command on the PTY by sending it + reading the result
          // For one_shot commands we send, wait, and read screen
          // For persistent commands we just bind — subsequent explicit PTY steps handle interaction
          if (terminalConfig.interaction === 'one_shot') {
            const ptyExecResult = await executePtyCommand({
              command: action.input.command as string,
              executePrepTool,
              ptySessionId,
            })

            if (ptyExecResult.succeeded) {
              stateManager.completeCurrentStep('success')
              taskStep.outcome = 'success'
              taskStep.finishedAt = new Date().toISOString()
              stepResults.push({
                advisories,
                explanation: `Ran on PTY ${ptySessionId}: ${ptyExecResult.explanation}`,
                status: 'success',
                step: resolvedStep,
                succeeded: true,
              })
              continue
            }
            else {
              stateManager.completeCurrentStep('failure', ptyExecResult.explanation)
              stepResults.push({
                advisories,
                explanation: `PTY command failed: ${ptyExecResult.explanation}`,
                status: 'failure',
                step: resolvedStep,
                succeeded: false,
              })
              if (resolvedStep.critical) {
                stateManager.finishTask('failed')
                break
              }
              continue
            }
          }
          else {
            // persistent: PTY is bound, step succeeds immediately.
            // Subsequent pty_send_input / pty_read_screen steps drive the interaction.
            stateManager.completeCurrentStep('success')
            taskStep.outcome = 'success'
            taskStep.finishedAt = new Date().toISOString()
            stepResults.push({
              advisories,
              explanation: `PTY ${ptySessionId} bound for persistent interaction.`,
              status: 'success',
              step: resolvedStep,
              succeeded: true,
            })
            continue
          }
        }

        // Fallback: no acquirePty callback — use legacy outward reroute (v1 path)
        const ptyRerouteAdvisory = executionAdvisories.find(a => a.kind === 'use_pty_surface')
        const existingBinding = stateManager.getStepTerminalBinding(task.id, taskStep.stepId)
        const boundPtySessionId = existingBinding?.ptySessionId ?? stateManager.getActivePtySessionId()

        stateManager.recordSurfaceDecision({
          reason: surfaceResolution.explanation,
          source: 'surface_resolver_legacy_reroute',
          surface: 'pty',
          transport: 'pty',
        })
        stateManager.addStepTerminalBinding({
          stepId: taskStep.stepId,
          surface: 'pty',
          taskId: task.id,
          ...(boundPtySessionId ? { ptySessionId: boundPtySessionId } : {}),
        })

        stateManager.completeCurrentStep('reroute_required', `Reroute to PTY: ${surfaceResolution.explanation}`)
        taskStep.outcome = 'reroute_required'
        taskStep.finishedAt = new Date().toISOString()
        stateManager.finishTask('reroute_required')
        stepResults.push({
          advisories,
          explanation: `exec → pty reroute: ${surfaceResolution.explanation}`,
          status: 'reroute_required',
          step: resolvedStep,
          succeeded: false,
        })

        return {
          rerouteAdvisory: ptyRerouteAdvisory ?? {
            category: 'reroute',
            kind: 'use_pty_surface',
            reason: surfaceResolution.explanation,
            recommendedSurface: 'pty',
            suggestedToolName: 'pty_read_screen',
          },
          status: 'reroute_required',
          stepResults,
          success: false,
          summary: buildWorkflowSummary(workflow, task, stepResults),
          task,
        }
      }

      // exec surface — record and continue to normal exec below
      stateManager.recordSurfaceDecision({
        reason: surfaceResolution.explanation,
        source: `surface_resolver:${surfaceResolution.reason}`,
        surface: 'exec',
        transport: 'exec',
      })
      stateManager.addStepTerminalBinding({
        stepId: taskStep.stepId,
        surface: 'exec',
        taskId: task.id,
      })
    }

    const preparatoryResults: PreparatoryResult[] = []

    const actionPrepAdvisories = advisories.filter(adv => adv.suggestedAction && !PREP_TOOL_POLICY[adv.kind])
    if (actionPrepAdvisories.length > 0) {
      const prepOutcome = await executeActionPreparations({
        advisories: actionPrepAdvisories,
        autoApproveSteps: autoApproveSteps ?? false,
        executeAction,
        existingPreparatoryResults: preparatoryResults,
        overrides,
        resolvedStep,
        stateManager,
        stepIndex: i,
        stepResults,
        task,
        taskStep,
        workflow,
      })

      if (prepOutcome) {
        return prepOutcome
      }

      if (refreshState) {
        await refreshState()
      }

      state = stateManager.getState()
      executionAdvisories = evaluateStrategy({
        proposedAction: action,
        state,
      })
      advisories = mergeAdvisories(initialAdvisories, executionAdvisories)

      const postActionAbortAdvisory = executionAdvisories.find(a => a.kind === 'abort_task')
      if (postActionAbortAdvisory) {
        stateManager.completeCurrentStep('failure', postActionAbortAdvisory.reason)
        stateManager.finishTask('failed')
        stepResults.push({
          advisories,
          explanation: `Aborted: ${postActionAbortAdvisory.reason}`,
          preparatoryResults,
          status: 'failure',
          step: resolvedStep,
          succeeded: false,
        })
        return {
          status: 'failed',
          stepResults,
          success: false,
          summary: buildWorkflowSummary(workflow, task, stepResults),
          task,
        }
      }
    }

    // ------------------------------------------------------------------
    // Tool-prep pipeline: collect advisories that have a PREP_TOOL_POLICY,
    // sort by priority, execute them, and handle reroute / writeback.
    // ------------------------------------------------------------------
    const prepAdvisories = executionAdvisories
      .filter(a => PREP_TOOL_POLICY[a.kind])
      .sort((a, b) => (PREP_TOOL_POLICY[a.kind]!.priority) - (PREP_TOOL_POLICY[b.kind]!.priority))

    let prepFailure: undefined | { message: string, toolName: string }
    let rerouteTriggered = false
    let rerouteAdvisory: StrategyAdvisory | undefined

    for (const prepAdv of prepAdvisories) {
      const policy = PREP_TOOL_POLICY[prepAdv.kind]!
      const prepToolName = prepAdv.suggestedToolName ?? `prep_${prepAdv.kind}`

      // advisory_only: log it but don't invoke
      if (policy.retryability === 'advisory_only') {
        preparatoryResults.push({
          metadata: { advisory_only: true },
          succeeded: true,
          toolName: prepToolName,
        })
        continue
      }

      taskStep.toolName = prepToolName

      try {
        let prepResult = await invokePreparatoryExecution({
          advisory: prepAdv,
          executeAction,
          executePrepTool,
          skipApprovalQueue: autoApproveSteps ?? false,
        })

        if (prepResult.isError === true && policy.retryability === 'transient') {
          prepResult = await invokePreparatoryExecution({
            advisory: prepAdv,
            executeAction,
            executePrepTool,
            retry: true,
            skipApprovalQueue: autoApproveSteps ?? false,
          })
        }

        if (prepResult.isError === true) {
          const errorMessage = extractErrorMessage(prepResult)
          preparatoryResults.push({
            error: errorMessage,
            metadata: extractPrepMetadata(prepToolName, prepResult),
            succeeded: false,
            toolName: prepToolName,
          })
          prepFailure = {
            message: errorMessage,
            toolName: prepToolName,
          }
          break
        }

        if (prepAdv.kind === 'enumerate_displays_first') {
          const displayInfo = extractDisplayInfo(prepResult)
          if (displayInfo) {
            stateManager.updateDisplayInfo(displayInfo)
          }
        }

        preparatoryResults.push({
          metadata: extractPrepMetadata(prepToolName, prepResult),
          succeeded: true,
          toolName: prepToolName,
        })

        if (policy.outcomeOnSuccess === 'reroute') {
          rerouteTriggered = true
          rerouteAdvisory = prepAdv
          break
        }
      }
      catch (error) {
        const errorMessage = errorMessageFromValue(error)
        preparatoryResults.push({
          error: errorMessage,
          succeeded: false,
          toolName: prepToolName,
        })
        prepFailure = {
          message: errorMessage,
          toolName: prepToolName,
        }
        break
      }
    }

    if (prepFailure) {
      const failureExplanation = `Preparatory tool "${prepFailure.toolName}" failed: ${prepFailure.message}`

      stateManager.completeCurrentStep('failure', failureExplanation)
      stateManager.finishTask('failed')
      stepResults.push({
        advisories,
        explanation: failureExplanation,
        preparatoryResults,
        status: 'failure',
        step: resolvedStep,
        succeeded: false,
      })

      return {
        status: 'failed',
        stepResults,
        success: false,
        summary: buildWorkflowSummary(workflow, task, stepResults),
        task,
      }
    }

    // If reroute was triggered, stop the workflow and return.
    if (rerouteTriggered && rerouteAdvisory) {
      stateManager.completeCurrentStep('reroute_required', `Reroute to ${rerouteAdvisory.recommendedSurface}`)
      taskStep.outcome = 'reroute_required'
      taskStep.finishedAt = new Date().toISOString()
      stateManager.finishTask('reroute_required')
      stepResults.push({
        advisories,
        explanation: `Reroute required: ${rerouteAdvisory.reason}`,
        preparatoryResults,
        status: 'reroute_required',
        step: resolvedStep,
        succeeded: false,
      })

      return {
        rerouteAdvisory,
        status: 'reroute_required',
        stepResults,
        success: false,
        summary: buildWorkflowSummary(workflow, task, stepResults),
        task,
      }
    }

    // Execute the main action.
    const toolName = `workflow_${workflow.id}_step_${i + 1}`
    taskStep.toolName = toolName

    try {
      const intent = explainActionIntent(action, stateManager.getState())
      const result = await executeAction(action, toolName, {
        skipApprovalQueue: autoApproveSteps ?? false,
      })
      const isError = result.isError === true

      // Check if the result indicates approval_required.
      const structured = result.structuredContent as Record<string, unknown> | undefined
      const isApprovalRequired = structured?.status === 'approval_required'

      if (isApprovalRequired) {
        stateManager.updateTaskPhase('awaiting_approval')
        stateManager.completeCurrentStep('pending_approval', 'Awaiting user approval')
        taskStep.outcome = 'pending_approval'
        taskStep.finishedAt = new Date().toISOString()
        stepResults.push({
          advisories,
          explanation: `${intent} — Awaiting approval. ${explainNextStep(advisories, task)}`,
          preparatoryResults: preparatoryResults.length > 0 ? preparatoryResults : undefined,
          status: 'pending_approval',
          step: resolvedStep,
          succeeded: false,
          toolResult: result,
        })
        // Build suspension so the workflow can be resumed after approval.
        const suspension: WorkflowSuspension = {
          overrides,
          pausedAtStepIndex: i,
          pausedDuring: 'main_action',
          resumeAtStepIndex: i + 1,
          stepResults: [...stepResults],
          task: { ...task },
          workflow,
        }
        return {
          status: 'paused' as WorkflowStatus,
          stepResults,
          success: false,
          summary: buildWorkflowSummary(workflow, task, stepResults),
          suspension,
          task,
        }
      }

      if (isError) {
        const errorMsg = extractErrorMessage(result)
        const recovery = buildRecoveryPlan({
          errorMessage: errorMsg,
          failedAction: action,
          state: stateManager.getState(),
        })

        stateManager.completeCurrentStep('failure', errorMsg)
        // NOTICE: completeCurrentStep already increments failureCount — do NOT double-count.
        stepResults.push({
          advisories: [...advisories, recovery],
          explanation: explainActionOutcome({
            action,
            context: stateManager.getState().foregroundContext || { available: false, platform: process.platform as NodeJS.Platform },
            errorMessage: errorMsg,
            succeeded: false,
          }),
          preparatoryResults: preparatoryResults.length > 0 ? preparatoryResults : undefined,
          status: 'failure',
          step: resolvedStep,
          succeeded: false,
          toolResult: result,
        })

        // If the step is critical, abort.
        if (resolvedStep.critical) {
          stateManager.finishTask('failed')
          break
        }
        // Otherwise continue (the strategy layer will handle recovery in the next iteration).
        continue
      }

      // Success.
      stateManager.completeCurrentStep('success')
      taskStep.outcome = 'success'
      taskStep.finishedAt = new Date().toISOString()
      stepResults.push({
        advisories,
        explanation: explainActionOutcome({
          action,
          context: stateManager.getState().foregroundContext || { available: false, platform: process.platform as NodeJS.Platform },
          succeeded: true,
        }),
        preparatoryResults: preparatoryResults.length > 0 ? preparatoryResults : undefined,
        status: 'success',
        step: resolvedStep,
        succeeded: true,
        toolResult: result,
      })
    }
    catch (error) {
      const errorMsg = errorMessageFromValue(error)
      stateManager.completeCurrentStep('failure', errorMsg)
      // NOTICE: completeCurrentStep already increments failureCount — do NOT double-count.
      stepResults.push({
        advisories,
        explanation: `Unexpected error: ${errorMsg}`,
        preparatoryResults: preparatoryResults.length > 0 ? preparatoryResults : undefined,
        status: 'failure',
        step: resolvedStep,
        succeeded: false,
      })

      if (resolvedStep.critical) {
        stateManager.finishTask('failed')
        break
      }
    }
  }

  // Determine overall success.
  const allCompleted = stepResults.every(r => r.succeeded)
  const wasAborted = task.phase === 'failed'
  const wasPaused = stepResults.some(r => !r.succeeded && r.step.kind !== 'evaluate')

  if (allCompleted && !wasAborted) {
    stateManager.finishTask('completed')
  }
  else if (!wasAborted && !wasPaused) {
    stateManager.finishTask('failed')
  }

  const summary = buildWorkflowSummary(workflow, task, stepResults)
  const status: WorkflowStatus = allCompleted && !wasAborted ? 'completed' : 'failed'

  return {
    status,
    stepResults,
    success: allCompleted && !wasAborted,
    summary,
    task,
  }
}

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

/**
 * Resume a previously suspended workflow from where it left off.
 *
 * The step that caused the suspension (awaiting approval) is assumed
 * to have been handled externally (approved via `desktop_approve_pending_action`
 * or rejected via `desktop_reject_pending_action`).
 */
export async function resumeWorkflow(params: {
  acquirePty?: AcquirePtyForStep
  /** Whether the pending step's approval was granted. Default: true. */
  approved?: boolean
  /** Skip per-step approval for remaining steps. Default: false. */
  autoApproveSteps?: boolean
  executeAction: ExecuteAction
  executePrepTool?: ExecutePrepTool
  refreshState?: () => Promise<void>
  stateManager: RunStateManager
  suspension: WorkflowSuspension
}): Promise<WorkflowExecutionResult> {
  const { acquirePty, approved = true, autoApproveSteps, executeAction, executePrepTool, refreshState, stateManager, suspension } = params

  // Update the paused step's outcome in the carried-over results.
  const pausedStep = suspension.task.steps[suspension.pausedAtStepIndex]
  if (pausedStep) {
    pausedStep.outcome = approved && suspension.pausedDuring === 'main_action' ? 'success' : approved ? undefined : 'rejected'
    pausedStep.finishedAt = approved && suspension.pausedDuring === 'main_action'
      ? new Date().toISOString()
      : undefined
    pausedStep.outcomeReason = approved ? undefined : pausedStep.outcomeReason
    if (approved && suspension.pausedDuring === 'action_prep') {
      pausedStep.toolName = undefined
    }
  }
  // Also update the last step result's status.
  const lastResult = suspension.stepResults[suspension.stepResults.length - 1]
  if (lastResult && suspension.pausedDuring === 'main_action') {
    lastResult.succeeded = approved
    lastResult.status = approved ? 'success' : 'failure'
    lastResult.explanation = approved
      ? `${lastResult.explanation} (approved and executed)`
      : `${lastResult.explanation} (rejected)`
  }

  if (!approved) {
    stateManager.finishTask('failed')
    suspension.task.phase = 'failed'
    return {
      status: 'failed' as WorkflowStatus,
      stepResults: suspension.stepResults,
      success: false,
      summary: buildWorkflowSummary(suspension.workflow, suspension.task, suspension.stepResults),
      task: suspension.task,
    }
  }

  // Continue from the step after the one that was paused.
  // For before_pty_acquire: resume at the SAME step (already set in suspension.resumeAtStepIndex).
  const previousResults = suspension.pausedDuring === 'action_prep'
    ? suspension.stepResults.slice(0, -1)
    : suspension.pausedDuring === 'before_pty_acquire'
      ? suspension.stepResults.slice(0, -1) // Drop the paused step result — it will be re-executed
      : suspension.stepResults

  return executeWorkflow({
    _resume: {
      existingTask: suspension.task,
      previousResults,
      startIndex: suspension.resumeAtStepIndex,
    },
    acquirePty,
    autoApproveSteps,
    executeAction,
    executePrepTool,
    overrides: suspension.overrides,
    refreshState,
    stateManager,
    workflow: suspension.workflow,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWorkflowSummary(
  workflow: WorkflowDefinition,
  task: ActiveTask,
  results: WorkflowStepResult[],
): string {
  const lines: string[] = [
    `Workflow: ${workflow.name}`,
    `Status: ${task.phase}`,
    `Steps: ${results.filter(r => r.succeeded).length}/${results.length} succeeded`,
    '',
  ]

  for (const r of results) {
    const icon = r.succeeded ? '✓' : '✗'
    lines.push(`  ${icon} ${r.step.label}: ${r.explanation}`)
  }

  if (task.failureCount > 0) {
    lines.push('')
    lines.push(`Total failures: ${task.failureCount}`)
  }

  return lines.join('\n')
}

async function executeActionPreparations(params: {
  advisories: StrategyAdvisory[]
  autoApproveSteps: boolean
  executeAction: ExecuteAction
  existingPreparatoryResults: PreparatoryResult[]
  overrides?: Record<string, unknown>
  resolvedStep: WorkflowStepTemplate
  stateManager: RunStateManager
  stepIndex: number
  stepResults: WorkflowStepResult[]
  task: ActiveTask
  taskStep: TaskStep
  workflow: WorkflowDefinition
}): Promise<undefined | WorkflowExecutionResult> {
  const {
    advisories,
    autoApproveSteps,
    executeAction,
    existingPreparatoryResults,
    overrides,
    resolvedStep,
    stateManager,
    stepIndex,
    stepResults,
    task,
    taskStep,
    workflow,
  } = params

  for (const advisory of advisories) {
    const action = advisory.suggestedAction
    if (!action) {
      continue
    }

    const prepToolName = `prep_${advisory.kind}`
    taskStep.toolName = prepToolName

    try {
      const result = await executeAction(action, prepToolName, {
        skipApprovalQueue: autoApproveSteps,
      })
      const structured = toRecord(result.structuredContent)
      const isApprovalRequired = structured?.status === 'approval_required'

      if (isApprovalRequired) {
        existingPreparatoryResults.push({
          metadata: {
            actionKind: action.kind,
            advisoryKind: advisory.kind,
            status: 'approval_required',
          },
          succeeded: false,
          toolName: prepToolName,
        })

        stateManager.updateTaskPhase('awaiting_approval')
        stateManager.completeCurrentStep('pending_approval', `Preparatory action "${action.kind}" is awaiting approval`)
        taskStep.outcome = 'pending_approval'
        taskStep.finishedAt = new Date().toISOString()

        stepResults.push({
          advisories,
          explanation: `Preparatory action "${action.kind}" is awaiting approval before continuing this step.`,
          preparatoryResults: [...existingPreparatoryResults],
          status: 'pending_approval',
          step: resolvedStep,
          succeeded: false,
          toolResult: result,
        })

        const suspension: WorkflowSuspension = {
          overrides,
          pausedAtStepIndex: stepIndex,
          pausedDuring: 'action_prep',
          resumeAtStepIndex: stepIndex,
          stepResults: [...stepResults],
          task: { ...task },
          workflow,
        }

        return {
          status: 'paused',
          stepResults,
          success: false,
          summary: buildWorkflowSummary(workflow, task, stepResults),
          suspension,
          task,
        }
      }

      if (result.isError === true) {
        const errorMessage = extractErrorMessage(result)
        existingPreparatoryResults.push({
          error: errorMessage,
          metadata: {
            actionKind: action.kind,
            advisoryKind: advisory.kind,
          },
          succeeded: false,
          toolName: prepToolName,
        })

        const explanation = `Preparatory action "${action.kind}" failed: ${errorMessage}`
        stateManager.completeCurrentStep('failure', explanation)
        stateManager.finishTask('failed')
        stepResults.push({
          advisories,
          explanation,
          preparatoryResults: [...existingPreparatoryResults],
          status: 'failure',
          step: resolvedStep,
          succeeded: false,
          toolResult: result,
        })

        return {
          status: 'failed',
          stepResults,
          success: false,
          summary: buildWorkflowSummary(workflow, task, stepResults),
          task,
        }
      }

      existingPreparatoryResults.push({
        metadata: {
          actionKind: action.kind,
          advisoryKind: advisory.kind,
          status: typeof structured?.status === 'string' ? structured.status : 'executed',
        },
        succeeded: true,
        toolName: prepToolName,
      })
    }
    catch (error) {
      const errorMessage = errorMessageFromValue(error)
      existingPreparatoryResults.push({
        error: errorMessage,
        metadata: {
          actionKind: action.kind,
          advisoryKind: advisory.kind,
        },
        succeeded: false,
        toolName: prepToolName,
      })

      const explanation = `Preparatory action "${action.kind}" failed: ${errorMessage}`
      stateManager.completeCurrentStep('failure', explanation)
      stateManager.finishTask('failed')
      stepResults.push({
        advisories,
        explanation,
        preparatoryResults: [...existingPreparatoryResults],
        status: 'failure',
        step: resolvedStep,
        succeeded: false,
      })

      return {
        status: 'failed',
        stepResults,
        success: false,
        summary: buildWorkflowSummary(workflow, task, stepResults),
        task,
      }
    }
  }

  return undefined
}

/**
 * Execute a one-shot command on a PTY session by sending the command,
 * waiting briefly, and reading the screen.
 *
 * This is the engine's internal "PTY exec" — it uses `executePrepTool`
 * to drive `pty_send_input` + `pty_read_screen` which go through the
 * same tool pipeline as external callers.
 */
async function executePtyCommand(params: {
  command: string
  executePrepTool?: ExecutePrepTool
  ptySessionId: string
}): Promise<{ explanation: string, screenContent?: string, succeeded: boolean }> {
  const { command, executePrepTool, ptySessionId } = params

  if (!executePrepTool) {
    return {
      explanation: 'No executePrepTool callback available for PTY command execution.',
      succeeded: false,
    }
  }

  try {
    // Send the command with a trailing carriage return
    const sendResult = await executePrepTool(`pty_send_input:${ptySessionId}:${command}`)
    if (sendResult.isError === true) {
      return {
        explanation: `PTY send_input failed: ${extractErrorMessage(sendResult)}`,
        succeeded: false,
      }
    }

    // Brief pause for command execution
    await new Promise(resolve => setTimeout(resolve, 500))

    // Read the screen
    const readResult = await executePrepTool(`pty_read_screen:${ptySessionId}`)
    if (readResult.isError === true) {
      return {
        explanation: `PTY read_screen failed: ${extractErrorMessage(readResult)}`,
        succeeded: false,
      }
    }

    const structured = toRecord(readResult.structuredContent)
    const screenContent = typeof structured?.screenContent === 'string'
      ? structured.screenContent
      : undefined

    return {
      explanation: `Command sent to PTY ${ptySessionId}`,
      screenContent,
      succeeded: true,
    }
  }
  catch (error) {
    return {
      explanation: `PTY command execution error: ${errorMessageFromValue(error)}`,
      succeeded: false,
    }
  }
}

/**
 * Execute a PTY step family operation within the workflow engine.
 * Resolves the bound PTY session from state and drives the operation
 * through the standard tool pipeline.
 */
async function executePtyStepFamily(params: {
  executePrepTool?: ExecutePrepTool
  stateManager: RunStateManager
  step: WorkflowStepTemplate
  task: ActiveTask
  taskStep: TaskStep
}): Promise<{ explanation: string, succeeded: boolean }> {
  const { executePrepTool, stateManager, step, task, taskStep } = params

  if (!executePrepTool) {
    return { explanation: 'No executePrepTool callback — cannot execute PTY step family.', succeeded: false }
  }

  // Find the PTY session bound to this step (or the most recent active session)
  const binding = stateManager.getStepTerminalBinding(task.id, taskStep.stepId)
  const ptySessionId = binding?.ptySessionId
    ?? (step.params.sessionId as string | undefined)
    ?? stateManager.getActivePtySessionId()

  if (!ptySessionId && step.kind !== 'pty_destroy_session') {
    return { explanation: 'No PTY session id available for this step.', succeeded: false }
  }

  try {
    switch (step.kind) {
      case 'pty_destroy_session': {
        const targetId = ptySessionId ?? (step.params.sessionId as string)
        if (!targetId) {
          return { explanation: 'pty_destroy_session requires a session id.', succeeded: false }
        }
        const result = await executePrepTool(`pty_destroy:${targetId}`)
        if (result.isError === true) {
          return { explanation: `pty_destroy failed: ${extractErrorMessage(result)}`, succeeded: false }
        }
        return { explanation: `Destroyed PTY session ${targetId}.`, succeeded: true }
      }

      case 'pty_read_screen': {
        const result = await executePrepTool(`pty_read_screen:${ptySessionId}`)
        if (result.isError === true) {
          return { explanation: `pty_read_screen failed: ${extractErrorMessage(result)}`, succeeded: false }
        }
        return { explanation: `Read screen from PTY ${ptySessionId}.`, succeeded: true }
      }

      case 'pty_send_input': {
        const data = step.params.data as string
        if (!data) {
          return { explanation: 'pty_send_input requires a "data" param.', succeeded: false }
        }
        const result = await executePrepTool(`pty_send_input:${ptySessionId}:${data}`)
        if (result.isError === true) {
          return { explanation: `pty_send_input failed: ${extractErrorMessage(result)}`, succeeded: false }
        }
        return { explanation: `Sent ${data.length} bytes to PTY ${ptySessionId}.`, succeeded: true }
      }

      case 'pty_wait_for_output': {
        const marker = step.params.marker as string
        const timeoutMs = (step.params.timeoutMs as number) ?? 10_000
        if (!marker) {
          return { explanation: 'pty_wait_for_output requires a "marker" param.', succeeded: false }
        }
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
          const result = await executePrepTool(`pty_read_screen:${ptySessionId}`)
          if (result.isError !== true) {
            const structured = toRecord(result.structuredContent)
            const content = typeof structured?.screenContent === 'string' ? structured.screenContent : ''
            if (content.includes(marker)) {
              return { explanation: `Marker "${marker}" found in PTY ${ptySessionId}.`, succeeded: true }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 250))
        }
        return { explanation: `Timeout waiting for marker "${marker}" in PTY ${ptySessionId}.`, succeeded: false }
      }

      default:
        return { explanation: `Unknown PTY step kind: ${step.kind}`, succeeded: false }
    }
  }
  catch (error) {
    return { explanation: `PTY step error: ${errorMessageFromValue(error)}`, succeeded: false }
  }
}

function extractDisplayInfo(result: CallToolResult): DisplayInfo | undefined {
  const structured = toRecord(result.structuredContent)

  if (!structured || structured.status !== 'ok') {
    return undefined
  }

  const combinedBounds = toBounds(structured.combinedBounds)
  const rawDisplays = Array.isArray(structured.displays) ? structured.displays : []
  const displays = rawDisplays
    .map((entry) => {
      const record = toRecord(entry)
      const bounds = toBounds(record?.bounds)
      const visibleBounds = toBounds(record?.visibleBounds)

      if (!record || !bounds || !visibleBounds || typeof record.displayId !== 'number' || typeof record.isMain !== 'boolean' || typeof record.isBuiltIn !== 'boolean' || typeof record.scaleFactor !== 'number' || typeof record.pixelWidth !== 'number' || typeof record.pixelHeight !== 'number') {
        return undefined
      }

      return {
        bounds,
        displayId: record.displayId,
        isBuiltIn: record.isBuiltIn,
        isMain: record.isMain,
        pixelHeight: record.pixelHeight,
        pixelWidth: record.pixelWidth,
        scaleFactor: record.scaleFactor,
        visibleBounds,
      }
    })
    .filter((display): display is NonNullable<DisplayInfo['displays']>[number] => Boolean(display))

  const primaryDisplay = displays.find(display => display.isMain) ?? displays[0]
  const displayCount = typeof structured.displayCount === 'number' ? structured.displayCount : displays.length

  return {
    available: true,
    capturedAt: typeof structured.capturedAt === 'string' ? structured.capturedAt : undefined,
    combinedBounds,
    displayCount,
    displays,
    isRetina: typeof primaryDisplay?.scaleFactor === 'number' ? primaryDisplay.scaleFactor > 1 : undefined,
    logicalHeight: combinedBounds?.height,
    logicalWidth: combinedBounds?.width,
    note: displayCount > 1 ? 'display geometry captured from workflow prep enumeration' : undefined,
    pixelHeight: primaryDisplay?.pixelHeight,
    pixelWidth: primaryDisplay?.pixelWidth,
    platform: process.platform as NodeJS.Platform,
    scaleFactor: primaryDisplay?.scaleFactor,
  }
}

function extractErrorMessage(result: CallToolResult): string {
  const textParts = (result.content ?? [])
    .filter((c): c is { text: string, type: 'text' } => c.type === 'text')
    .map(c => c.text)
  return textParts.join(' ') || 'Unknown error'
}

function extractPrepMetadata(toolName: string, result: CallToolResult): Record<string, unknown> | undefined {
  const structured = toRecord(result.structuredContent)

  if (!structured) {
    return undefined
  }

  switch (toolName) {
    case 'accessibility_snapshot':
      return {
        appName: structured.appName,
        capturedAt: structured.capturedAt,
        nodeCount: structured.nodeCount,
        pid: structured.pid,
        status: structured.status,
      }
    case 'browser_cdp_collect_elements':
      return {
        elementCount: structured.elementCount,
        page: structured.page,
        status: structured.status,
      }
    case 'browser_dom_read_page':
      return {
        bridge: structured.bridge,
        frameCount: structured.frameCount,
        interactiveElementCount: structured.interactiveElementCount,
        status: structured.status,
      }
    case 'display_enumerate':
      return {
        capturedAt: structured.capturedAt,
        combinedBounds: structured.combinedBounds,
        displayCount: structured.displayCount,
        status: structured.status,
      }
    case 'pty_read_screen':
      return {
        alive: structured.alive,
        cols: structured.cols,
        executionReason: structured.executionReason,
        rows: structured.rows,
        sessionId: structured.sessionId,
        status: structured.status,
      }
    default:
      return typeof structured.status === 'string'
        ? { status: structured.status }
        : undefined
  }
}

async function invokePreparatoryExecution(params: {
  advisory: StrategyAdvisory
  executeAction: ExecuteAction
  executePrepTool?: ExecutePrepTool
  retry?: boolean
  skipApprovalQueue: boolean
}): Promise<CallToolResult> {
  const { advisory, executeAction, executePrepTool, retry = false, skipApprovalQueue } = params

  if (advisory.suggestedToolName && executePrepTool) {
    return await executePrepTool(advisory.suggestedToolName, {
      skipApprovalQueue,
    })
  }

  if (advisory.suggestedAction) {
    return await executeAction(advisory.suggestedAction, retry ? `prep_${advisory.kind}_retry` : `prep_${advisory.kind}`, {
      skipApprovalQueue,
    })
  }

  throw new Error(`No execution path available for preparatory advisory "${advisory.kind}"`)
}

function mergeAdvisories(...batches: StrategyAdvisory[][]): StrategyAdvisory[] {
  const seen = new Set<string>()
  const merged: StrategyAdvisory[] = []

  for (const batch of batches) {
    for (const advisory of batch) {
      const key = `${advisory.kind}::${advisory.reason}::${advisory.suggestedToolName || advisory.suggestedAction?.kind || ''}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      merged.push(advisory)
    }
  }

  return merged
}

function toBounds(value: unknown): DisplayInfo['combinedBounds'] {
  const record = toRecord(value)

  if (!record) {
    return undefined
  }

  const x = typeof record.x === 'number' ? record.x : undefined
  const y = typeof record.y === 'number' ? record.y : undefined
  const width = typeof record.width === 'number' ? record.width : undefined
  const height = typeof record.height === 'number' ? record.height : undefined

  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined
  }

  return { height, width, x, y }
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}
