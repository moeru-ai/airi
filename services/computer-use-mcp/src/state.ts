/**
 * Run-level state manager.
 *
 * Maintains a unified, continuously updated picture of the current
 * execution environment so that downstream strategy / workflow layers
 * can make informed decisions without re-querying every subsystem.
 *
 * State is **ephemeral** — it lives for the duration of the MCP server
 * process. Persistent audit lives in session trace / JSONL.
 */

import type {
  DisplayInfo,
  ExecutionTarget,
  ForegroundContext,
  LastScreenshotInfo,
  PolicyDecision,
  TerminalCommandResult,
  TerminalState,
  WindowObservation,
} from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPhase
  = | 'idle'
    | 'planning'
    | 'executing'
    | 'awaiting_approval'
    | 'recovering'
    | 'completed'
    | 'failed'

export interface TaskStep {
  /** Sequential 1-based index within the current task. */
  index: number
  /** Human-readable label, e.g. "Open Terminal" */
  label: string
  /** MCP tool invoked, e.g. "desktop_open_app" */
  toolName?: string
  /** Outcome after execution. */
  outcome?: 'success' | 'failure' | 'skipped' | 'pending_approval' | 'rejected'
  /** Short explanation of the outcome. */
  outcomeReason?: string
  /** ISO timestamp when started. */
  startedAt?: string
  /** ISO timestamp when finished. */
  finishedAt?: string
}

export interface ActiveTask {
  /** Unique identifier. */
  id: string
  /** Human-readable goal description. */
  goal: string
  /** Workflow template id (if driven by a workflow). */
  workflowId?: string
  phase: TaskPhase
  /** Ordered list of steps planned / executed so far. */
  steps: TaskStep[]
  /** Index of the currently executing step (0-based into `steps`). */
  currentStepIndex: number
  /** ISO timestamp when the task started. */
  startedAt: string
  /** ISO timestamp when the task finished (completed / failed). */
  finishedAt?: string
  /** Accumulated failure count within this task. */
  failureCount: number
  /** Maximum tolerable consecutive failures before aborting. */
  maxConsecutiveFailures: number
}

export interface RunState {
  // --- Desktop context --------------------------------------------------
  /** Most recently observed foreground app name. */
  activeApp?: string
  /** Most recently observed window title. */
  activeWindowTitle?: string
  /** Full foreground context from last probe. */
  foregroundContext?: ForegroundContext
  /** Most recent window observation. */
  lastWindowObservation?: WindowObservation
  /** Last known execution target. */
  executionTarget?: ExecutionTarget
  /** Last known display info. */
  displayInfo?: DisplayInfo

  // --- Terminal context -------------------------------------------------
  /** Sticky terminal state (cwd, last exit code, etc.). */
  terminalState?: TerminalState
  /** Full result of the most recent terminal command. */
  lastTerminalResult?: TerminalCommandResult

  // --- Screenshot context -----------------------------------------------
  /** Metadata for the most recent screenshot. */
  lastScreenshot?: LastScreenshotInfo
  /** One-line human summary of the most recent screenshot content. */
  lastScreenshotSummary?: string

  // --- Approval context -------------------------------------------------
  /** Number of pending approval actions. */
  pendingApprovalCount: number
  /** Whether the last approval was rejected. */
  lastApprovalRejected: boolean
  /** Reason for the last rejection (if any). */
  lastRejectionReason?: string
  /** The most recent policy decision. */
  lastPolicyDecision?: PolicyDecision

  // --- Task context -----------------------------------------------------
  /** Currently active task (if any). */
  activeTask?: ActiveTask

  // --- Meta -------------------------------------------------------------
  /** ISO timestamp of the last state update. */
  updatedAt: string
}

// ---------------------------------------------------------------------------
// State Manager
// ---------------------------------------------------------------------------

export class RunStateManager {
  private state: RunState

  constructor() {
    this.state = {
      pendingApprovalCount: 0,
      lastApprovalRejected: false,
      updatedAt: new Date().toISOString(),
    }
  }

  /** Return a readonly snapshot of the current run state. */
  getState(): Readonly<RunState> {
    return { ...this.state }
  }

  // -- Desktop context updates -------------------------------------------

  updateForegroundContext(ctx: ForegroundContext) {
    this.state.foregroundContext = ctx
    this.state.activeApp = ctx.appName
    this.state.activeWindowTitle = ctx.windowTitle
    this.touch()
  }

