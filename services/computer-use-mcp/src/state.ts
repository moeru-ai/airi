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

import type { TaskMemory } from './task-memory/types'
import type {
  BrowserSurfaceAvailability,
  DisplayInfo,
  ExecutionTarget,
  ForegroundContext,
  LastScreenshotInfo,
  PolicyDecision,
  PtyApprovalGrant,
  PtyAuditEntry,
  SurfaceDecision,
  TerminalCommandResult,
  TerminalState,
  VscodeControllerState,
  VscodeProblem,
  WindowObservation,
  WorkflowStepTerminalBinding,
} from './types'

import { appNamesMatch } from './app-aliases'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPhase
  = | 'idle'
    | 'planning'
    | 'executing'
    | 'awaiting_approval'
    | 'recovering'
    | 'reroute_required'
    | 'completed'
    | 'failed'

/** Lightweight snapshot of a PTY session stored in RunState. */
export interface PtySessionState {
  /** Session id (e.g. "pty_1"). */
  id: string
  /** Whether the underlying process is still alive. */
  alive: boolean
  /** Terminal dimensions. */
  rows: number
  cols: number
  /** Process PID. */
  pid: number
  /** Working directory at creation time. */
  cwd?: string
  /** Stable workflow step id that created this session (if any). */
  boundStepId?: string
  /**
   * @deprecated Use `boundStepId`. Kept for backward-compat logging only.
   */
  boundWorkflowStepLabel?: string
  /** ISO timestamp when the session was created. */
  createdAt: string
  /** ISO timestamp of last interaction (write/read). */
  lastInteractionAt?: string
}

export interface TaskStep {
  /** Sequential 1-based index within the current task. */
  index: number
  /** Stable unique id for binding/recovery (e.g. "step_<uuid>"). */
  stepId: string
  /** Human-readable label, e.g. "Open Terminal" */
  label: string
  /** MCP tool invoked, e.g. "desktop_open_app" */
  toolName?: string
  /** Outcome after execution. */
  outcome?: 'success' | 'failure' | 'skipped' | 'pending_approval' | 'rejected' | 'reroute_required'
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
  /** Browser DOM/CDP surface availability for browser rerouting. */
  browserSurfaceAvailability?: BrowserSurfaceAvailability

  // --- VS Code controller context --------------------------------------
  /** Sticky VS Code engineering-controller state. */
  vscode?: VscodeControllerState

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

  // --- PTY context -------------------------------------------------------
  /** Registry of active PTY sessions tracked by the state manager. */
  ptySessions: PtySessionState[]
  /** The session id most recently written to or read from. */
  activePtySessionId?: string

  // --- Terminal lane context ---------------------------------------------
  /** Most recent surface routing decision. */
  recentSurfaceDecision?: SurfaceDecision
  /** Active workflow-step → terminal bindings. */
  workflowStepTerminalBindings: WorkflowStepTerminalBinding[]
  /** Active PTY Open Grant records. */
  ptyApprovalGrants: PtyApprovalGrant[]
  /** PTY audit log (kept in memory for current session). */
  ptyAuditLog: PtyAuditEntry[]

  // --- Task context -----------------------------------------------------
  /** Currently active task (if any). */
  activeTask?: ActiveTask

  // --- Task memory ------------------------------------------------------
  /** High-level task execution state (goal, facts, blockers, next step). */
  taskMemory?: TaskMemory

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
      ptySessions: [],
      workflowStepTerminalBindings: [],
      ptyApprovalGrants: [],
      ptyAuditLog: [],
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

  updateBrowserSurfaceAvailability(availability: BrowserSurfaceAvailability) {
    this.state.browserSurfaceAvailability = availability
    this.touch()
  }

  updateVscodeCli(cli: { cli: string, path: string }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      codeCli: cli,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeWorkspace(workspacePath: string) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      workspacePath,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeCurrentFile(file: { filePath: string, line?: number, column?: number }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      currentFile: file,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeTaskResult(task: { command: string, cwd: string, exitCode: number }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      lastTask: task,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeProblems(problems: {
    command: string
    cwd: string
    problemCount: number
    problems: VscodeProblem[]
  }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      lastProblems: problems,
      updatedAt: new Date().toISOString(),
    }
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

  finishTask(phase: 'completed' | 'failed' | 'reroute_required') {
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

  // -- Task memory updates ------------------------------------------------

  updateTaskMemory(tm: TaskMemory) {
    this.state.taskMemory = tm
    this.touch()
  }

  clearTaskMemory() {
    this.state.taskMemory = undefined
    this.touch()
  }

  // -- PTY session lifecycle ---------------------------------------------

  /** Register a newly created PTY session in state. */
  registerPtySession(session: Omit<PtySessionState, 'createdAt'>): void {
    // Remove stale entry with same id (shouldn't happen, but defensive)
    this.state.ptySessions = this.state.ptySessions.filter(s => s.id !== session.id)
    this.state.ptySessions.push({
      ...session,
      createdAt: new Date().toISOString(),
    })
    this.state.activePtySessionId = session.id
    this.touch()
  }

  /** Update the alive status of a PTY session (e.g. after process exit). */
  updatePtySessionAlive(sessionId: string, alive: boolean): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.alive = alive
      this.touch()
    }
  }

  /** Record an interaction timestamp on a PTY session. */
  touchPtySession(sessionId: string): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.lastInteractionAt = new Date().toISOString()
      this.state.activePtySessionId = sessionId
      this.touch()
    }
  }

