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
import { resolveTerminalSurface } from './surface-resolver'
import { resolveStepAction, resolveTerminalConfig } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Captures the state of a paused workflow so it can be resumed
 * after external approval or rejection.
 */
export interface WorkflowSuspension {
  workflow: WorkflowDefinition
  pausedAtStepIndex: number
  resumeAtStepIndex: number
  pausedDuring: 'main_action' | 'action_prep' | 'before_pty_acquire'
  overrides?: Record<string, unknown>
  stepResults: WorkflowStepResult[]
  task: ActiveTask
  /**
   * Tracks the terminal acquisition progress of the paused step so that
   * on resume we don't replay already-completed work.
   */
  stepProgress?: StepTerminalProgress
}

/** Terminal acquisition state for a single workflow step. */
export interface StepTerminalProgress {
  /** Where in the terminal acquisition lifecycle we are. */
  terminalPhase: 'not_started' | 'acquiring' | 'acquired' | 'executing'
  /** Pre-PTY preparations that completed before the pause. */
  completedPreparations: string[]
  /** Bound PTY session id (if already acquired before the pause). */
  ptySessionId?: string
}

export type WorkflowStatus = 'completed' | 'failed' | 'paused' | 'reroute_required'

export interface WorkflowExecutionResult {
  /** Whether the workflow completed all steps successfully. */
  success: boolean
  /** Machine-readable overall status. */
  status: WorkflowStatus
  /** The final task state. */
  task: ActiveTask
  /** Per-step results. */
  stepResults: WorkflowStepResult[]
  /** Human-readable summary of the entire workflow execution. */
  summary: string
  /**
   * If the workflow was paused (e.g. awaiting approval), this contains
   * the state needed to resume it later via `resumeWorkflow()`.
   */
  suspension?: WorkflowSuspension
  /**
   * When status is 'reroute_required', the advisory that triggered it
   * so the caller knows which surface to switch to.
   */
  rerouteAdvisory?: StrategyAdvisory
}

export interface ExecutePrepToolOptions {
  skipApprovalQueue?: boolean
}

export type ExecutePrepTool = (toolName: string, options?: ExecutePrepToolOptions) => Promise<CallToolResult>

/** Result of a single prep tool invocation within the engine. */
export interface PreparatoryResult {
  toolName: string
  succeeded: boolean
  error?: string
  /** Metadata returned by the prep handler (slimmed for workflow use). */
  metadata?: Record<string, unknown>
}

export interface WorkflowStepResult {
  step: WorkflowStepTemplate
  /** MCP tool result (undefined for non-action steps). */
  toolResult?: CallToolResult
  /** Strategy advisories evaluated before execution. */
  advisories: StrategyAdvisory[]
  /** Whether this step succeeded. */
  succeeded: boolean
  /** Machine-readable step-level status. */
  status: 'success' | 'failure' | 'reroute_required' | 'pending_approval' | 'prepared'
  /** Explanation of what happened. */
  explanation: string
  /** Results of preparatory tool invocations (if any). */
  preparatoryResults?: PreparatoryResult[]
}

// ---------------------------------------------------------------------------
// PTY acquisition callback
// ---------------------------------------------------------------------------

export interface AcquirePtyResult {
  /** Whether the PTY was successfully created. */
  acquired: boolean
  /** The allocated session id (only when `acquired` is true). */
  ptySessionId?: string
  /** True when approval is pending — workflow should suspend at `before_pty_acquire`. */
  approvalPending?: boolean
  /** Error message (only when acquisition failed non-recoverably). */
  error?: string
}

/**
 * Callback the engine invokes when surface resolution determines a step
 * needs a PTY. Implementations MUST go through the same approval / grant /
 * audit pipeline as an external `pty_create` — no shortcuts.
 */
