/**
 * Completion guard — runtime enforcement of task completion criteria.
 *
 * Instead of exiting the loop on "N consecutive text-only rounds",
 * this module checks whether the task's required completion signals
 * have been satisfied. If not, it returns a task-specific nudge.
 *
 * This is the second line of defense after the task state machine.
 * The state machine tracks what happened; this module decides whether
 * it's enough to call the task done.
 */

import type { TaskState } from './task-discipline'

export interface CompletionVerdict {
  /** Whether the task is allowed to finalize */
  canFinalize: boolean
  /** If canFinalize is false, the nudge message to inject */
  nudge: string | null
}

/**
 * Evaluate whether the current TaskState satisfies the completion criteria
 * for its task kind.
 *
 * @param state - Current task state
 * @param filesModifiedCount - Number of files modified so far
 * @param turnsUsed - Number of turns used
 * @param maxTurns - Maximum turns allowed
 */
export function evaluateCompletionGuard(
  state: TaskState,
  filesModifiedCount: number,
  turnsUsed: number,
  maxTurns: number,
): CompletionVerdict {
  // NOTICE: No budget-based bypass. If completion criteria aren't met,
  // the engine will keep nudging until budget_exhausted. That status
  // honestly reflects reality: the task wasn't completed.

  switch (state.taskKind) {
    case 'analysis_report':
      return evaluateAnalysisReport(state)
    case 'existing_file_edit':
      return evaluateExistingFileEdit(state, filesModifiedCount)
    case 'verification_heavy':
      return evaluateVerificationHeavy(state)
    case 'general_fix':
      return evaluateGeneralFix(state, filesModifiedCount)
  }
}

function evaluateAnalysisReport(state: TaskState): CompletionVerdict {
  if (!state.reportWritten) {
    return {
      canFinalize: false,
      nudge: '[System] TASK INCOMPLETE: You have not written a report file yet. '
        + 'Call write_file to create a report (e.g., report.md or analysis.md) '
        + 'with your findings. Do NOT finalize without producing a deliverable.',
    }
  }

  if (!state.readBackDone) {
    return {
      canFinalize: false,
      nudge: `[System] TASK INCOMPLETE: You wrote a report (${state.reportPath}) but did not read it back. `
        + `Call read_file on "${state.reportPath}" to verify its contents before finalizing.`,
    }
  }

  return { canFinalize: true, nudge: null }
}

function evaluateExistingFileEdit(state: TaskState, filesModifiedCount: number): CompletionVerdict {
  if (!state.existingFileEdited && filesModifiedCount === 0) {
    return {
      canFinalize: false,
      nudge: '[System] TASK INCOMPLETE: You have not edited any files yet. '
        + 'Call edit_file or multi_edit_file to make the required changes. '
        + 'Do NOT finalize without modifying the target file(s).',
    }
  }

  if (!state.readBackDone) {
    return {
      canFinalize: false,
      nudge: '[System] TASK INCOMPLETE: You edited files but did not read them back to verify. '
        + 'Call read_file on the files you modified to confirm correctness before finalizing.',
    }
  }

  return { canFinalize: true, nudge: null }
}

function evaluateVerificationHeavy(state: TaskState): CompletionVerdict {
  if (!state.verificationAttempted && !state.verificationSkipReason) {
    return {
      canFinalize: false,
      nudge: '[System] TASK INCOMPLETE: You have not run any verification yet. '
        + 'Call bash with a test/typecheck/lint command to verify the codebase state. '
        + 'Do NOT finalize without verifying.',
    }
  }

  return { canFinalize: true, nudge: null }
}

function evaluateGeneralFix(state: TaskState, filesModifiedCount: number): CompletionVerdict {
  // General fix is the loosest — just require at least one file modified
  if (filesModifiedCount === 0) {
    return {
      canFinalize: false,
      nudge: '[System] TASK INCOMPLETE: You have not modified any files yet. '
        + 'Call edit_file, multi_edit_file, or write_file to make changes. '
        + 'If this task is investigation-only, provide your findings as text.',
    }
  }

  return { canFinalize: true, nudge: null }
}