  updateWindowObservation(obs: WindowObservation) {
    this.state.lastWindowObservation = obs
    if (obs.frontmostAppName) {
      this.state.activeApp = obs.frontmostAppName
    }
    if (obs.frontmostWindowTitle) {
      this.state.activeWindowTitle = obs.frontmostWindowTitle
    }
    this.touch()
  }

  updateExecutionTarget(target: ExecutionTarget) {
    this.state.executionTarget = target
    this.touch()
  }

  updateDisplayInfo(info: DisplayInfo) {
    this.state.displayInfo = info
    this.touch()
  }

  // -- Terminal context updates ------------------------------------------

  updateTerminalState(ts: TerminalState) {
    this.state.terminalState = ts
    this.touch()
  }

  updateTerminalResult(result: TerminalCommandResult) {
    this.state.lastTerminalResult = result
    this.state.terminalState = {
      effectiveCwd: result.effectiveCwd,
      lastExitCode: result.exitCode,
      lastCommandSummary: result.command.length > 160
        ? `${result.command.slice(0, 157)}...`
        : result.command,
    }
    this.touch()
  }

  // -- Screenshot context updates ----------------------------------------

  updateLastScreenshot(info: LastScreenshotInfo, summary?: string) {
    this.state.lastScreenshot = info
    if (summary !== undefined) {
      this.state.lastScreenshotSummary = summary
    }
    this.touch()
  }

  setScreenshotSummary(summary: string) {
    this.state.lastScreenshotSummary = summary
    this.touch()
  }

  // -- Approval context updates ------------------------------------------

  setPendingApprovalCount(count: number) {
    this.state.pendingApprovalCount = count
    this.touch()
  }

  recordApprovalOutcome(rejected: boolean, reason?: string) {
    this.state.lastApprovalRejected = rejected
    this.state.lastRejectionReason = rejected ? reason : undefined
    this.touch()
  }

  updatePolicyDecision(decision: PolicyDecision) {
    this.state.lastPolicyDecision = decision
    this.touch()
  }

  // -- Task context updates ----------------------------------------------

  startTask(task: ActiveTask) {
    this.state.activeTask = task
    this.touch()
  }

  updateTaskPhase(phase: TaskPhase) {
    if (this.state.activeTask) {
      this.state.activeTask.phase = phase
      this.touch()
    }
  }

  advanceTaskStep(step: TaskStep) {
    if (this.state.activeTask) {
      this.state.activeTask.steps.push(step)
      this.state.activeTask.currentStepIndex = this.state.activeTask.steps.length - 1
      this.touch()
    }
  }

  completeCurrentStep(outcome: TaskStep['outcome'], reason?: string) {
    if (!this.state.activeTask)
      return
    const step = this.state.activeTask.steps[this.state.activeTask.currentStepIndex]
    if (step) {
      step.outcome = outcome
      step.outcomeReason = reason
      step.finishedAt = new Date().toISOString()
      if (outcome === 'failure') {
        this.state.activeTask.failureCount += 1
      }
    }
    this.touch()
  }

  finishTask(phase: 'completed' | 'failed') {
    if (this.state.activeTask) {
      this.state.activeTask.phase = phase
      this.state.activeTask.finishedAt = new Date().toISOString()
    }
    this.touch()
  }

  clearTask() {
    this.state.activeTask = undefined
    this.touch()
  }

  // -- Helpers -----------------------------------------------------------

  /** Whether the system believes the correct app is in front. */
  isAppInForeground(appName: string): boolean {
    if (!this.state.activeApp)
      return false
    return this.state.activeApp.toLowerCase().includes(appName.toLowerCase())
  }

  /** Whether the last terminal command succeeded (exit 0). */
  lastTerminalSucceeded(): boolean {
    return this.state.lastTerminalResult?.exitCode === 0
  }

  /** Whether the runner is in a healthy state for mutations. */
  isReadyForMutations(): boolean {
    if (!this.state.executionTarget)
      return false
    return !this.state.executionTarget.tainted
  }

  /** Whether there is a task currently in progress. */
  hasActiveTask(): boolean {
    return !!this.state.activeTask
      && this.state.activeTask.phase !== 'completed'
      && this.state.activeTask.phase !== 'failed'
  }

  private touch() {
    this.state.updatedAt = new Date().toISOString()
  }
}
