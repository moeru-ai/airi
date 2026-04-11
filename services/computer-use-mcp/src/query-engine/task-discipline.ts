/**
 * Task discipline — classify goals into task kinds and track runtime state.
 *
 * This module is the foundation for Phases 2-4: completion guard, bash penalty,
 * and per-task closing logic all read from TaskState.
 *
 * Design: TaskKind is determined once at the start of a run. TaskState is a
 * mutable bag of progress signals updated after every tool execution.
 */

// ─── Task Kind ───

export type TaskKind =
  | 'analysis_report'
  | 'existing_file_edit'
  | 'verification_heavy'
  | 'general_fix'

// ─── Task State ───

export interface TaskState {
  taskKind: TaskKind
  /** Current phase of the task lifecycle */
  phase: 'exploring' | 'target_locked' | 'editing' | 'verifying' | 'finalizing'
  /** Whether a specific target file has been identified */
  targetLocked: boolean
  /**
   * The primary file the agent has committed to editing.
   * For existing_file_edit: set when edit_file is called, or when read_file
   * is called on a file whose path appeared in the goal string.
   * null until a target is determined.
   */
  primaryTargetFile: string | null
  /** Path of the report file, if any */
  reportPath: string | null
  /** Whether an existing file was successfully edited */
  existingFileEdited: boolean
  /** Whether a report/analysis file was written */
  reportWritten: boolean
  /** Whether the agent read back its own output (report or edited file) */
  readBackDone: boolean
  /** Whether a verification step was attempted (bash test/typecheck/lint) */
  verificationAttempted: boolean
  /** Whether the verification passed */
  verificationPassed: boolean
  /** Explicit reason for skipping verification, if any */
  verificationSkipReason: string | null
  /** Count of consecutive bash calls that produced no progress */
  bashNoProgressCount: number
  /** Set of files that were actually edited (edit_file/multi_edit_file) */
  editedFiles: Set<string>
  /** The original goal string, used for target-lock heuristics */
  goalText: string
}

// ─── Classification ───

// NOTICE: Patterns are intentionally broad. The cost of misclassifying
// an analysis task as general_fix is low (slightly weaker completion guard),
// but misclassifying a general_fix as analysis_report would force unnecessary
// report writing. When in doubt, fall through to general_fix.

const ANALYSIS_PATTERNS = [
  /\b(?:analy[sz]e|report|summary|audit|inventory|catalog|find\s+unused|list\s+all|document)\b/i,
  /\bunused\s+export/i,
  /\bdead\s+code/i,
  /\bwrite\s+(?:a\s+)?report\b/i,
]

const EXISTING_FILE_EDIT_PATTERNS = [
  /\b(?:fix|patch|update|change|modify|rename|refactor|add\s+(?:jsdoc|docstring|comment|type))\b/i,
  /\b(?:in-place|inline)\b/i,
  /\bedit\s+(?:the\s+)?file\b/i,
  /\b(?:replace|swap|migrate)\b/i,
]

const VERIFICATION_HEAVY_PATTERNS = [
  /\b(?:run\s+tests?|typecheck|type-check|verify|validate|lint|check\s+(?:that|if|whether))\b/i,
  /\b(?:make\s+(?:sure|certain)|confirm|ensure)\b/i,
  /\btsc\b/i,
  /\bvitest\b/i,
]

/**
 * Classify a goal string into a TaskKind.
 *
 * Priority order: analysis_report > verification_heavy > existing_file_edit > general_fix.
 * Analysis is checked first because "analyze and fix" should be treated as analysis,
 * while "fix and verify" is really existing_file_edit with verification.
 */
export function classifyTask(goal: string): TaskKind {
  // Analysis / report tasks are the most specific
  if (ANALYSIS_PATTERNS.some(p => p.test(goal))) {
    return 'analysis_report'
  }

  // Verification-heavy tasks: "run tests", "typecheck", "make sure X works"
  // Check before existing_file_edit because "fix X and verify" is edit, not verification-only
  if (VERIFICATION_HEAVY_PATTERNS.some(p => p.test(goal))) {
    // If the goal ALSO mentions editing, it's an edit task with verification needs
    if (EXISTING_FILE_EDIT_PATTERNS.some(p => p.test(goal))) {
      return 'existing_file_edit'
    }
    return 'verification_heavy'
  }

  // Existing file edit tasks
  if (EXISTING_FILE_EDIT_PATTERNS.some(p => p.test(goal))) {
    return 'existing_file_edit'
  }

  return 'general_fix'
}