export type AcquirePtyForStep = (params: {
  taskId: string
  stepId: string
  cwd?: string
  rows?: number
  cols?: number
  /** Whether the engine is running in auto-approve mode. */
  autoApprove: boolean
}) => Promise<AcquirePtyResult>

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export async function executeWorkflow(params: {
  workflow: WorkflowDefinition
  executeAction: ExecuteAction
  executePrepTool?: ExecutePrepTool
  stateManager: RunStateManager
  refreshState?: () => Promise<void>
  /** Override parameters to inject at runtime (e.g. project path). */
  overrides?: Record<string, unknown>
  /**
   * If true, all action steps within this workflow will bypass the
   * approval queue. The user has already expressed intent by invoking
   * the workflow tool, so individual-step confirmation is unnecessary.
   * Default: false.
   */
  autoApproveSteps?: boolean
  /**
   * Callback to acquire a PTY session. The engine uses this when surface
   * resolution determines a step needs a PTY. The callback MUST go through
   * the same approval / grant / audit path as an external `pty_create`.
   * Returns the allocated session id, or undefined if approval is pending.
   */
  acquirePty?: AcquirePtyForStep
  /**
   * Internal: resume state from a previous suspension. Use `resumeWorkflow()`
   * instead of setting this directly.
   */
  _resume?: {
    startIndex: number
    previousResults: WorkflowStepResult[]
    existingTask: ActiveTask
  }
}): Promise<WorkflowExecutionResult> {
  const { workflow, executeAction, executePrepTool, stateManager, refreshState, overrides, autoApproveSteps, acquirePty } = params
  const stepResults: WorkflowStepResult[] = params._resume?.previousResults ?? []
  const startIndex = params._resume?.startIndex ?? 0

  // Create the task in run state, or reuse existing task when resuming.
  const task: ActiveTask = params._resume?.existingTask ?? {
    id: randomUUID(),
    goal: workflow.name,
    workflowId: workflow.id,
    phase: 'executing',
    steps: workflow.steps.map((s, i) => ({
      index: i + 1,
      stepId: `step_${randomUUID()}`,
      label: s.label,
      toolName: undefined,
      outcome: undefined,
    } satisfies TaskStep)),
    currentStepIndex: 0,
    startedAt: new Date().toISOString(),
    failureCount: 0,
    maxConsecutiveFailures: workflow.maxRetries,
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
        step: resolvedStep,
        task,
        taskStep,
        stateManager,
        executePrepTool,
      })

      stateManager.completeCurrentStep(ptyResult.succeeded ? 'success' : 'failure', ptyResult.explanation)
      taskStep.outcome = ptyResult.succeeded ? 'success' : 'failure'
      taskStep.finishedAt = new Date().toISOString()
      stepResults.push({
        step: resolvedStep,
        advisories: [{ kind: 'proceed', reason: 'PTY step family.', category: 'informational', recommendedSurface: 'pty' }],
        succeeded: ptyResult.succeeded,
        status: ptyResult.succeeded ? 'success' : 'failure',
        explanation: ptyResult.explanation,
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
        step: resolvedStep,
        advisories: [{ kind: 'proceed', reason: 'Non-action step.', category: 'informational', recommendedSurface: 'none' }],
        succeeded: true,
        status: 'success',
        explanation,
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
        step: resolvedStep,
        advisories,
        succeeded: false,
        status: 'failure',
        explanation: `Aborted: ${abortAdvisory.reason}`,
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
        taskId: task.id,
        stepId: taskStep.stepId,
        config: terminalConfig,
        command: action.input.command as string,
        state,
      })

      if (surfaceResolution.surface === 'pty') {
        // -- PTY path --
        // Try to self-acquire PTY if the callback is available
        if (acquirePty) {
          let ptySessionId = surfaceResolution.boundPtySessionId

          if (!ptySessionId) {
            // Need to acquire a new PTY session
            const acquireResult = await acquirePty({
              taskId: task.id,
              stepId: taskStep.stepId,
              cwd: action.input.cwd as string | undefined,
              autoApprove: autoApproveSteps ?? false,
            })

            if (acquireResult.approvalPending) {
              // Suspend at before_pty_acquire — don't replay completed work
              stateManager.updateTaskPhase('awaiting_approval')
              stateManager.completeCurrentStep('pending_approval', 'Awaiting PTY creation approval')
              taskStep.outcome = 'pending_approval'
              taskStep.finishedAt = new Date().toISOString()
              stepResults.push({
                step: resolvedStep,
                advisories,
                succeeded: false,
                status: 'pending_approval',
                explanation: `PTY acquisition requires approval: ${surfaceResolution.explanation}`,
              })

              const suspension: WorkflowSuspension = {
                workflow,
                pausedAtStepIndex: i,
                // Resume at the SAME step (not i+1) — the PTY acquire logic replays
                resumeAtStepIndex: i,
                pausedDuring: 'before_pty_acquire',
                overrides,
                stepResults: [...stepResults],
                task: { ...task },
                stepProgress: {
                  terminalPhase: 'acquiring',
                  completedPreparations: [],
                  ptySessionId: undefined,
                },
              }

              return {
                success: false,
                status: 'paused',
                task,
                stepResults,
                summary: buildWorkflowSummary(workflow, task, stepResults),
                suspension,
              }
            }

            if (!acquireResult.acquired || !acquireResult.ptySessionId) {
              // Acquisition failed non-recoverably
              const errorMsg = acquireResult.error ?? 'PTY acquisition failed'
              stateManager.completeCurrentStep('failure', errorMsg)
              stateManager.finishTask('failed')
              stepResults.push({
                step: resolvedStep,
                advisories,
                succeeded: false,
                status: 'failure',
                explanation: `PTY acquisition failed: ${errorMsg}`,
              })
              return {
                success: false,
                status: 'failed',
                task,
                stepResults,
                summary: buildWorkflowSummary(workflow, task, stepResults),
              }
            }

            ptySessionId = acquireResult.ptySessionId
          }

          // PTY acquired — record surface decision + binding
          stateManager.recordSurfaceDecision({
            surface: 'pty',
            transport: 'pty',
            reason: surfaceResolution.explanation,
            source: `surface_resolver:${surfaceResolution.reason}`,
          })
          stateManager.addStepTerminalBinding({
            taskId: task.id,
            stepId: taskStep.stepId,
            surface: 'pty',
            ptySessionId,
          })
          if (!surfaceResolution.boundPtySessionId) {
            stateManager.bindPtySessionToStepId(ptySessionId, taskStep.stepId)
          }

          // Execute the command on the PTY by sending it + reading the result
          // For one_shot commands we send, wait, and read screen
          // For persistent commands we just bind — subsequent explicit PTY steps handle interaction
          if (terminalConfig.interaction === 'one_shot') {
            const ptyExecResult = await executePtyCommand({
              ptySessionId,
              command: action.input.command as string,
              executePrepTool,
            })

            if (ptyExecResult.succeeded) {
              stateManager.completeCurrentStep('success')
              taskStep.outcome = 'success'
              taskStep.finishedAt = new Date().toISOString()
              stepResults.push({
                step: resolvedStep,
                advisories,
                succeeded: true,
                status: 'success',
                explanation: `Ran on PTY ${ptySessionId}: ${ptyExecResult.explanation}`,
              })
              continue
            }
            else {
              stateManager.completeCurrentStep('failure', ptyExecResult.explanation)
              stepResults.push({
                step: resolvedStep,
                advisories,
                succeeded: false,
                status: 'failure',
                explanation: `PTY command failed: ${ptyExecResult.explanation}`,
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
              step: resolvedStep,
              advisories,
              succeeded: true,
              status: 'success',
              explanation: `PTY ${ptySessionId} bound for persistent interaction.`,
            })
            continue
          }
        }

        // Fallback: no acquirePty callback — use legacy outward reroute (v1 path)
        const ptyRerouteAdvisory = executionAdvisories.find(a => a.kind === 'use_pty_surface')
        const existingBinding = stateManager.getStepTerminalBinding(task.id, taskStep.stepId)
        const boundPtySessionId = existingBinding?.ptySessionId ?? stateManager.getActivePtySessionId()

        stateManager.recordSurfaceDecision({
          surface: 'pty',
          transport: 'pty',
          reason: surfaceResolution.explanation,
          source: 'surface_resolver_legacy_reroute',
        })
        stateManager.addStepTerminalBinding({
          taskId: task.id,
          stepId: taskStep.stepId,
          surface: 'pty',
          ...(boundPtySessionId ? { ptySessionId: boundPtySessionId } : {}),
        })

        stateManager.completeCurrentStep('reroute_required', `Reroute to PTY: ${surfaceResolution.explanation}`)
        taskStep.outcome = 'reroute_required'
        taskStep.finishedAt = new Date().toISOString()
        stateManager.finishTask('reroute_required')
        stepResults.push({
          step: resolvedStep,
          advisories,
          succeeded: false,
          status: 'reroute_required',
          explanation: `exec → pty reroute: ${surfaceResolution.explanation}`,
        })

        return {
          success: false,
          status: 'reroute_required',
          task,
          stepResults,
          summary: buildWorkflowSummary(workflow, task, stepResults),
          rerouteAdvisory: ptyRerouteAdvisory ?? {
            kind: 'use_pty_surface',
            category: 'reroute',
            recommendedSurface: 'pty',
            reason: surfaceResolution.explanation,
            suggestedToolName: 'pty_read_screen',
          },
        }
      }

      // exec surface — record and continue to normal exec below
      stateManager.recordSurfaceDecision({
        surface: 'exec',
        transport: 'exec',
        reason: surfaceResolution.explanation,
        source: `surface_resolver:${surfaceResolution.reason}`,
      })
      stateManager.addStepTerminalBinding({
        taskId: task.id,
        stepId: taskStep.stepId,
        surface: 'exec',
      })
    }

    const preparatoryResults: PreparatoryResult[] = []

    const actionPrepAdvisories = advisories.filter(adv => adv.suggestedAction && !PREP_TOOL_POLICY[adv.kind])
    if (actionPrepAdvisories.length > 0) {
      const prepOutcome = await executeActionPreparations({
        advisories: actionPrepAdvisories,
        executeAction,
        workflow,
        resolvedStep,
        stepIndex: i,
        task,
        taskStep,
        stepResults,
        stateManager,
        overrides,
        autoApproveSteps: autoApproveSteps ?? false,
        existingPreparatoryResults: preparatoryResults,
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
          step: resolvedStep,
          advisories,
          succeeded: false,
          status: 'failure',
          explanation: `Aborted: ${postActionAbortAdvisory.reason}`,
          preparatoryResults,
        })
        return {
          success: false,
          status: 'failed',
          task,
          stepResults,
          summary: buildWorkflowSummary(workflow, task, stepResults),
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

    let prepFailure: { toolName: string, message: string } | undefined
    let rerouteTriggered = false
    let rerouteAdvisory: StrategyAdvisory | undefined

    for (const prepAdv of prepAdvisories) {
      const policy = PREP_TOOL_POLICY[prepAdv.kind]!
      const prepToolName = prepAdv.suggestedToolName ?? `prep_${prepAdv.kind}`

      // advisory_only: log it but don't invoke
      if (policy.retryability === 'advisory_only') {
        preparatoryResults.push({
          toolName: prepToolName,
          succeeded: true,
          metadata: { advisory_only: true },
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
            skipApprovalQueue: autoApproveSteps ?? false,
            retry: true,
          })
        }

        if (prepResult.isError === true) {
          const errorMessage = extractErrorMessage(prepResult)
          preparatoryResults.push({
            toolName: prepToolName,
            succeeded: false,
            error: errorMessage,
            metadata: extractPrepMetadata(prepToolName, prepResult),
          })
          prepFailure = {
            toolName: prepToolName,
            message: errorMessage,
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
          toolName: prepToolName,
          succeeded: true,
          metadata: extractPrepMetadata(prepToolName, prepResult),
        })

        if (policy.outcomeOnSuccess === 'reroute') {
          rerouteTriggered = true
          rerouteAdvisory = prepAdv
          break
        }
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        preparatoryResults.push({
          toolName: prepToolName,
          succeeded: false,
          error: errorMessage,
        })
        prepFailure = {
          toolName: prepToolName,
          message: errorMessage,
        }
        break
      }
    }

    if (prepFailure) {
      const failureExplanation = `Preparatory tool "${prepFailure.toolName}" failed: ${prepFailure.message}`

      stateManager.completeCurrentStep('failure', failureExplanation)
      stateManager.finishTask('failed')
      stepResults.push({
        step: resolvedStep,
        advisories,
        succeeded: false,
        status: 'failure',
        explanation: failureExplanation,
        preparatoryResults,
      })

      return {
        success: false,
        status: 'failed',
        task,
        stepResults,
        summary: buildWorkflowSummary(workflow, task, stepResults),
      }
    }

    // If reroute was triggered, stop the workflow and return.
    if (rerouteTriggered && rerouteAdvisory) {
      stateManager.completeCurrentStep('reroute_required', `Reroute to ${rerouteAdvisory.recommendedSurface}`)
      taskStep.outcome = 'reroute_required'
      taskStep.finishedAt = new Date().toISOString()
      stateManager.finishTask('reroute_required')
      stepResults.push({
        step: resolvedStep,
        advisories,
        succeeded: false,
        status: 'reroute_required',
        explanation: `Reroute required: ${rerouteAdvisory.reason}`,
        preparatoryResults,
      })

      return {
        success: false,
        status: 'reroute_required',
        task,
        stepResults,
        summary: buildWorkflowSummary(workflow, task, stepResults),
        rerouteAdvisory,
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
          step: resolvedStep,
          toolResult: result,
          advisories,
          succeeded: false,
          status: 'pending_approval',
          explanation: `${intent} — Awaiting approval. ${explainNextStep(advisories, task)}`,
          preparatoryResults: preparatoryResults.length > 0 ? preparatoryResults : undefined,
        })
        // Build suspension so the workflow can be resumed after approval.
        const suspension: WorkflowSuspension = {
          workflow,
          pausedAtStepIndex: i,
          resumeAtStepIndex: i + 1,
          pausedDuring: 'main_action',
          overrides,
          stepResults: [...stepResults],
          task: { ...task },
        }
        return {
          success: false,
          status: 'paused' as WorkflowStatus,
          task,
          stepResults,
          summary: buildWorkflowSummary(workflow, task, stepResults),
          suspension,
        }
      }

      if (isError) {
        const errorMsg = extractErrorMessage(result)
        const recovery = buildRecoveryPlan({
          failedAction: action,
          errorMessage: errorMsg,
          state: stateManager.getState(),
        })

        stateManager.completeCurrentStep('failure', errorMsg)
        // NOTICE: completeCurrentStep already increments failureCount — do NOT double-count.
        stepResults.push({
          step: resolvedStep,
          toolResult: result,
          advisories: [...advisories, recovery],
          succeeded: false,
          status: 'failure',
          explanation: explainActionOutcome({
            action,
            succeeded: false,
            errorMessage: errorMsg,
            context: stateManager.getState().foregroundContext || { available: false, platform: process.platform as NodeJS.Platform },
          }),
          preparatoryResults: preparatoryResults.length > 0 ? preparatoryResults : undefined,
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
        step: resolvedStep,
        toolResult: result,
        advisories,
        succeeded: true,
        status: 'success',
        explanation: explainActionOutcome({
          action,
          succeeded: true,
          context: stateManager.getState().foregroundContext || { available: false, platform: process.platform as NodeJS.Platform },
        }),
        preparatoryResults: preparatoryResults.length > 0 ? preparatoryResults : undefined,
      })
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      stateManager.completeCurrentStep('failure', errorMsg)
      // NOTICE: completeCurrentStep already increments failureCount — do NOT double-count.
      stepResults.push({
        step: resolvedStep,
        advisories,
        succeeded: false,
        status: 'failure',
        explanation: `Unexpected error: ${errorMsg}`,
        preparatoryResults: preparatoryResults.length > 0 ? preparatoryResults : undefined,
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
    success: allCompleted && !wasAborted,
    status,
    task,
    stepResults,
    summary,
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
  suspension: WorkflowSuspension
  executeAction: ExecuteAction
  executePrepTool?: ExecutePrepTool
  stateManager: RunStateManager
  refreshState?: () => Promise<void>
  /** Whether the pending step's approval was granted. Default: true. */
  approved?: boolean
  /** Skip per-step approval for remaining steps. Default: false. */
  autoApproveSteps?: boolean
  acquirePty?: AcquirePtyForStep
}): Promise<WorkflowExecutionResult> {
  const { suspension, executeAction, executePrepTool, stateManager, refreshState, approved = true, autoApproveSteps, acquirePty } = params

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
      success: false,
      status: 'failed' as WorkflowStatus,
      task: suspension.task,
      stepResults: suspension.stepResults,
      summary: buildWorkflowSummary(suspension.workflow, suspension.task, suspension.stepResults),
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
    workflow: suspension.workflow,
    executeAction,
    executePrepTool,
    stateManager,
    refreshState,
    overrides: suspension.overrides,
    autoApproveSteps,
    acquirePty,
    _resume: {
      startIndex: suspension.resumeAtStepIndex,
      previousResults,
      existingTask: suspension.task,
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute a PTY step family operation within the workflow engine.
 * Resolves the bound PTY session from state and drives the operation
 * through the standard tool pipeline.
 */
async function executePtyStepFamily(params: {
  step: WorkflowStepTemplate
  task: ActiveTask
  taskStep: TaskStep
  stateManager: RunStateManager
  executePrepTool?: ExecutePrepTool
}): Promise<{ succeeded: boolean, explanation: string }> {
  const { step, task, taskStep, stateManager, executePrepTool } = params

  if (!executePrepTool) {
    return { succeeded: false, explanation: 'No executePrepTool callback — cannot execute PTY step family.' }
  }

  // Find the PTY session bound to this step (or the most recent active session)
  const binding = stateManager.getStepTerminalBinding(task.id, taskStep.stepId)
  const ptySessionId = binding?.ptySessionId
    ?? (step.params.sessionId as string | undefined)
    ?? stateManager.getActivePtySessionId()

  if (!ptySessionId && step.kind !== 'pty_destroy_session') {
    return { succeeded: false, explanation: 'No PTY session id available for this step.' }
  }

  try {
    switch (step.kind) {
      case 'pty_send_input': {
        const data = step.params.data as string
        if (!data) {
          return { succeeded: false, explanation: 'pty_send_input requires a "data" param.' }
        }
        const result = await executePrepTool(`pty_send_input:${ptySessionId}:${data}`)
        if (result.isError === true) {
          return { succeeded: false, explanation: `pty_send_input failed: ${extractErrorMessage(result)}` }
        }
        return { succeeded: true, explanation: `Sent ${data.length} bytes to PTY ${ptySessionId}.` }
      }

      case 'pty_read_screen': {
        const result = await executePrepTool(`pty_read_screen:${ptySessionId}`)
        if (result.isError === true) {
          return { succeeded: false, explanation: `pty_read_screen failed: ${extractErrorMessage(result)}` }
        }
        return { succeeded: true, explanation: `Read screen from PTY ${ptySessionId}.` }
      }

      case 'pty_wait_for_output': {
        const marker = step.params.marker as string
        const timeoutMs = (step.params.timeoutMs as number) ?? 10_000
        if (!marker) {
          return { succeeded: false, explanation: 'pty_wait_for_output requires a "marker" param.' }
        }
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
          const result = await executePrepTool(`pty_read_screen:${ptySessionId}`)
          if (result.isError !== true) {
            const structured = toRecord(result.structuredContent)
            const content = typeof structured?.screenContent === 'string' ? structured.screenContent : ''
            if (content.includes(marker)) {
              return { succeeded: true, explanation: `Marker "${marker}" found in PTY ${ptySessionId}.` }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 250))
        }
        return { succeeded: false, explanation: `Timeout waiting for marker "${marker}" in PTY ${ptySessionId}.` }
      }

      case 'pty_destroy_session': {
        const targetId = ptySessionId ?? (step.params.sessionId as string)
        if (!targetId) {
          return { succeeded: false, explanation: 'pty_destroy_session requires a session id.' }
        }
        const result = await executePrepTool(`pty_destroy:${targetId}`)
        if (result.isError === true) {
          return { succeeded: false, explanation: `pty_destroy failed: ${extractErrorMessage(result)}` }
        }
        return { succeeded: true, explanation: `Destroyed PTY session ${targetId}.` }
      }

      default:
        return { succeeded: false, explanation: `Unknown PTY step kind: ${step.kind}` }
    }
  }
  catch (error) {
    return { succeeded: false, explanation: `PTY step error: ${error instanceof Error ? error.message : String(error)}` }
  }
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
  ptySessionId: string
  command: string
  executePrepTool?: ExecutePrepTool
}): Promise<{ succeeded: boolean, explanation: string, screenContent?: string }> {
  const { ptySessionId, command, executePrepTool } = params

  if (!executePrepTool) {
    return {
      succeeded: false,
      explanation: 'No executePrepTool callback available for PTY command execution.',
    }
  }

  try {
    // Send the command with a trailing carriage return
    const sendResult = await executePrepTool(`pty_send_input:${ptySessionId}:${command}`)
    if (sendResult.isError === true) {
      return {
        succeeded: false,
        explanation: `PTY send_input failed: ${extractErrorMessage(sendResult)}`,
      }
    }

    // Brief pause for command execution
    await new Promise(resolve => setTimeout(resolve, 500))

    // Read the screen
    const readResult = await executePrepTool(`pty_read_screen:${ptySessionId}`)
    if (readResult.isError === true) {
      return {
        succeeded: false,
        explanation: `PTY read_screen failed: ${extractErrorMessage(readResult)}`,
      }
    }

    const structured = toRecord(readResult.structuredContent)
    const screenContent = typeof structured?.screenContent === 'string'
      ? structured.screenContent
      : undefined

    return {
      succeeded: true,
      explanation: `Command sent to PTY ${ptySessionId}`,
      screenContent,
    }
  }
  catch (error) {
    return {
      succeeded: false,
      explanation: `PTY command execution error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function extractErrorMessage(result: CallToolResult): string {
  const textParts = (result.content ?? [])
    .filter((c): c is { type: 'text', text: string } => c.type === 'text')
    .map(c => c.text)
  return textParts.join(' ') || 'Unknown error'
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
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

  return { x, y, width, height }
}

function extractPrepMetadata(toolName: string, result: CallToolResult): Record<string, unknown> | undefined {
  const structured = toRecord(result.structuredContent)

  if (!structured) {
    return undefined
  }

  switch (toolName) {
    case 'display_enumerate':
      return {
        status: structured.status,
        displayCount: structured.displayCount,
        combinedBounds: structured.combinedBounds,
        capturedAt: structured.capturedAt,
      }
    case 'accessibility_snapshot':
      return {
        status: structured.status,
        appName: structured.appName,
        pid: structured.pid,
        nodeCount: structured.nodeCount,
        capturedAt: structured.capturedAt,
      }
    case 'browser_cdp_collect_elements':
      return {
        status: structured.status,
        elementCount: structured.elementCount,
        page: structured.page,
      }
    case 'browser_dom_read_page':
      return {
        status: structured.status,
        frameCount: structured.frameCount,
        interactiveElementCount: structured.interactiveElementCount,
        bridge: structured.bridge,
      }
    case 'pty_read_screen':
      return {
        status: structured.status,
        sessionId: structured.sessionId,
        alive: structured.alive,
        rows: structured.rows,
        cols: structured.cols,
        executionReason: structured.executionReason,
      }
    default:
      return typeof structured.status === 'string'
        ? { status: structured.status }
        : undefined
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
        displayId: record.displayId,
        isMain: record.isMain,
        isBuiltIn: record.isBuiltIn,
        bounds,
        visibleBounds,
        scaleFactor: record.scaleFactor,
        pixelWidth: record.pixelWidth,
        pixelHeight: record.pixelHeight,
      }
    })
    .filter((display): display is NonNullable<DisplayInfo['displays']>[number] => Boolean(display))

  const primaryDisplay = displays.find(display => display.isMain) ?? displays[0]
  const displayCount = typeof structured.displayCount === 'number' ? structured.displayCount : displays.length

  return {
    available: true,
    platform: process.platform as NodeJS.Platform,
    logicalWidth: combinedBounds?.width,
    logicalHeight: combinedBounds?.height,
    pixelWidth: primaryDisplay?.pixelWidth,
    pixelHeight: primaryDisplay?.pixelHeight,
    scaleFactor: primaryDisplay?.scaleFactor,
    isRetina: typeof primaryDisplay?.scaleFactor === 'number' ? primaryDisplay.scaleFactor > 1 : undefined,
    displayCount,
    displays,
    combinedBounds,
    capturedAt: typeof structured.capturedAt === 'string' ? structured.capturedAt : undefined,
    note: displayCount > 1 ? 'display geometry captured from workflow prep enumeration' : undefined,
  }
}

async function invokePreparatoryExecution(params: {
  advisory: StrategyAdvisory
  executeAction: ExecuteAction
  executePrepTool?: ExecutePrepTool
  skipApprovalQueue: boolean
  retry?: boolean
}): Promise<CallToolResult> {
  const { advisory, executeAction, executePrepTool, skipApprovalQueue, retry = false } = params

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

async function executeActionPreparations(params: {
  advisories: StrategyAdvisory[]
  executeAction: ExecuteAction
  workflow: WorkflowDefinition
  resolvedStep: WorkflowStepTemplate
  stepIndex: number
  task: ActiveTask
  taskStep: TaskStep
  stepResults: WorkflowStepResult[]
  stateManager: RunStateManager
  overrides?: Record<string, unknown>
  autoApproveSteps: boolean
  existingPreparatoryResults: PreparatoryResult[]
}): Promise<WorkflowExecutionResult | undefined> {
  const {
    advisories,
    executeAction,
    workflow,
    resolvedStep,
    stepIndex,
    task,
    taskStep,
    stepResults,
    stateManager,
    overrides,
    autoApproveSteps,
    existingPreparatoryResults,
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
          toolName: prepToolName,
          succeeded: false,
          metadata: {
            advisoryKind: advisory.kind,
            actionKind: action.kind,
            status: 'approval_required',
          },
        })

        stateManager.updateTaskPhase('awaiting_approval')
        stateManager.completeCurrentStep('pending_approval', `Preparatory action "${action.kind}" is awaiting approval`)
        taskStep.outcome = 'pending_approval'
        taskStep.finishedAt = new Date().toISOString()

        stepResults.push({
          step: resolvedStep,
          toolResult: result,
          advisories,
          succeeded: false,
          status: 'pending_approval',
          explanation: `Preparatory action "${action.kind}" is awaiting approval before continuing this step.`,
          preparatoryResults: [...existingPreparatoryResults],
        })

        const suspension: WorkflowSuspension = {
          workflow,
          pausedAtStepIndex: stepIndex,
          resumeAtStepIndex: stepIndex,
          pausedDuring: 'action_prep',
          overrides,
          stepResults: [...stepResults],
          task: { ...task },
        }

        return {
          success: false,
          status: 'paused',
          task,
          stepResults,
          summary: buildWorkflowSummary(workflow, task, stepResults),
          suspension,
        }
      }

      if (result.isError === true) {
        const errorMessage = extractErrorMessage(result)
        existingPreparatoryResults.push({
          toolName: prepToolName,
          succeeded: false,
          error: errorMessage,
          metadata: {
            advisoryKind: advisory.kind,
            actionKind: action.kind,
          },
        })

        const explanation = `Preparatory action "${action.kind}" failed: ${errorMessage}`
        stateManager.completeCurrentStep('failure', explanation)
        stateManager.finishTask('failed')
        stepResults.push({
          step: resolvedStep,
          toolResult: result,
          advisories,
          succeeded: false,
          status: 'failure',
          explanation,
          preparatoryResults: [...existingPreparatoryResults],
        })

        return {
          success: false,
          status: 'failed',
          task,
          stepResults,
          summary: buildWorkflowSummary(workflow, task, stepResults),
        }
      }

      existingPreparatoryResults.push({
        toolName: prepToolName,
        succeeded: true,
        metadata: {
          advisoryKind: advisory.kind,
          actionKind: action.kind,
          status: typeof structured?.status === 'string' ? structured.status : 'executed',
        },
      })
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      existingPreparatoryResults.push({
        toolName: prepToolName,
        succeeded: false,
        error: errorMessage,
        metadata: {
          advisoryKind: advisory.kind,
          actionKind: action.kind,
        },
      })

      const explanation = `Preparatory action "${action.kind}" failed: ${errorMessage}`
      stateManager.completeCurrentStep('failure', explanation)
      stateManager.finishTask('failed')
      stepResults.push({
        step: resolvedStep,
        advisories,
        succeeded: false,
        status: 'failure',
        explanation,
        preparatoryResults: [...existingPreparatoryResults],
      })

      return {
        success: false,
        status: 'failed',
        task,
        stepResults,
        summary: buildWorkflowSummary(workflow, task, stepResults),
      }
    }
  }

  return undefined
}
