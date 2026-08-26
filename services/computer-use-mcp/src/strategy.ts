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

import { appNamesMatch, findKnownAppMention } from './app-aliases'

// ---------------------------------------------------------------------------
// Advisory types
// ---------------------------------------------------------------------------

/** Broad category for classifying advisories. */
export type AdvisoryCategory = 'informational' | 'prep' | 'recovery' | 'reroute'

export type AdvisoryKind
  = | 'abort_task'
    | 'approval_rejected_replan'
    | 'click_likely_duplicate'
    | 'enumerate_displays_first'
    | 'focus_app_first'
    | 'grounding_stale'
    | 'observe_first_required'
    | 'proceed'
    | 'read_error_first'
    // Surface-routing advisories
    | 'retry_after_error'
    | 'take_screenshot_first'
    | 'use_accessibility_grounding'
    | 'use_browser_surface'
    // Desktop grounding advisories
    | 'use_pty_surface'
    | 'use_terminal_instead'
    | 'wait_and_retry'

/** Which surface/tool family the advisory points to. */
export type RecommendedSurface = 'accessibility' | 'browser_cdp' | 'browser_dom' | 'desktop' | 'display' | 'none' | 'pty' | 'terminal'

export interface StrategyAdvisory {
  /** Broad classification of this advisory. */
  category: AdvisoryCategory
  /**
   * If the advisory recommends aborting, this is the accumulated
   * evidence (error messages, exit codes, etc.).
   */
  evidence?: string[]
  /** What the strategy layer recommends. */
  kind: AdvisoryKind
  /** Human-readable explanation of why this advisory was emitted. */
  reason: string
  /** Which surface the advisory recommends (if any). */
  recommendedSurface: RecommendedSurface
  /**
   * If the advisory recommends a preparatory action, this is the
   * suggested action to execute first.
   */
  suggestedAction?: ActionInvocation
  /**
   * When the advisory suggests calling a specific MCP tool directly
   * (e.g. an accessibility or CDP tool outside the ActionInvocation union).
   */
  suggestedToolName?: string
}

// ---------------------------------------------------------------------------
// Central advisory maps
// ---------------------------------------------------------------------------

/** Maps each advisory kind to its classification category. */
export const ADVISORY_CATEGORY_MAP: Record<AdvisoryKind, AdvisoryCategory> = {
  abort_task: 'recovery',
  approval_rejected_replan: 'recovery',
  click_likely_duplicate: 'recovery',

  // Prep: actions that prepare the environment before the main action
  enumerate_displays_first: 'prep',
  focus_app_first: 'prep',
  grounding_stale: 'prep',
  // Desktop grounding
  observe_first_required: 'prep',

  // Informational: no action needed, safe to proceed
  proceed: 'informational',
  read_error_first: 'recovery',
  // Recovery: respond to a previous failure
  retry_after_error: 'recovery',
  take_screenshot_first: 'prep',
  use_accessibility_grounding: 'reroute',
  // Reroute: the caller should switch to a different surface/tool
  use_browser_surface: 'reroute',

  use_pty_surface: 'reroute',
  use_terminal_instead: 'reroute',

  wait_and_retry: 'recovery',
}

/** Maps each advisory kind to the surface it recommends. */
export const ADVISORY_SURFACE_MAP: Record<AdvisoryKind, RecommendedSurface> = {
  abort_task: 'none',
  approval_rejected_replan: 'none',
  click_likely_duplicate: 'desktop',

  enumerate_displays_first: 'display',
  focus_app_first: 'desktop',
  grounding_stale: 'desktop',
  // Desktop grounding
  observe_first_required: 'desktop',

  proceed: 'none',
  read_error_first: 'terminal',
  retry_after_error: 'none',
  take_screenshot_first: 'desktop',
  use_accessibility_grounding: 'accessibility',
  use_browser_surface: 'browser_cdp',

  use_pty_surface: 'pty',
  use_terminal_instead: 'terminal',

  wait_and_retry: 'none',
}

