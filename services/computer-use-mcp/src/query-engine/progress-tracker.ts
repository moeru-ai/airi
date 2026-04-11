/**
 * Progress tracker — evaluates whether bash executions constitute progress
 * and manages the no-progress bash penalty system.
 */

import type { TaskState } from './task-discipline'

export interface BashProgressEvaluation {
  isProgress: boolean
  reason: string
}

/**
 * Determine if a bash execution yielded actual task progress.
 *
 * Progress is NOT:
 * - Running find/ls/grep/cat repeatedly
 * - Running tests that output exactly the same failure twice with no edits in between
 *
 * For now, we penalize pure discovery bash.
 */
export function evaluateBashProgress(
  stateBefore: TaskState,
  stateAfter: TaskState,
  command: string,
  resultSlot: string,
): BashProgressEvaluation {
  const isDiscovery = /\b(find|ls|grep|cat|ag|rg|tree)\b/i.test(command)
  
  // Rule 1: If it's a discovery bash, it's inherently weak.
  // It only counts as progress if it miraculously pushed the state machine forward
  // (which our parsing rarely does directly from bash).
  if (isDiscovery) {
    if (!stateBefore.targetLocked && stateAfter.targetLocked) {
      return { isProgress: true, reason: 'Discovery bash locked target' }
    }
    return { isProgress: false, reason: 'Discovery bash did not advance task state' }
  }

  // Rule 2: If we ran a verification command, we tentatively count it as progress
  // (Checking for "new conclusions" is hard without history mapping, so we assume progress)
  const isVerification = /\b(test|vitest|jest|mocha|pytest|cargo|tsc|vue-tsc|typecheck|lint|eslint|biome|check|verify|validate)\b/i.test(command)
  if (isVerification) {
    return { isProgress: true, reason: 'Verification executed' }
  }

  // Default: non-discovery bash is progress
  return { isProgress: true, reason: 'General mutating/executing bash' }
}

/**
 * Check if the penalty threshold for a strong nudge has been reached just now.
 */
export function shouldNudgeBashPenalty(state: TaskState): boolean {
  const threshold = (state.taskKind === 'existing_file_edit' || state.taskKind === 'analysis_report') ? 2 : 3
  return state.bashNoProgressCount === threshold
}

/**
 * Generate the strong penalty nudge string.
 */
export function getBashPenaltyNudge(): string {
  return '[System] BASH OVERUSE WARNING: You are issuing exploratory bash commands repeatedly without progressing the task (e.g., without locking target files or executing edits). Stop using bash to crawl files! Use `list_files`, `search_text`, and `read_file` instead. Make concrete progress in your next step or discovery bash will be rejected.'
}

/**
 * Check if we should outright reject any discovery bash because of too many penalties.
 */
export function shouldRejectBashDiscovery(state: TaskState): boolean {
  const threshold = (state.taskKind === 'existing_file_edit' || state.taskKind === 'analysis_report') ? 3 : 4
  return state.bashNoProgressCount >= threshold
}
