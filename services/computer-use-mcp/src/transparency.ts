/**
 * Transparency layer — human-readable explanations for every action,
 * approval, failure, and next-step decision.
 *
 * The goal is that a non-technical user watching the MCP stream can
 * always understand:
 *   1. Why the system wants to do something.
 *   2. What it just did.
 *   3. Whether it succeeded or failed, and the evidence.
 *   4. What it plans to do next.
 */

import type { ActiveTask, RunState } from './state'
import type { StrategyAdvisory } from './strategy'
import type {
  ActionInvocation,
  ForegroundContext,
  PolicyDecision,
  TerminalCommandResult,
} from './types'

// ---------------------------------------------------------------------------
// Action explanations — before execution
// ---------------------------------------------------------------------------

/**
 * Explain why an action is about to be performed, in plain language.
 */
export function explainActionIntent(action: ActionInvocation, runState: RunState): string {
  const taskContext = runState.activeTask
    ? ` as part of task "${runState.activeTask.goal}" (step ${runState.activeTask.currentStepIndex + 1}/${runState.activeTask.steps.length})`
    : ''

  switch (action.kind) {
    case 'screenshot':
      return `Taking a screenshot to observe the current state of the desktop${taskContext}.`
    case 'observe_windows':
      return `Listing visible windows to understand what applications are open${taskContext}.`
    case 'open_app':
      return `Opening "${action.input.app}" because the task requires this application${taskContext}.`
    case 'focus_app':
      return `Bringing "${action.input.app}" to the foreground so we can interact with it${taskContext}.`
    case 'secret_read_env_value':
      return `Reading specific secret keys from env file "${action.input.filePath}" so the task can reuse a configured value without dumping the whole file${taskContext}.`
    case 'clipboard_read_text':
      return `Reading the system clipboard so the task can reuse a copied value across apps${taskContext}.`
    case 'clipboard_write_text':
      return `Writing text into the system clipboard so it can be pasted into another app${taskContext}.`
    case 'click':
      return `Clicking at (${action.input.x}, ${action.input.y}) to interact with the UI element at that position${taskContext}.`
    case 'type_text':
      return `Typing text into the focused input field${action.input.x !== undefined ? ` at (${action.input.x}, ${action.input.y})` : ''}${taskContext}.`
    case 'press_keys':
      return `Pressing keyboard shortcut [${action.input.keys.join('+')}]${taskContext}.`
    case 'scroll':
      return `Scrolling ${action.input.deltaY > 0 ? 'down' : 'up'} to navigate the content${taskContext}.`
    case 'wait':
      return `Waiting ${action.input.durationMs}ms for the UI to settle${taskContext}.`
    case 'terminal_exec':
      return `Executing terminal command: \`${action.input.command.length > 80 ? `${action.input.command.slice(0, 77)}...` : action.input.command}\`${taskContext}.`
    case 'terminal_reset':
      return `Resetting the terminal state${action.input.reason ? ` (${action.input.reason})` : ''}${taskContext}.`
  }
}

// ---------------------------------------------------------------------------
// Approval explanations
// ---------------------------------------------------------------------------

/**
 * Explain why this action requires user approval.
 */
export function explainApprovalReason(
  action: ActionInvocation,
  decision: PolicyDecision,
  context: ForegroundContext,
): string {
  const parts: string[] = []

  if (decision.riskLevel === 'high') {
    parts.push(`This is a high-risk action (${action.kind})`)
  }
  else {
    parts.push(`This action (${action.kind}) requires approval`)
  }

  if (action.kind === 'terminal_exec') {
    parts.push('because terminal commands can modify files and system state')
  }
  else if (action.kind === 'open_app' || action.kind === 'focus_app') {
    const app = action.kind === 'open_app' ? action.input.app : action.input.app
    parts.push(`because opening/focusing "${app}" changes the desktop environment`)
  }
  else if (action.kind === 'type_text' && action.input.text.length > 160) {
    parts.push(`because a large text payload (${action.input.text.length} chars) is being typed`)
  }
  else if (action.kind === 'clipboard_read_text' || action.kind === 'clipboard_write_text') {
    parts.push('because clipboard contents may contain secrets or other sensitive values')
  }
  else if (action.kind === 'secret_read_env_value') {
    parts.push('because env files may contain secrets or other sensitive values')
  }

  if (context.available && context.appName) {
    parts.push(`while "${context.appName}" is in the foreground`)
  }

  if (decision.reasons.length > 0) {
    parts.push(`Policy notes: ${decision.reasons.join('; ')}`)
  }

  return `${parts.join('. ')}.`
}