/**
 * Workflow engine prep-tool policy for advisory kinds that recommend a
 * specific MCP tool. Defines priority (lower = run first), retryability,
 * and the outcome the engine should set on the step when the prep
 * succeeds.
 */
export type PrepRetryability = 'advisory_only' | 'permanent' | 'transient'

export interface PrepToolPolicy {
  /**
   * What the engine should record on the step when prep succeeds:
   * - 'prepared': continue to main action
   * - 'reroute': stop the workflow and return reroute signal
   */
  outcomeOnSuccess: 'prepared' | 'reroute'
  /** Tool invocation priority — lower values run first. */
  priority: number
  /** Retry classification for the prep tool. */
  retryability: PrepRetryability
}

export const PREP_TOOL_POLICY: Partial<Record<AdvisoryKind, PrepToolPolicy>> = {
  enumerate_displays_first: {
    outcomeOnSuccess: 'prepared',
    priority: 10,
    retryability: 'transient',
  },
  use_accessibility_grounding: {
    outcomeOnSuccess: 'reroute',
    priority: 20,
    retryability: 'permanent',
  },
  use_browser_surface: {
    outcomeOnSuccess: 'reroute',
    priority: 20,
    retryability: 'permanent',
  },
  use_pty_surface: {
    outcomeOnSuccess: 'reroute',
    priority: 20,
    retryability: 'permanent',
  },
}

/**
 * Produce a recovery plan after an action failure, based on the current
 * run state and the error that occurred.
 */