// ─── State Factory ───

/**
 * Create a fresh TaskState for a given TaskKind.
 */
export function createTaskState(taskKind: TaskKind, goalText = ''): TaskState {
  return {
    taskKind,
    phase: 'exploring',
    targetLocked: false,
    primaryTargetFile: null,
    reportPath: null,
    existingFileEdited: false,
    reportWritten: false,
    readBackDone: false,
    verificationAttempted: false,
    verificationPassed: false,
    verificationSkipReason: null,
    bashNoProgressCount: 0,
    editedFiles: new Set(),
    goalText,
  }
}

// ─── State Transitions ───

/**
 * Update TaskState based on a completed tool call.
 *
 * This is called after each tool execution. It inspects the tool name,
 * arguments, and result to advance the state machine.
 */
export function updateTaskState(
  state: TaskState,
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: string,
  isError: boolean,
): void {
  if (isError) {
    return // Errors don't advance state
  }

  switch (toolName) {
    case 'read_file': {
      const filePath = toolArgs.file_path as string | undefined
      // readBackDone only when reading a file that was specifically edited or is the report
      if (filePath && state.reportPath && filePath.includes(state.reportPath)) {
        state.readBackDone = true
      }
      if (filePath && state.existingFileEdited && state.editedFiles.has(filePath)) {
        state.readBackDone = true
      }
      // Any read_file locks the target (original behavior for all task kinds).
      // NOTICE: The goal-based restriction was reverted because it broke S1/S4/S5
      // by keeping the agent in "exploring" phase forever.
      if (filePath && !state.targetLocked) {
        state.targetLocked = true
        state.primaryTargetFile = filePath
        if (state.phase === 'exploring') {
          state.phase = 'target_locked'
        }
      }
      break
    }

    case 'edit_file':
    case 'multi_edit_file': {
      const filePath = toolArgs.file_path as string | undefined
      state.existingFileEdited = true
      if (filePath) {
        state.editedFiles.add(filePath)
        // edit_file always locks the target (agent committed to a file)
        if (!state.targetLocked) {
          state.targetLocked = true
          state.primaryTargetFile = filePath
        }
      }
      state.phase = 'editing'
      break
    }

    case 'write_file': {
      const filePath = toolArgs.file_path as string | undefined
      if (filePath) {
        // Detect report writes for analysis tasks
        if (state.taskKind === 'analysis_report') {
          const lower = filePath.toLowerCase()
          if (lower.includes('report') || lower.includes('analysis') || lower.includes('unused') || lower.includes('summary') || lower.endsWith('.md') || lower.endsWith('.txt')) {
            state.reportWritten = true
            state.reportPath = filePath
            state.phase = 'finalizing'
          }
        }
        // NOTICE: write_file on non-analysis tasks does NOT set existingFileEdited.
        // Creating a new file is not the same as editing an existing one.
        // The existingFileEdited flag is only set by edit_file/multi_edit_file.
      }
      break
    }

    case 'bash': {
      const command = (toolArgs.command as string | undefined) ?? ''
      // Detect verification attempts
      if (isVerificationCommand(command)) {
        state.verificationAttempted = true
        state.phase = 'verifying'
        // Simple heuristic: if exit code 0 is in the result, it passed
        if (toolResult.includes('"exitCode": 0') || toolResult.includes('"exitCode":0')) {
          state.verificationPassed = true
        }
      }
      break
    }

    case 'search_text':
    case 'list_files': {
      // These are exploratory — don't advance phase beyond exploring/target_locked
      break
    }
  }
}

// ─── Helpers ───

/**
 * Detect if a bash command is a verification command (test, typecheck, lint).
 */
function isVerificationCommand(command: string): boolean {
  const cmd = command.trim().toLowerCase()
  return /\b(test|vitest|jest|mocha|pytest|cargo\s+test)\b/.test(cmd)
    || /\b(tsc|vue-tsc|typecheck|type-check)\b/.test(cmd)
    || /\b(lint|eslint|biome)\b/.test(cmd)
    || /\b(check|verify|validate)\b/.test(cmd)
    || /\bnpm\s+run\s+(test|check|lint|typecheck)\b/.test(cmd)
    || /\bpnpm\s+(?:-F\s+\S+\s+)?(?:exec\s+)?(?:run\s+)?(test|check|lint|typecheck)\b/.test(cmd)
}