// ---------------------------------------------------------------------------
// Outcome explanations — after execution
// ---------------------------------------------------------------------------

/**
 * Explain the outcome of an action in plain language.
 */
export function explainActionOutcome(params: {
  action: ActionInvocation
  succeeded: boolean
  errorMessage?: string
  terminalResult?: TerminalCommandResult
  context: ForegroundContext
}): string {
  const { action, succeeded, errorMessage, terminalResult, context } = params

  if (!succeeded) {
    return buildFailureExplanation(action, errorMessage || 'unknown error', context)
  }

  switch (action.kind) {
    case 'screenshot':
      return 'Screenshot captured successfully. The model can now analyze the current desktop state.'
    case 'observe_windows':
      return 'Window list retrieved. The model can now understand which applications are running.'
    case 'open_app':
      return `"${action.input.app}" has been opened. It should now be available for interaction.`
    case 'focus_app':
      return `"${action.input.app}" has been brought to the foreground.`
    case 'secret_read_env_value':
      return `Requested env keys were read successfully from "${action.input.filePath}".`
    case 'clipboard_read_text':
      return 'Clipboard text retrieved successfully.'
    case 'clipboard_write_text':
      return `Clipboard updated successfully (${action.input.text.length} characters).`
    case 'click':
      return `Clicked at (${action.input.x}, ${action.input.y}).${context.appName ? ` Target app: "${context.appName}".` : ''}`
    case 'type_text':
      return `Text typed successfully (${action.input.text.length} characters).${action.input.pressEnter ? ' Enter key pressed.' : ''}`
    case 'press_keys':
      return `Keyboard shortcut [${action.input.keys.join('+')}] executed.`
    case 'scroll':
      return `Scrolled ${action.input.deltaY > 0 ? 'down' : 'up'} by ${Math.abs(action.input.deltaY)}px.`
    case 'wait':
      return `Waited ${action.input.durationMs}ms. The UI should have settled.`
    case 'terminal_exec':
      return buildTerminalOutcomeExplanation(action, terminalResult)
    case 'terminal_reset':
      return 'Terminal state has been reset.'
  }
}

function buildFailureExplanation(
  action: ActionInvocation,
  error: string,
  context: ForegroundContext,
): string {
  const parts = [`Action "${action.kind}" failed: ${error}.`]

  if (context.available && context.appName) {
    parts.push(`Foreground app at time of failure: "${context.appName}".`)
  }

  // Provide targeted advice based on action type.
  switch (action.kind) {
    case 'click':
    case 'type_text':
    case 'press_keys':
    case 'scroll':
      parts.push('Consider taking a screenshot to verify the current UI state before retrying.')
      break
    case 'terminal_exec':
      parts.push('Inspect the error output below before deciding whether to retry.')
      break
    case 'secret_read_env_value':
      parts.push('Verify the env file path and requested key names, then try another source if the value is still missing or placeholder-like.')
      break
    case 'open_app':
    case 'focus_app': {
      const app = action.kind === 'open_app' ? action.input.app : action.input.app
      parts.push(`Verify that "${app}" is installed and listed in COMPUTER_USE_OPENABLE_APPS.`)
      break
    }
  }

  return parts.join(' ')
}