export function buildRecoveryPlan(params: {
  errorMessage: string
  failedAction: ActionInvocation
  state: RunState
}): StrategyAdvisory {
  const { errorMessage, failedAction, state } = params

  // Terminal failure with active TUI session -> suggest PTY surface.
  const ptySession = selectUsablePtySession(state)
  if (
    failedAction.kind === 'terminal_exec'
    && ptySession
    && (
      isLikelyTuiSession(state.activeWindowTitle)
      || ptySession.boundWorkflowStepLabel === getCurrentTaskStepLabel(state)
    )
  ) {
    return advisory({
      evidence: [errorMessage],
      kind: 'use_pty_surface',
      reason: `Terminal command failed while PTY session "${ptySession.id}" is available: ${errorMessage}. Use PTY tools for direct terminal interaction.`,
      suggestedToolName: 'pty_read_screen',
    })
  }

  // Terminal failure -> suggest reading stderr and optionally retrying.
  if (failedAction.kind === 'terminal_exec') {
    if (errorMessage.includes('timeout')) {
      return advisory({
        evidence: [errorMessage],
        kind: 'wait_and_retry',
        reason: 'The command timed out. Consider increasing the timeout or splitting the work.',
      })
    }
    return advisory({
      evidence: [
        errorMessage,
        ...(state.lastTerminalResult?.stderr ? [`stderr: ${state.lastTerminalResult.stderr.slice(0, 500)}`] : []),
      ],
      kind: 'read_error_first',
      reason: `Terminal command failed: ${errorMessage}. Inspect stderr/stdout before deciding next step.`,
    })
  }

  // UI action failure on wrong app -> suggest focusing.
  if (isMutatingUiAction(failedAction) && state.foregroundContext?.available) {
    const targetApp = inferTargetApp(state)
    if (targetApp && !isAppFocused(state.foregroundContext, targetApp)) {
      return advisory({
        evidence: [errorMessage],
        kind: 'focus_app_first',
        reason: `UI action failed because "${state.foregroundContext.appName}" is in front instead of "${targetApp}".`,
        suggestedAction: { input: { app: targetApp }, kind: 'focus_app' },
      })
    }
  }

  // UI action failure in a browser → suggest switching to browser surface.
  if (isMutatingUiAction(failedAction) && state.foregroundContext?.available && isBrowserApp(state.foregroundContext.appName)) {
    const browserSurface = selectBrowserSurface(state)

    if (browserSurface) {
      return advisory({
        evidence: [errorMessage],
        kind: 'use_browser_surface',
        reason: `Desktop UI action failed in browser "${state.foregroundContext.appName}": ${errorMessage}. ${browserSurface.reason}`,
        recommendedSurface: browserSurface.surface,
        suggestedToolName: browserSurface.toolName,
      })
    }
  }

  // Observation failure on macOS → suggest accessibility tree as alternative.
  if (
    (failedAction.kind === 'screenshot' || failedAction.kind === 'observe_windows')
    && state.foregroundContext?.platform === 'darwin'
  ) {
    return advisory({
      evidence: [errorMessage],
      kind: 'use_accessibility_grounding',
      reason: `Observation failed: ${errorMessage}. Use the accessibility tree as an alternative structured UI data source.`,
      suggestedToolName: 'accessibility_snapshot',
    })
  }

  // Generic: suggest taking a screenshot to reassess.
  return advisory({
    evidence: [errorMessage],
    kind: 'take_screenshot_first',
    reason: `Action "${failedAction.kind}" failed: ${errorMessage}. Take a screenshot to reassess the current state.`,
    suggestedAction: { input: {}, kind: 'screenshot' },
  })
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
  /** Foreground context from the most recent probe (may be fresher than state). */
  freshContext?: ForegroundContext
  proposedAction: ActionInvocation
  state: RunState
}): StrategyAdvisory[] {
  const advisories: StrategyAdvisory[] = []
  const { proposedAction, state } = params
  const ctx = params.freshContext ?? state.foregroundContext

  // -----------------------------------------------------------------------
  // Rule 1: If the last approval was rejected, recommend replanning.
  // -----------------------------------------------------------------------
  if (state.lastApprovalRejected) {
    advisories.push(advisory({
      evidence: state.lastRejectionReason ? [state.lastRejectionReason] : [],
      kind: 'approval_rejected_replan',
      reason: `The last action was rejected${state.lastRejectionReason ? `: ${state.lastRejectionReason}` : ''}. Consider an alternative approach.`,
    }))
  }

  // -----------------------------------------------------------------------
  // Rule 2: For UI-interaction actions, make sure the correct app is
  // focused before sending clicks / keystrokes / text.
  // -----------------------------------------------------------------------
  const uiActions = new Set<string>(['click', 'press_keys', 'scroll', 'type_text'])
  if (uiActions.has(proposedAction.kind) && ctx?.available) {
    // If there is an active task whose current step targets a specific app,
    // verify the foreground matches.
    const targetApp = inferTargetApp(state)
    if (targetApp && !isAppFocused(ctx, targetApp)) {
      advisories.push(advisory({
        kind: 'focus_app_first',
        reason: `Expected "${targetApp}" in foreground but found "${ctx.appName || 'unknown'}". Will focus the correct app first.`,
        suggestedAction: { input: { app: targetApp }, kind: 'focus_app' },
      }))
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
    advisories.push(advisory({
      kind: 'take_screenshot_first',
      reason: 'No recent screenshot available for the remote desktop. Capture one before mutating.',
      suggestedAction: { input: {}, kind: 'screenshot' },
    }))
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
      advisories.push(advisory({
        evidence: [
          `exit_code=${state.lastTerminalResult.exitCode}`,
          `stderr_preview=${state.lastTerminalResult.stderr.slice(0, 300)}`,
        ],
        kind: 'read_error_first',
        reason: `The previous command exited with code ${state.lastTerminalResult.exitCode}. Review the error output before running another command.`,
      }))
    }
  }

  // -----------------------------------------------------------------------
  // Rule 5: If the active task has hit too many consecutive failures,
  // recommend aborting.
  // -----------------------------------------------------------------------
  if (state.activeTask && state.activeTask.failureCount >= state.activeTask.maxConsecutiveFailures) {
    advisories.push(advisory({
      evidence: state.activeTask.steps
        .filter(s => s.outcome === 'failure')
        .map(s => `Step ${s.index}: ${s.label} — ${s.outcomeReason || 'unknown error'}`),
      kind: 'abort_task',
      reason: `Task "${state.activeTask.goal}" has accumulated ${state.activeTask.failureCount} failures (max ${state.activeTask.maxConsecutiveFailures}). Aborting to prevent damage.`,
    }))
  }

  // -----------------------------------------------------------------------
  // Rule 6: Prefer terminal commands over visual interactions when the
  // information can be obtained programmatically.
  // -----------------------------------------------------------------------
  if (proposedAction.kind === 'screenshot' && canUseTerminalInstead(state)) {
    advisories.push(advisory({
      kind: 'use_terminal_instead',
      reason: 'The information you need may be available via a terminal command, which is faster and more reliable than a screenshot.',
    }))
  }

  // -----------------------------------------------------------------------
  // Rule 7: If the runner is tainted, recommend a screenshot first.
  // -----------------------------------------------------------------------
  if (
    isMutatingUiAction(proposedAction)
    && state.executionTarget?.tainted
  ) {
    advisories.push(advisory({
      kind: 'take_screenshot_first',
      reason: 'The runner is tainted from a previous failure. Capture a fresh screenshot to restore it before proceeding.',
      suggestedAction: { input: {}, kind: 'screenshot' },
    }))
  }

  // -----------------------------------------------------------------------
  // Rule 8: Browser surface routing — when the foreground is a browser,
  // prefer browser DOM / CDP tools over desktop-level UI actions.
  // -----------------------------------------------------------------------
  if (isMutatingUiAction(proposedAction) && ctx?.available && isBrowserApp(ctx.appName)) {
    const browserSurface = selectBrowserSurface(state)

    if (browserSurface) {
      advisories.push(advisory({
        kind: 'use_browser_surface',
        reason: browserSurface.reason,
        recommendedSurface: browserSurface.surface,
        suggestedToolName: browserSurface.toolName,
      }))
    }
  }

  // -----------------------------------------------------------------------
  // Rule 9: Accessibility grounding — on macOS, prefer the accessibility
  // tree for structured UI data over raw screenshots for native apps.
  // For browsers, Rule 8 already routes to DOM/CDP which is richer.
  // -----------------------------------------------------------------------
  if (
    proposedAction.kind === 'screenshot'
    && ctx?.platform === 'darwin'
    && !isBrowserApp(ctx.appName)
  ) {
    advisories.push(advisory({
      kind: 'use_accessibility_grounding',
      reason: 'macOS accessibility tree provides structured UI element data. Consider capturing it before or instead of a screenshot for element discovery.',
      suggestedToolName: 'accessibility_snapshot',
    }))
  }

  // -----------------------------------------------------------------------
  // Rule 10: PTY surface for interactive TUI sessions — when the
  // terminal is running a TUI program, terminal_exec won't work well.
  // -----------------------------------------------------------------------
  const ptySession = selectUsablePtySession(state)
  if (
    proposedAction.kind === 'terminal_exec'
    && ptySession
    && (
      isLikelyTuiSession(ctx?.windowTitle ?? state.activeWindowTitle)
      || ptySession.boundWorkflowStepLabel === getCurrentTaskStepLabel(state)
    )
  ) {
    advisories.push(advisory({
      kind: 'use_pty_surface',
      reason: `Use tracked PTY session "${ptySession.id}" for direct TUI interaction instead of terminal_exec.`,
      suggestedToolName: 'pty_read_screen',
    }))
  }

  // -----------------------------------------------------------------------
  // Rule 11: Multi-display awareness — if display configuration is
  // unknown and the action involves spatial coordinates, enumerate first.
  // -----------------------------------------------------------------------
  if (
    (proposedAction.kind === 'screenshot' || proposedAction.kind === 'click')
    && !state.displayInfo
  ) {
    advisories.push(advisory({
      kind: 'enumerate_displays_first',
      reason: 'Display configuration is unknown. Enumerate displays to ensure correct coordinate targeting on multi-monitor setups.',
      suggestedToolName: 'display_enumerate',
    }))
  }

  // -----------------------------------------------------------------------
  // Rule 12: desktop_click_target requires a fresh grounding snapshot.
  // -----------------------------------------------------------------------
  if (
    proposedAction.kind === 'desktop_click_target'
    && !state.lastGroundingSnapshot
  ) {
    advisories.push(advisory({
      kind: 'observe_first_required',
      reason: 'No desktop grounding snapshot available. Call desktop_observe first to discover interactable targets.',
      suggestedToolName: 'desktop_observe',
    }))
  }

  // -----------------------------------------------------------------------
  // Rule 13: stale grounding snapshots must be refreshed before clicking.
  // -----------------------------------------------------------------------
  if (
    proposedAction.kind === 'desktop_click_target'
    && state.lastGroundingSnapshot
  ) {
    const snapshotAge = Date.now() - new Date(state.lastGroundingSnapshot.capturedAt).getTime()
    if (snapshotAge > 5000) {
      advisories.push(advisory({
        kind: 'grounding_stale',
        reason: `Desktop grounding snapshot is ${Math.round(snapshotAge / 1000)}s old. Refresh with desktop_observe before clicking.`,
        suggestedToolName: 'desktop_observe',
      }))
    }
  }

  // -----------------------------------------------------------------------
  // Rule 14: repeated target clicks need a fresh observe in between.
  // -----------------------------------------------------------------------
  if (
    proposedAction.kind === 'desktop_click_target'
    && state.lastGroundingSnapshot
    && state.lastClickedCandidateId
    && 'candidateId' in proposedAction.input
    && proposedAction.input.candidateId === state.lastClickedCandidateId
  ) {
    advisories.push(advisory({
      kind: 'click_likely_duplicate',
      reason: `Candidate "${state.lastClickedCandidateId}" was already clicked. Call desktop_observe to verify the UI changed before clicking again.`,
      suggestedToolName: 'desktop_observe',
    }))
  }

  // If no advisories were emitted, it is safe to proceed.
  if (advisories.length === 0) {
    advisories.push(advisory({
      kind: 'proceed',
      reason: 'No pre-conditions violated. Safe to execute.',
    }))
  }

  return advisories
}

