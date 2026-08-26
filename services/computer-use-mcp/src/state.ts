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

import type { DesktopSession } from './desktop-session'
import type { ToolLane } from './server/tool-descriptors'
import type { TaskMemory } from './task-memory/types'
import type {
  BrowserSurfaceAvailability,
  ChromeSessionInfo,
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

export interface ActiveTask {
  /** Index of the currently executing step (0-based into `steps`). */
  currentStepIndex: number
  /** Accumulated failure count within this task. */
  failureCount: number
  /** ISO timestamp when the task finished (completed / failed). */
  finishedAt?: string
  /** Human-readable goal description. */
  goal: string
  /** Unique identifier. */
  id: string
  /** Maximum tolerable consecutive failures before aborting. */
  maxConsecutiveFailures: number
  phase: TaskPhase
  /** ISO timestamp when the task started. */
  startedAt: string
  /** Ordered list of steps planned / executed so far. */
  steps: TaskStep[]
  /** Workflow template id (if driven by a workflow). */
  workflowId?: string
}

/** Lightweight snapshot of a PTY session stored in RunState. */
export interface PtySessionState {
  /** Whether the underlying process is still alive. */
  alive: boolean
  /** Stable workflow step id that created this session (if any). */
  boundStepId?: string
  /**
   * @deprecated Use `boundStepId`. Kept for backward-compat logging only.
   */
  boundWorkflowStepLabel?: string
  cols: number
  /** ISO timestamp when the session was created. */
  createdAt: string
  /** Working directory at creation time. */
  cwd?: string
  /** Session id (e.g. "pty_1"). */
  id: string
  /** ISO timestamp of last interaction (write/read). */
  lastInteractionAt?: string
  /** Last cwd observed from terminal prompt heuristics. */
  observedCwd?: string
  /** Process PID. */
  pid: number
  /** Terminal dimensions. */
  rows: number
}

export interface RunState {
  // --- Desktop context --------------------------------------------------
  /** Most recently observed foreground app name. */
  activeApp?: string
  /** The session id most recently written to or read from. */
  activePtySessionId?: string
  // --- Task context -----------------------------------------------------
  /** Currently active task (if any). */
  activeTask?: ActiveTask
  /** Most recently observed window title. */
  activeWindowTitle?: string
  /** Browser DOM/CDP surface availability for browser rerouting. */
  browserSurfaceAvailability?: BrowserSurfaceAvailability
  // --- Chrome Session ----------------------------------------------------
  /** Agent's dedicated Chrome session (managed by ChromeSessionManager). */
  chromeSession?: ChromeSessionInfo
  // --- Desktop Session ---------------------------------------------------
  /** Agent's active desktop execution session. */
  desktopSession?: DesktopSession

  /** Last known display info. */
  displayInfo?: DisplayInfo

  /** Last known execution target. */
  executionTarget?: ExecutionTarget
  /** Full foreground context from last probe. */
  foregroundContext?: ForegroundContext

  // --- Tool lane hygiene ------------------------------------------------
  /** Inferred active lane from the most recent non-exempt tool invocation. */
  inferredActiveLane?: ToolLane
  /** Whether the last approval was rejected. */
  lastApprovalRejected: boolean

  /** Candidate id of the last `desktop_click_target` call for duplicate protection. */
  lastClickedCandidateId?: string
  // --- Desktop grounding -------------------------------------------------
  /** Latest unified desktop grounding snapshot captured by `desktop_observe`. */
  lastGroundingSnapshot?: import('./desktop-grounding-types').DesktopGroundingSnapshot
  /** Most recent pointer snap intent for overlay rendering. */
  lastPointerIntent?: import('./desktop-grounding-types').PointerIntent
  /** The most recent policy decision. */
  lastPolicyDecision?: PolicyDecision

  /** Reason for the last rejection (if any). */
  lastRejectionReason?: string
  // --- Screenshot context -----------------------------------------------
  /** Metadata for the most recent screenshot. */
  lastScreenshot?: LastScreenshotInfo

  /** One-line human summary of the most recent screenshot content. */
  lastScreenshotSummary?: string
  /** Full result of the most recent terminal command. */
  lastTerminalResult?: TerminalCommandResult
  /** Most recent window observation. */
  lastWindowObservation?: WindowObservation
  // --- Approval context -------------------------------------------------
  /** Number of pending approval actions. */
  pendingApprovalCount: number

  /** The user's foreground app before the agent took over. */
  previousUserForegroundApp?: string

  /** Active PTY Open Grant records. */
  ptyApprovalGrants: PtyApprovalGrant[]

  /** PTY audit log (kept in memory for current session). */
  ptyAuditLog: PtyAuditEntry[]
  // --- PTY context -------------------------------------------------------
  /** Registry of active PTY sessions tracked by the state manager. */
  ptySessions: PtySessionState[]
  // --- Terminal lane context ---------------------------------------------
  /** Most recent surface routing decision. */
  recentSurfaceDecision?: SurfaceDecision

  // --- Task memory ------------------------------------------------------
  /** High-level task execution state (goal, facts, blockers, next step). */
  taskMemory?: TaskMemory
  // --- Terminal context -------------------------------------------------
  /** Sticky terminal state (cwd, last exit code, etc.). */
  terminalState?: TerminalState

  // --- Meta -------------------------------------------------------------
  /** ISO timestamp of the last state update. */
  updatedAt: string

  // --- VS Code controller context --------------------------------------
  /** Sticky VS Code engineering-controller state. */
  vscode?: VscodeControllerState

  /** Active workflow-step → terminal bindings. */
  workflowStepTerminalBindings: WorkflowStepTerminalBinding[]
}

export type TaskPhase
  = | 'awaiting_approval'
    | 'completed'
    | 'executing'
    | 'failed'
    | 'idle'
    | 'planning'
    | 'recovering'
    | 'reroute_required'

export interface TaskStep {
  /** ISO timestamp when finished. */
  finishedAt?: string
  /** Sequential 1-based index within the current task. */
  index: number
  /** Human-readable label, e.g. "Open Terminal" */
  label: string
  /** Outcome after execution. */
  outcome?: 'failure' | 'pending_approval' | 'rejected' | 'reroute_required' | 'skipped' | 'success'
  /** Short explanation of the outcome. */
  outcomeReason?: string
  /** ISO timestamp when started. */
  startedAt?: string
  /** Stable unique id for binding/recovery (e.g. "step_<uuid>"). */
  stepId: string
  /** MCP tool invoked, e.g. "desktop_open_app" */
  toolName?: string
}

// ---------------------------------------------------------------------------
// State Manager
// ---------------------------------------------------------------------------

export class RunStateManager {
  private state: RunState

  constructor() {
    this.state = {
      lastApprovalRejected: false,
      pendingApprovalCount: 0,
      ptyApprovalGrants: [],
      ptyAuditLog: [],
      ptySessions: [],
      updatedAt: new Date().toISOString(),
      workflowStepTerminalBindings: [],
    }
  }

  /** Bind a workflow step to a terminal surface/session. */
  addStepTerminalBinding(binding: WorkflowStepTerminalBinding): void {
    // Replace existing binding for same taskId+stepId
    this.state.workflowStepTerminalBindings = this.state.workflowStepTerminalBindings.filter(
      b => b.taskId !== binding.taskId || b.stepId !== binding.stepId,
    )
    this.state.workflowStepTerminalBindings.push(binding)
    this.touch()
  }

  // -- Desktop context updates -------------------------------------------

  advanceTaskStep(step: TaskStep) {
    if (this.state.activeTask) {
      this.state.activeTask.steps.push(step)
      this.state.activeTask.currentStepIndex = this.state.activeTask.steps.length - 1
      this.touch()
    }
  }

  /** Append a PTY audit entry. */
  appendPtyAudit(entry: Omit<PtyAuditEntry, 'at'>): void {
    this.state.ptyAuditLog.push({
      ...entry,
      at: new Date().toISOString(),
    })
    this.touch()
  }

  /** Bind a PTY session to a workflow step label (legacy compat). */
  bindPtySessionToStep(sessionId: string, stepLabel: string): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.boundWorkflowStepLabel = stepLabel
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

  /**
   * Clear the Chrome session (e.g. on session end or Chrome crash).
   */
  clearChromeSession(): void {
    this.state.chromeSession = undefined
    this.state.previousUserForegroundApp = undefined
    this.touch()
  }

  /**
   * Clear the desktop session.
   */
  clearDesktopSession(): void {
    this.state.desktopSession = undefined
    this.touch()
  }

  /**
   * Clear desktop grounding state when the snapshot becomes invalid.
   */
  clearGroundingState(): void {
    this.state.lastGroundingSnapshot = undefined
    this.state.lastPointerIntent = undefined
    this.state.lastClickedCandidateId = undefined
    this.touch()
  }

  clearTask() {
    this.state.activeTask = undefined
    this.touch()
  }

  clearTaskMemory() {
    this.state.taskMemory = undefined
    this.touch()
  }

  /** Clear all bindings for a given task. */
  clearTaskTerminalBindings(taskId: string): void {
    this.state.workflowStepTerminalBindings = this.state.workflowStepTerminalBindings.filter(
      b => b.taskId !== taskId,
    )
    this.touch()
  }

  // -- Terminal context updates ------------------------------------------

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

  // -- Screenshot context updates ----------------------------------------

  /** Get all active PTY grants. */
  getActivePtyGrants(): readonly PtyApprovalGrant[] {
    return this.state.ptyApprovalGrants.filter(g => g.active)
  }

  /** Get the active PTY session id. */
  getActivePtySessionId(): string | undefined {
    return this.state.activePtySessionId
  }

  // -- Approval context updates ------------------------------------------

  /** Get audit entries for a specific PTY session. */
  getPtyAuditForSession(ptySessionId: string): PtyAuditEntry[] {
    return this.state.ptyAuditLog.filter(e => e.ptySessionId === ptySessionId)
  }

  /** Get all PTY audit entries. */
  getPtyAuditLog(): readonly PtyAuditEntry[] {
    return this.state.ptyAuditLog
  }

  /** Get all PTY sessions. */
  getPtySessions(): readonly PtySessionState[] {
    return this.state.ptySessions
  }

  // -- Task context updates ----------------------------------------------

  /** Get the most recent surface decision. */
  getRecentSurfaceDecision(): SurfaceDecision | undefined {
    return this.state.recentSurfaceDecision
  }

  /** Return a readonly snapshot of the current run state. */
  getState(): Readonly<RunState> {
    return { ...this.state }
  }

  /** Look up the terminal binding for a task+step. */
  getStepTerminalBinding(taskId: string, stepId: string): undefined | WorkflowStepTerminalBinding {
    return this.state.workflowStepTerminalBindings.find(
      b => b.taskId === taskId && b.stepId === stepId,
    )
  }

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
        active: true,
        approvalSessionId,
        grantedAt: new Date().toISOString(),
        ptySessionId,
      })
    }
    this.touch()
  }

  /** Whether there is a task currently in progress. */
  hasActiveTask(): boolean {
    return !!this.state.activeTask
      && this.state.activeTask.phase !== 'completed'
      && this.state.activeTask.phase !== 'failed'
  }

  // -- Desktop grounding updates -----------------------------------------

  /** Check if a PTY session has an active grant in the given approval session. */
  hasPtyApprovalGrant(approvalSessionId: string, ptySessionId: string): boolean {
    return this.state.ptyApprovalGrants.some(
      g => g.approvalSessionId === approvalSessionId
        && g.ptySessionId === ptySessionId
        && g.active,
    )
  }

  /** Whether the system believes the correct app is in front. */
  isAppInForeground(appName: string): boolean {
    if (!this.state.activeApp)
      return false
    return appNamesMatch(this.state.activeApp, appName)
  }

  /** Whether the runner is in a healthy state for mutations. */
  isReadyForMutations(): boolean {
    if (!this.state.executionTarget)
      return false
    return !this.state.executionTarget.tainted
  }

  // -- Chrome Session updates ---------------------------------------------

  /** Whether the last terminal command succeeded (exit 0). */
  lastTerminalSucceeded(): boolean {
    return this.state.lastTerminalResult?.exitCode === 0
  }

  recordApprovalOutcome(rejected: boolean, reason?: string) {
    this.state.lastApprovalRejected = rejected
    this.state.lastRejectionReason = rejected ? reason : undefined
    this.touch()
  }

  /** Record the most recent surface routing decision. */
  recordSurfaceDecision(decision: Omit<SurfaceDecision, 'at'>): void {
    this.state.recentSurfaceDecision = {
      ...decision,
      at: new Date().toISOString(),
    }
    this.touch()
  }

  // -- Desktop Session updates --------------------------------------------

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

  /** Revoke all grants for an approval session (session end). */
  revokeApprovalSession(approvalSessionId: string): void {
    for (const g of this.state.ptyApprovalGrants) {
      if (g.approvalSessionId === approvalSessionId) {
        g.active = false
      }
    }
    this.touch()
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

  /**
   * Remember the user's foreground app before agent takes over.
   */
  savePreviousUserForeground(appName: string): void {
    this.state.previousUserForegroundApp = appName
    this.touch()
  }

  // -- Task memory updates ------------------------------------------------

  setPendingApprovalCount(count: number) {
    this.state.pendingApprovalCount = count
    this.touch()
  }

  setScreenshotSummary(summary: string) {
    this.state.lastScreenshotSummary = summary
    this.touch()
  }

  // -- PTY session lifecycle ---------------------------------------------

  startTask(task: ActiveTask) {
    this.state.activeTask = task
    this.touch()
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

  /** Remove a PTY session from the registry (after destroy). */
  unregisterPtySession(sessionId: string): void {
    this.state.ptySessions = this.state.ptySessions.filter(s => s.id !== sessionId)
    if (this.state.activePtySessionId === sessionId) {
      this.state.activePtySessionId = this.state.ptySessions[0]?.id
    }
    this.touch()
  }

  updateBrowserSurfaceAvailability(availability: BrowserSurfaceAvailability) {
    this.state.browserSurfaceAvailability = availability
    this.touch()
  }

  /**
   * Store the agent's Chrome session info.
   * Called after ChromeSessionManager.ensureAgentWindow() succeeds.
   */
  updateChromeSession(info: ChromeSessionInfo): void {
    this.state.chromeSession = info
    this.touch()
  }

  /**
   * Update the agent's desktop session.
   */
  updateDesktopSession(session: DesktopSession): void {
    this.state.desktopSession = session
    this.touch()
  }

  updateDisplayInfo(info: DisplayInfo) {
    this.state.displayInfo = info
    this.touch()
  }

  updateExecutionTarget(target: ExecutionTarget) {
    this.state.executionTarget = target
    this.touch()
  }

  updateForegroundContext(ctx: ForegroundContext) {
    this.state.foregroundContext = ctx
    this.state.activeApp = ctx.appName
    this.state.activeWindowTitle = ctx.windowTitle
    this.touch()
  }

  // -- Terminal lane: surface decision ------------------------------------

  /**
   * Store a fresh desktop grounding snapshot from `desktop_observe`.
   * A new observe invalidates the duplicate-click guard.
   */
  updateGroundingSnapshot(snapshot: import('./desktop-grounding-types').DesktopGroundingSnapshot): void {
    this.state.lastGroundingSnapshot = snapshot
    this.state.lastClickedCandidateId = undefined
    this.touch()
  }

  updateInferredLane(lane: ToolLane): void {
    this.state.inferredActiveLane = lane
    this.touch()
  }

  // -- Terminal lane: step bindings --------------------------------------

  updateLastScreenshot(info: LastScreenshotInfo, summary?: string) {
    this.state.lastScreenshot = info
    if (summary !== undefined) {
      this.state.lastScreenshotSummary = summary
    }
    this.touch()
  }

  /**
   * Store the last pointer snap intent and, optionally, the clicked candidate id
   * once an execution path has actually succeeded.
   */
  updatePointerIntent(intent: import('./desktop-grounding-types').PointerIntent, candidateId?: string): void {
    this.state.lastPointerIntent = intent
    if (candidateId !== undefined) {
      this.state.lastClickedCandidateId = candidateId
    }
    this.touch()
  }

  updatePolicyDecision(decision: PolicyDecision) {
    this.state.lastPolicyDecision = decision
    this.touch()
  }

  // -- Terminal lane: PTY Open Grant -------------------------------------

  /** Update the alive status of a PTY session (e.g. after process exit). */
  updatePtySessionAlive(sessionId: string, alive: boolean): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.alive = alive
      this.touch()
    }
  }

  /** Update the last observed cwd of a PTY session from terminal prompt heuristics. */
  updatePtySessionObservedCwd(sessionId: string, cwd: string): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry && entry.observedCwd !== cwd) {
      entry.observedCwd = cwd
      this.touch()
    }
  }

  updateTaskMemory(tm: TaskMemory) {
    this.state.taskMemory = tm
    this.touch()
  }

  updateTaskPhase(phase: TaskPhase) {
    if (this.state.activeTask) {
      this.state.activeTask.phase = phase
      this.touch()
    }
  }

  updateTerminalResult(result: TerminalCommandResult) {
    this.state.lastTerminalResult = result
    this.state.terminalState = {
      effectiveCwd: result.effectiveCwd,
      lastCommandSummary: result.command.length > 160
        ? `${result.command.slice(0, 157)}...`
        : result.command,
      lastExitCode: result.exitCode,
    }
    this.touch()
  }

  // -- Terminal lane: PTY audit ------------------------------------------

  updateTerminalState(ts: TerminalState) {
    this.state.terminalState = ts
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

  updateVscodeCurrentFile(file: { column?: number, filePath: string, line?: number }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      currentFile: file,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  // -- Helpers -----------------------------------------------------------

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

  updateVscodeTaskResult(task: { command: string, cwd: string, exitCode: number }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      lastTask: task,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeWorkspace(workspacePath: string) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      updatedAt: new Date().toISOString(),
      workspacePath,
    }
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

  private touch() {
    this.state.updatedAt = new Date().toISOString()
  }
}