function buildTerminalOutcomeExplanation(
  action: ActionInvocation & { kind: 'terminal_exec' },
  result?: TerminalCommandResult,
): string {
  if (!result) {
    return 'Terminal command completed (no structured result available).'
  }

  const parts: string[] = []
  const cmdPreview = result.command.length > 60
    ? `${result.command.slice(0, 57)}...`
    : result.command

  if (result.exitCode === 0) {
    parts.push(`Command \`${cmdPreview}\` succeeded (exit 0) in ${result.durationMs}ms.`)
    if (result.stdout.trim()) {
      const lineCount = result.stdout.split('\n').length
      parts.push(`Output: ${lineCount} line(s).`)
    }
  }
  else {
    parts.push(`Command \`${cmdPreview}\` failed with exit code ${result.exitCode} (${result.durationMs}ms).`)
    if (result.timedOut) {
      parts.push('The command timed out.')
    }
    if (result.stderr.trim()) {
      const preview = result.stderr.trim().slice(0, 200)
      parts.push(`Error output: "${preview}"${result.stderr.length > 200 ? '...' : ''}`)
    }
  }

  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Next-step explanations
// ---------------------------------------------------------------------------

/**
 * Explain what the system plans to do next based on the strategy advisories.
 */
export function explainNextStep(advisories: StrategyAdvisory[], task?: ActiveTask): string {
  if (advisories.length === 0 || (advisories.length === 1 && advisories[0].kind === 'proceed')) {
    if (task) {
      const nextIdx = task.currentStepIndex + 1
      const next = task.steps[nextIdx]
      if (next) {
        return `Next step (${nextIdx + 1}/${task.steps.length}): ${next.label}.`
      }
      return 'All planned steps have been completed.'
    }
    return 'Ready for the next instruction.'
  }

  const parts = advisories
    .filter(a => a.kind !== 'proceed')
    .map((a) => {
      switch (a.kind) {
        case 'focus_app_first':
          return `First, I need to focus the correct application. ${a.reason}`
        case 'take_screenshot_first':
          return `First, I need to take a screenshot to assess the current state. ${a.reason}`
        case 'use_terminal_instead':
          return `I'll use a terminal command instead of a screenshot — it's faster and more reliable.`
        case 'read_error_first':
          return `I need to review the previous error before proceeding. ${a.reason}`
        case 'retry_after_error':
          return `Retrying after a recoverable error. ${a.reason}`
        case 'approval_rejected_replan':
          return `The previous action was rejected. I'm adjusting my plan. ${a.reason}`
        case 'abort_task':
          return `Stopping the current task due to too many failures. ${a.reason}`
        case 'wait_and_retry':
          return `Waiting before retrying. ${a.reason}`
        default:
          return a.reason
      }
    })

  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Task progress summary
// ---------------------------------------------------------------------------

/**
 * Build a human-readable progress summary for the current task.
 */
export function summarizeTaskProgress(task: ActiveTask): string {
  const completed = task.steps.filter(s => s.outcome === 'success').length
  const failed = task.steps.filter(s => s.outcome === 'failure').length
  const total = task.steps.length

  const parts = [
    `Task: "${task.goal}"`,
    `Phase: ${task.phase}`,
    `Progress: ${completed}/${total} steps completed`,
  ]

  if (failed > 0) {
    parts.push(`${failed} step(s) failed`)
  }

  const current = task.steps[task.currentStepIndex]
  if (current && !current.finishedAt) {
    parts.push(`Currently: ${current.label}`)
  }

  return parts.join(' | ')
}

// ---------------------------------------------------------------------------
// Run state summary (for desktop_get_state tool)
// ---------------------------------------------------------------------------

/**
 * Build a human-readable summary of the entire run state.
 */
export function summarizeRunState(state: RunState): string {
  const parts: string[] = []

  // Desktop
  if (state.activeApp) {
    parts.push(`Active app: "${state.activeApp}"${state.activeWindowTitle ? ` — "${state.activeWindowTitle}"` : ''}`)
  }
  else {
    parts.push('Active app: unknown')
  }

  // Terminal
  if (state.terminalState) {
    parts.push(`Terminal cwd: ${state.terminalState.effectiveCwd}`)
    if (state.terminalState.lastExitCode !== undefined) {
      parts.push(`Last exit code: ${state.terminalState.lastExitCode}`)
    }
  }

  // Screenshot
  if (state.lastScreenshot) {
    parts.push(`Last screenshot: ${state.lastScreenshot.width || '?'}x${state.lastScreenshot.height || '?'}${state.lastScreenshotSummary ? ` — "${state.lastScreenshotSummary}"` : ''}`)
  }
  else {
    parts.push('No screenshots taken yet')
  }

  // Approval
  if (state.pendingApprovalCount > 0) {
    parts.push(`Pending approvals: ${state.pendingApprovalCount}`)
  }
  if (state.lastApprovalRejected) {
    parts.push(`Last approval was REJECTED${state.lastRejectionReason ? ` (${state.lastRejectionReason})` : ''}`)
  }

  // Task
  if (state.activeTask) {
    parts.push(summarizeTaskProgress(state.activeTask))
  }

  // Task memory
  if (state.taskMemory) {
    const tm = state.taskMemory
    const tmParts: string[] = [`Task memory [${tm.status}]:`]
    if (tm.goal)
      tmParts.push(`  Goal: ${tm.goal}`)
    if (tm.currentStep)
      tmParts.push(`  Current step: ${tm.currentStep}`)
    if (tm.confirmedFacts.length > 0)
      tmParts.push(`  Confirmed facts: ${tm.confirmedFacts.join('; ')}`)
    if (tm.blockers.length > 0)
      tmParts.push(`  Blockers: ${tm.blockers.join('; ')}`)
    if (tm.nextStep)
      tmParts.push(`  Next step: ${tm.nextStep}`)
    parts.push(tmParts.join('\n'))
  }

  return parts.join('\n')
}