  /** Bind a PTY session to a workflow step by stable stepId. */
  bindPtySessionToStepId(sessionId: string, stepId: string): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.boundStepId = stepId
      this.touch()
    }
  }

  /** Bind a PTY session to a workflow step label (legacy compat). */
  bindPtySessionToStep(sessionId: string, stepLabel: string): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.boundWorkflowStepLabel = stepLabel
      this.touch()
    }
  }

  /** Remove a PTY session from the registry (after destroy). */
  unregisterPtySession(sessionId: string): void {
    this.state.ptySessions = this.state.ptySessions.filter(s => s.id !== sessionId)
    if (this.state.activePtySessionId === sessionId) {
      this.state.activePtySessionId = this.state.ptySessions[0]?.id
    }
    this.touch()
  }

  /** Get the active PTY session id. */
  getActivePtySessionId(): string | undefined {
    return this.state.activePtySessionId
  }

  /** Get all PTY sessions. */
  getPtySessions(): readonly PtySessionState[] {
    return this.state.ptySessions
  }

  // -- Terminal lane: surface decision ------------------------------------

  /** Record the most recent surface routing decision. */
  recordSurfaceDecision(decision: Omit<SurfaceDecision, 'at'>): void {
    this.state.recentSurfaceDecision = {
      ...decision,
      at: new Date().toISOString(),
    }
    this.touch()
  }

  /** Get the most recent surface decision. */
  getRecentSurfaceDecision(): SurfaceDecision | undefined {
    return this.state.recentSurfaceDecision
  }

  // -- Terminal lane: step bindings --------------------------------------

  /** Bind a workflow step to a terminal surface/session. */
  addStepTerminalBinding(binding: WorkflowStepTerminalBinding): void {
    // Replace existing binding for same taskId+stepId
    this.state.workflowStepTerminalBindings = this.state.workflowStepTerminalBindings.filter(
      b => b.taskId !== binding.taskId || b.stepId !== binding.stepId,
    )
    this.state.workflowStepTerminalBindings.push(binding)
    this.touch()
  }

  /** Look up the terminal binding for a task+step. */
  getStepTerminalBinding(taskId: string, stepId: string): WorkflowStepTerminalBinding | undefined {
    return this.state.workflowStepTerminalBindings.find(
      b => b.taskId === taskId && b.stepId === stepId,
    )
  }

  /** Clear all bindings for a given task. */
  clearTaskTerminalBindings(taskId: string): void {
    this.state.workflowStepTerminalBindings = this.state.workflowStepTerminalBindings.filter(
      b => b.taskId !== taskId,
    )
    this.touch()
  }

  // -- Terminal lane: PTY Open Grant -------------------------------------

  /** Grant approval for a PTY session (Open Grant model). */
  grantPtyApproval(approvalSessionId: string, ptySessionId: string): void {
    // Deduplicate
    const existing = this.state.ptyApprovalGrants.find(
      g => g.approvalSessionId === approvalSessionId && g.ptySessionId === ptySessionId,
    )
    if (existing) {
      existing.active = true
      existing.grantedAt = new Date().toISOString()
    }
    else {
      this.state.ptyApprovalGrants.push({
        approvalSessionId,
        ptySessionId,
        grantedAt: new Date().toISOString(),
        active: true,
      })
    }
    this.touch()
  }

  /** Check if a PTY session has an active grant in the given approval session. */
  hasPtyApprovalGrant(approvalSessionId: string, ptySessionId: string): boolean {
    return this.state.ptyApprovalGrants.some(
      g => g.approvalSessionId === approvalSessionId
        && g.ptySessionId === ptySessionId
        && g.active,
    )
  }

  /** Revoke the grant for a PTY session (called on pty_destroy). */
  revokePtyApproval(ptySessionId: string): void {
    for (const g of this.state.ptyApprovalGrants) {
      if (g.ptySessionId === ptySessionId) {
        g.active = false
      }
    }
    this.touch()
  }

  /** Revoke all grants for an approval session (session end). */
  revokeApprovalSession(approvalSessionId: string): void {
    for (const g of this.state.ptyApprovalGrants) {
      if (g.approvalSessionId === approvalSessionId) {
        g.active = false
      }
    }
    this.touch()
  }

  /** Get all active PTY grants. */
  getActivePtyGrants(): readonly PtyApprovalGrant[] {
    return this.state.ptyApprovalGrants.filter(g => g.active)
  }

  // -- Terminal lane: PTY audit ------------------------------------------

  /** Append a PTY audit entry. */
  appendPtyAudit(entry: Omit<PtyAuditEntry, 'at'>): void {
    this.state.ptyAuditLog.push({
      ...entry,
      at: new Date().toISOString(),
    })
    this.touch()
  }

  /** Get all PTY audit entries. */
  getPtyAuditLog(): readonly PtyAuditEntry[] {
    return this.state.ptyAuditLog
  }

  /** Get audit entries for a specific PTY session. */
  getPtyAuditForSession(ptySessionId: string): PtyAuditEntry[] {
    return this.state.ptyAuditLog.filter(e => e.ptySessionId === ptySessionId)
  }

  // -- Helpers -----------------------------------------------------------

  /** Whether the system believes the correct app is in front. */
  isAppInForeground(appName: string): boolean {
    if (!this.state.activeApp)
      return false
    return appNamesMatch(this.state.activeApp, appName)
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
