/**
 * Strategy layer — decision engine that sits between raw tool dispatch
 * and the action executor.
 *
 * Responsibilities:
 * 1. Prefer programmatic tools over vision when feasible.
 * 2. Auto-focus the correct app before UI interactions.
 * 3. Read terminal errors before deciding to retry / rollback.
 * 4. Handle approval rejection by suggesting an alternative plan.
 * 5. Detect and recover from common failure modes.
 */

import type { RunState } from './state'
import type {
  ActionInvocation,
  ForegroundContext,
} from './types'

// ---------------------------------------------------------------------------
// Advisory types
// ---------------------------------------------------------------------------

export type AdvisoryKind
  = | 'focus_app_first'
    | 'take_screenshot_first'
    | 'use_terminal_instead'
    | 'retry_after_error'
    | 'read_error_first'
    | 'abort_task'
    | 'approval_rejected_replan'
    | 'wait_and_retry'
    | 'proceed'

export interface StrategyAdvisory {
  /** What the strategy layer recommends. */
  kind: AdvisoryKind
  /** Human-readable explanation of why this advisory was emitted. */
  reason: string
  /**
   * If the advisory recommends a preparatory action, this is the
   * suggested action to execute first.
   */
  suggestedAction?: ActionInvocation
  /**
   * If the advisory recommends aborting, this is the accumulated
   * evidence (error messages, exit codes, etc.).
   */
  evidence?: string[]
}

// ---------------------------------------------------------------------------
// Strategy evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate the current run state and the proposed next action, returning
 * zero or more advisories that the orchestration layer should follow.
 *
 * The caller can decide to:
 * - Execute the suggested preparatory action before proceeding.
 * - Skip the proposed action entirely (abort / replan).
 * - Proceed as-is if the advisory is 'proceed'.
 */
export function evaluateStrategy(params: {
  proposedAction: ActionInvocation
  state: RunState
  /** Foreground context from the most recent probe (may be fresher than state). */
  freshContext?: ForegroundContext
}): StrategyAdvisory[] {
  const advisories: StrategyAdvisory[] = []
  const { proposedAction, state } = params
  const ctx = params.freshContext ?? state.foregroundContext

  // -----------------------------------------------------------------------
  // Rule 1: If the last approval was rejected, recommend replanning.
  // -----------------------------------------------------------------------
  if (state.lastApprovalRejected) {
    advisories.push({
      kind: 'approval_rejected_replan',
      reason: `The last action was rejected${state.lastRejectionReason ? `: ${state.lastRejectionReason}` : ''}. Consider an alternative approach.`,
      evidence: state.lastRejectionReason ? [state.lastRejectionReason] : [],
    })
  }

  // -----------------------------------------------------------------------
  // Rule 2: For UI-interaction actions, make sure the correct app is
  // focused before sending clicks / keystrokes / text.
  // -----------------------------------------------------------------------
  const uiActions = new Set<string>(['click', 'type_text', 'press_keys', 'scroll'])
  if (uiActions.has(proposedAction.kind) && ctx?.available) {
    // If there is an active task whose current step targets a specific app,
    // verify the foreground matches.
    const targetApp = inferTargetApp(state)
    if (targetApp && !isAppFocused(ctx, targetApp)) {
      advisories.push({
        kind: 'focus_app_first',
        reason: `Expected "${targetApp}" in foreground but found "${ctx.appName || 'unknown'}". Will focus the correct app first.`,
        suggestedAction: { kind: 'focus_app', input: { app: targetApp } },
      })
    }
  }

  // -----------------------------------------------------------------------
  // Rule 3: For mutation actions on remote targets, require a recent
  // screenshot so the model is operating on up-to-date visuals.
  // -----------------------------------------------------------------------
  if (
    isMutatingUiAction(proposedAction)
    && state.executionTarget?.mode === 'remote'
    && !state.lastScreenshot
  ) {
    advisories.push({
      kind: 'take_screenshot_first',
      reason: 'No recent screenshot available for the remote desktop. Capture one before mutating.',
      suggestedAction: { kind: 'screenshot', input: {} },
    })
  }

  // -----------------------------------------------------------------------
  // Rule 4: If the last terminal command failed, advise reading the
  // error output before blindly retrying.
  // -----------------------------------------------------------------------
  if (
    proposedAction.kind === 'terminal_exec'
    && state.lastTerminalResult
    && state.lastTerminalResult.exitCode !== 0
  ) {
    const hasUnreadError = state.lastTerminalResult.stderr.length > 0
    if (hasUnreadError) {
      advisories.push({
        kind: 'read_error_first',
        reason: `The previous command exited with code ${state.lastTerminalResult.exitCode}. Review the error output before running another command.`,
        evidence: [
          `exit_code=${state.lastTerminalResult.exitCode}`,
          `stderr_preview=${state.lastTerminalResult.stderr.slice(0, 300)}`,
        ],
      })
    }
  }

  // -----------------------------------------------------------------------
  // Rule 5: If the active task has hit too many consecutive failures,
  // recommend aborting.
  // -----------------------------------------------------------------------
  if (state.activeTask && state.activeTask.failureCount >= state.activeTask.maxConsecutiveFailures) {
    advisories.push({
      kind: 'abort_task',
      reason: `Task "${state.activeTask.goal}" has accumulated ${state.activeTask.failureCount} failures (max ${state.activeTask.maxConsecutiveFailures}). Aborting to prevent damage.`,
      evidence: state.activeTask.steps
        .filter(s => s.outcome === 'failure')
        .map(s => `Step ${s.index}: ${s.label} — ${s.outcomeReason || 'unknown error'}`),
    })
  }

  // -----------------------------------------------------------------------
  // Rule 6: Prefer terminal commands over visual interactions when the
  // information can be obtained programmatically.
  // -----------------------------------------------------------------------
  if (proposedAction.kind === 'screenshot' && canUseTerminalInstead(state)) {
    advisories.push({
      kind: 'use_terminal_instead',
      reason: 'The information you need may be available via a terminal command, which is faster and more reliable than a screenshot.',
    })
  }

  // -----------------------------------------------------------------------
  // Rule 7: If the runner is tainted, recommend a screenshot first.
  // -----------------------------------------------------------------------
  if (
    isMutatingUiAction(proposedAction)
    && state.executionTarget?.tainted
  ) {
    advisories.push({
      kind: 'take_screenshot_first',
      reason: 'The runner is tainted from a previous failure. Capture a fresh screenshot to restore it before proceeding.',
      suggestedAction: { kind: 'screenshot', input: {} },
    })
  }

  // If no advisories were emitted, it is safe to proceed.
  if (advisories.length === 0) {
    advisories.push({
      kind: 'proceed',
      reason: 'No pre-conditions violated. Safe to execute.',
    })
  }

  return advisories
}

