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
import type { WorkflowDefinition, WorkflowStepTemplate } from './types'

import process from 'node:process'

import { randomUUID } from 'node:crypto'

import { buildRecoveryPlan, evaluateStrategy } from '../strategy'
import {
  explainActionIntent,
  explainActionOutcome,
  explainNextStep,
  summarizeTaskProgress,
} from '../transparency'
import { resolveStepAction } from './types'

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
  overrides?: Record<string, unknown>
  stepResults: WorkflowStepResult[]
  task: ActiveTask
}

export interface WorkflowExecutionResult {
  /** Whether the workflow completed all steps successfully. */
  success: boolean
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
}

export interface WorkflowStepResult {
  step: WorkflowStepTemplate
  /** MCP tool result (undefined for non-action steps). */
  toolResult?: CallToolResult
  /** Strategy advisories evaluated before execution. */
  advisories: StrategyAdvisory[]
  /** Whether this step succeeded. */
  succeeded: boolean
  /** Explanation of what happened. */
  explanation: string
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export async function executeWorkflow(params: {
  workflow: WorkflowDefinition
  executeAction: ExecuteAction
  stateManager: RunStateManager
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
   * Internal: resume state from a previous suspension. Use `resumeWorkflow()`
   * instead of setting this directly.
   */
  _resume?: {
    startIndex: number
    previousResults: WorkflowStepResult[]
    existingTask: ActiveTask
  }
}): Promise<WorkflowExecutionResult> {
  const { workflow, executeAction, stateManager, overrides, autoApproveSteps } = params
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
        advisories: [{ kind: 'proceed', reason: 'Non-action step.' }],
        succeeded: true,
        explanation,
      })
      continue
    }

    // Evaluate strategy before execution.
    const state = stateManager.getState()
    const advisories = evaluateStrategy({
      proposedAction: action,
      state,
    })

    // Check for abort advisory.
    const abortAdvisory = advisories.find(a => a.kind === 'abort_task')
    if (abortAdvisory) {
      stateManager.completeCurrentStep('failure', abortAdvisory.reason)
      stateManager.finishTask('failed')
      stepResults.push({
        step: resolvedStep,
        advisories,
        succeeded: false,
        explanation: `Aborted: ${abortAdvisory.reason}`,
      })
      break
    }

    // Execute preparatory actions recommended by the strategy layer.
    for (const advisory of advisories) {
      if (advisory.suggestedAction) {
        const prepToolName = `strategy_${advisory.kind}`
        await executeAction(advisory.suggestedAction, prepToolName, {
          skipApprovalQueue: autoApproveSteps ?? false,
        })
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
          explanation: `${intent} — Awaiting approval. ${explainNextStep(advisories, task)}`,
        })
        // Build suspension so the workflow can be resumed after approval.
        const suspension: WorkflowSuspension = {
          workflow,
          pausedAtStepIndex: i,
          overrides,
          stepResults: [...stepResults],
          task: { ...task },
        }
        return {
          success: false,
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
        task.failureCount += 1
        stepResults.push({
          step: resolvedStep,
          toolResult: result,
          advisories: [...advisories, recovery],
          succeeded: false,
          explanation: explainActionOutcome({
            action,
            succeeded: false,
            errorMessage: errorMsg,
            context: stateManager.getState().foregroundContext || { available: false, platform: process.platform as NodeJS.Platform },
          }),
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
        explanation: explainActionOutcome({
          action,
          succeeded: true,
          context: stateManager.getState().foregroundContext || { available: false, platform: process.platform as NodeJS.Platform },
        }),
      })
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      stateManager.completeCurrentStep('failure', errorMsg)
      task.failureCount += 1
      stepResults.push({
        step: resolvedStep,
        advisories,
        succeeded: false,
        explanation: `Unexpected error: ${errorMsg}`,
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

  return {
    success: allCompleted && !wasAborted,
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
  stateManager: RunStateManager
  /** Whether the pending step's approval was granted. Default: true. */
  approved?: boolean
  /** Skip per-step approval for remaining steps. Default: false. */
  autoApproveSteps?: boolean
}): Promise<WorkflowExecutionResult> {
  const { suspension, executeAction, stateManager, approved = true, autoApproveSteps } = params

  // Update the paused step's outcome in the carried-over results.
  const pausedStep = suspension.task.steps[suspension.pausedAtStepIndex]
  if (pausedStep) {
    pausedStep.outcome = approved ? 'success' : 'rejected'
    pausedStep.finishedAt = new Date().toISOString()
  }
  // Also update the last step result's status.
  const lastResult = suspension.stepResults[suspension.stepResults.length - 1]
  if (lastResult) {
    lastResult.succeeded = approved
    lastResult.explanation = approved
      ? `${lastResult.explanation} (approved and executed)`
      : `${lastResult.explanation} (rejected)`
  }

  if (!approved) {
    stateManager.finishTask('failed')
    suspension.task.phase = 'failed'
    return {
      success: false,
      task: suspension.task,
      stepResults: suspension.stepResults,
      summary: buildWorkflowSummary(suspension.workflow, suspension.task, suspension.stepResults),
    }
  }

  // Continue from the step after the one that was paused.
  return executeWorkflow({
    workflow: suspension.workflow,
    executeAction,
    stateManager,
    overrides: suspension.overrides,
    autoApproveSteps,
    _resume: {
      startIndex: suspension.pausedAtStepIndex + 1,
      previousResults: suspension.stepResults,
      existingTask: suspension.task,
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractErrorMessage(result: CallToolResult): string {
  const textParts = (result.content ?? [])
    .filter((c): c is { type: 'text', text: string } => c.type === 'text')
    .map(c => c.text)
  return textParts.join(' ') || 'Unknown error'
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