/**
 * Helper to construct a `StrategyAdvisory` with `category` and
 * `recommendedSurface` populated from the central maps.
 */
function advisory(fields: Omit<StrategyAdvisory, 'category' | 'recommendedSurface'> & Partial<Pick<StrategyAdvisory, 'category' | 'recommendedSurface'>>): StrategyAdvisory {
  return {
    ...fields,
    category: fields.category ?? ADVISORY_CATEGORY_MAP[fields.kind],
    recommendedSurface: fields.recommendedSurface ?? ADVISORY_SURFACE_MAP[fields.kind],
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Get the stable stepId for the current task step. */
function getCurrentTaskStepId(state: RunState): string | undefined {
  if (!state.activeTask) {
    return undefined
  }

  return state.activeTask.steps[state.activeTask.currentStepIndex]?.stepId
}

function getCurrentTaskStepLabel(state: RunState): string | undefined {
  if (!state.activeTask) {
    return undefined
  }

  return state.activeTask.steps[state.activeTask.currentStepIndex]?.label
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
  return findKnownAppMention(step.label)
}

function isAppFocused(ctx: ForegroundContext, targetApp: string): boolean {
  if (!ctx.available || !ctx.appName)
    return false
  return appNamesMatch(ctx.appName, targetApp)
}

function isMutatingUiAction(action: ActionInvocation): boolean {
  return ['click', 'focus_app', 'open_app', 'press_keys', 'scroll', 'type_text'].includes(action.kind)
}

function selectBrowserSurface(state: RunState): undefined | {
  reason: string
  surface: Extract<RecommendedSurface, 'browser_cdp' | 'browser_dom'>
  toolName: 'browser_cdp_collect_elements' | 'browser_dom_read_page'
} {
  const availability = state.browserSurfaceAvailability

  if (!availability) {
    return {
      reason: 'Browser CDP is selected as the default browser surface when no live availability model is present.',
      surface: 'browser_cdp',
      toolName: 'browser_cdp_collect_elements',
    }
  }

  if (!availability.suitable || !availability.preferredSurface || !availability.selectedToolName) {
    return undefined
  }

  return {
    reason: availability.reason,
    surface: availability.preferredSurface,
    toolName: availability.selectedToolName,
  }
}

function selectUsablePtySession(state: RunState) {
  // Prefer stepId binding over stepLabel binding
  const currentStepId = getCurrentTaskStepId(state)
  if (currentStepId) {
    const boundById = state.ptySessions.find(session => session.alive && session.boundStepId === currentStepId)
    if (boundById) {
      return boundById
    }
  }

  // Fallback: legacy stepLabel binding
  const currentStepLabel = getCurrentTaskStepLabel(state)
  if (currentStepLabel) {
    const bound = state.ptySessions.find(session => session.alive && session.boundWorkflowStepLabel === currentStepLabel)
    if (bound) {
      return bound
    }
  }

  if (!state.activePtySessionId) {
    return undefined
  }

  return state.ptySessions.find(session => session.alive && session.id === state.activePtySessionId)
}

// ---------------------------------------------------------------------------
// Surface detection helpers
// ---------------------------------------------------------------------------

const KNOWN_BROWSERS = new Set([
  'arc',
  'brave',
  'brave browser',
  'chrome',
  'chromium',
  'edge',
  'firefox',
  'google chrome',
  'microsoft edge',
  'opera',
  'orion',
  'safari',
  'vivaldi',
])
const APP_SUFFIX_RE = /\.app$/u

/** Check if the foreground app is a known web browser. */
function isBrowserApp(appName: string | undefined): boolean {
  if (!appName)
    return false
  return KNOWN_BROWSERS.has(appName.trim().toLowerCase().replace(APP_SUFFIX_RE, ''))
}

const KNOWN_TUI_PROGRAMS = [
  'vim',
  'nvim',
  'neovim',
  'vi',
  'nano',
  'emacs',
  'htop',
  'btop',
  'top',
  'less',
  'more',
  'man',
  'tmux',
  'screen',
  'irssi',
  'weechat',
  'mutt',
  'neomutt',
  'mc',
  'ranger',
  'nnn',
  'fzf',
  'tig',
  'lazygit',
  'lazydocker',
]

/**
 * Summarize the strategy advisory list into a classified, user-friendly
 * string for inclusion in MCP responses.
 *
 * Groups advisories by category (prep / reroute / recovery / informational)
 * and includes the recommended surface when relevant.
 */
export function summarizeAdvisories(advisories: StrategyAdvisory[]): string {
  if (advisories.length === 1 && advisories[0].kind === 'proceed') {
    return ''
  }

  const meaningful = advisories.filter(a => a.kind !== 'proceed')

  return meaningful
    .map((a) => {
      const surface = a.recommendedSurface !== 'none' ? ` → ${a.recommendedSurface}` : ''
      return `[${a.category}/${a.kind}${surface}] ${a.reason}`
    })
    .join(' | ')
}

/**
 * Heuristic: does the window title suggest an interactive TUI program
 * is running (vim, htop, tmux, etc.)?
 */
function isLikelyTuiSession(windowTitle: string | undefined): boolean {
  if (!windowTitle)
    return false
  const lower = windowTitle.toLowerCase()
  return KNOWN_TUI_PROGRAMS.some(prog => lower.includes(prog))
}