/**
 * Produce a recovery plan after an action failure, based on the current
 * run state and the error that occurred.
 */
export function buildRecoveryPlan(params: {
  failedAction: ActionInvocation
  errorMessage: string
  state: RunState
}): StrategyAdvisory {
  const { failedAction, errorMessage, state } = params

  // Terminal failure -> suggest reading stderr and optionally retrying.
  if (failedAction.kind === 'terminal_exec') {
    if (errorMessage.includes('timeout')) {
      return {
        kind: 'wait_and_retry',
        reason: 'The command timed out. Consider increasing the timeout or splitting the work.',
        evidence: [errorMessage],
      }
    }
    return {
      kind: 'read_error_first',
      reason: `Terminal command failed: ${errorMessage}. Inspect stderr/stdout before deciding next step.`,
      evidence: [
        errorMessage,
        ...(state.lastTerminalResult?.stderr ? [`stderr: ${state.lastTerminalResult.stderr.slice(0, 500)}`] : []),
      ],
    }
  }

  // UI action failure on wrong app -> suggest focusing.
  if (isMutatingUiAction(failedAction) && state.foregroundContext?.available) {
    const targetApp = inferTargetApp(state)
    if (targetApp && !isAppFocused(state.foregroundContext, targetApp)) {
      return {
        kind: 'focus_app_first',
        reason: `UI action failed because "${state.foregroundContext.appName}" is in front instead of "${targetApp}".`,
        suggestedAction: { kind: 'focus_app', input: { app: targetApp } },
        evidence: [errorMessage],
      }
    }
  }

  // Generic: suggest taking a screenshot to reassess.
  return {
    kind: 'take_screenshot_first',
    reason: `Action "${failedAction.kind}" failed: ${errorMessage}. Take a screenshot to reassess the current state.`,
    suggestedAction: { kind: 'screenshot', input: {} },
    evidence: [errorMessage],
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMutatingUiAction(action: ActionInvocation): boolean {
  return ['click', 'type_text', 'press_keys', 'scroll', 'open_app', 'focus_app'].includes(action.kind)
}

function isAppFocused(ctx: ForegroundContext, targetApp: string): boolean {
  if (!ctx.available || !ctx.appName)
    return false
  return ctx.appName.toLowerCase().includes(targetApp.toLowerCase())
}

/**
 * Attempt to infer which app the current task step expects to be in front.
 * Returns undefined if no inference is possible.
 */
function inferTargetApp(state: RunState): string | undefined {
  if (!state.activeTask)
    return undefined
  const step = state.activeTask.steps[state.activeTask.currentStepIndex]
  if (!step)
    return undefined

  // If the step label mentions a known app, use that.
  const knownApps = ['Terminal', 'Cursor', 'VSCode', 'Google Chrome', 'Safari', 'Firefox']
  for (const app of knownApps) {
    if (step.label.toLowerCase().includes(app.toLowerCase())) {
      return app
    }
  }
  return undefined
}

/**
 * Heuristic: can the proposed observation be satisfied via a terminal
 * command instead of a screenshot?
 */
function canUseTerminalInstead(state: RunState): boolean {
  // If the terminal is healthy (last command succeeded or no command yet),
  // and we have an active task that is dev-oriented, prefer terminal.
  if (!state.activeTask)
    return false

  const devWorkflows = ['dev_run_tests', 'dev_inspect_failure']
  return devWorkflows.includes(state.activeTask.workflowId || '')
}

/**
 * Summarize the strategy advisory list into a user-friendly string for
 * inclusion in MCP responses.
 */
export function summarizeAdvisories(advisories: StrategyAdvisory[]): string {
  if (advisories.length === 1 && advisories[0].kind === 'proceed') {
    return ''
  }

  return advisories
    .filter(a => a.kind !== 'proceed')
    .map(a => `[${a.kind}] ${a.reason}`)
    .join(' | ')
}
