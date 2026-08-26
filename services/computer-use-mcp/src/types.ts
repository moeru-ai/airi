export type ActionInvocation
  = | { input: ClickActionInput, kind: 'click' }
    | { input: ClipboardReadTextActionInput, kind: 'clipboard_read_text' }
    | { input: ClipboardWriteTextActionInput, kind: 'clipboard_write_text' }
    | { input: DesktopClickTargetInput, kind: 'desktop_click_target' }
    | { input: DesktopObserveInput, kind: 'desktop_observe' }
    | { input: FocusAppActionInput, kind: 'focus_app' }
    | { input: ObserveWindowsRequest, kind: 'observe_windows' }
    | { input: OpenAppActionInput, kind: 'open_app' }
    | { input: PressKeysActionInput, kind: 'press_keys' }
    | { input: ScreenshotRequest, kind: 'screenshot' }
    | { input: ScrollActionInput, kind: 'scroll' }
    | { input: SecretReadEnvValueActionInput, kind: 'secret_read_env_value' }
    | { input: TerminalExecActionInput, kind: 'terminal_exec' }
    | { input: TerminalResetActionInput, kind: 'terminal_reset' }
    | { input: TypeTextActionInput, kind: 'type_text' }
    | { input: WaitActionInput, kind: 'wait' }
export type ActionKind
  = | 'click'
    | 'clipboard_read_text'
    | 'clipboard_write_text'
    | 'desktop_click_target'
    | 'desktop_observe'
    | 'focus_app'
    | 'observe_windows'
    | 'open_app'
    | 'press_keys'
    | 'screenshot'
    | 'scroll'
    | 'secret_read_env_value'
    | 'terminal_exec'
    | 'terminal_reset'
    | 'type_text'
    | 'wait'
export type ApprovalGrantScope = 'pty_session' | 'terminal_and_apps'
export type ApprovalMode = 'actions' | 'all' | 'never'
export interface Bounds {
  height: number
  width: number
  x: number
  y: number
}
export interface BrowserDomBridgeConfig {
  enabled: boolean
  host: string
  port: number
  requestTimeoutMs: number
}
export interface BrowserDomBridgeHello {
  connectedAt?: string
  source?: string
  version?: string
}
export interface BrowserDomBridgeStatus {
  connected: boolean
  enabled: boolean
  host: string
  lastError?: string
  lastHello?: BrowserDomBridgeHello
  pendingRequests: number
  port: number
}

// ---------------------------------------------------------------------------
// Terminal lane — formal surface / transport split
// ---------------------------------------------------------------------------

export interface BrowserDomFrameDom {
  bodyText?: string
  frameName?: string
  frameOffset?: {
    x: number
    y: number
  }
  frameOffsetInParent?: {
    x: number
    y: number
  }
  frameRect?: {
    h: number
    w: number
    x: number
    y: number
  }
  interactiveElements?: BrowserDomInteractiveElement[]
  title?: string
  url?: string
}

export interface BrowserDomFrameResult<T = unknown> {
  frameId: number
  result: T
}

export interface BrowserDomInteractiveElement {
  center?: {
    x: number
    y: number
  }
  checked?: boolean
  className?: string
  disabled?: boolean
  href?: string
  id?: string
  name?: string
  placeholder?: string
  rect?: {
    h: number
    w: number
    x: number
    y: number
  }
  role?: string
  tag?: string
  text?: string
  type?: string
  value?: string
  visible?: boolean
}

export interface BrowserSurfaceAvailability {
  availableSurfaces: BrowserSurfaceKind[]
  cdp: {
    connectable: boolean
    connected: boolean
    endpoint: string
    lastError?: string
  }
  executionMode: ExecutionMode
  extension: {
    connected: boolean
    enabled: boolean
    lastError?: string
  }
  preferredSurface?: BrowserSurfaceKind
  reason: string
  selectedToolName?: 'browser_cdp_collect_elements' | 'browser_dom_read_page'
  suitable: boolean
}

export type BrowserSurfaceKind = 'browser_cdp' | 'browser_dom'

/**
 * State of the agent's dedicated Chrome session.
 *
 * Created by `ChromeSessionManager.ensureAgentWindow()` and persisted in
 * `RunState.chromeSession` for the lifetime of the agent session.
 */
export interface ChromeSessionInfo {
  /** Whether the agent started this Chrome instance. */
  agentOwned: boolean
  /** CDP WebSocket URL if Chrome was launched with --remote-debugging-port. */
  cdpUrl?: string
  /** ISO timestamp of session creation. */
  createdAt: string
  /** The URL navigated to (if any). */
  initialUrl?: string
  /** Chrome process PID. */
  pid: number
  /** Whether Chrome was already running before the agent launched it. */
  wasAlreadyRunning: boolean
  /** Window identity string from observe-windows (ownerPid:layer:title). */
  windowId: string
}

export interface ClickActionInput {
  button?: MouseButton
  captureAfter?: boolean
  clickCount?: number
  /** Global logical screen coordinate, not Retina backing pixels. */
  x: number
  /** Global logical screen coordinate, not Retina backing pixels. */
  y: number
}

export interface ClipboardReadTextActionInput {
  maxLength?: number
  trim?: boolean
}

export interface ClipboardWriteTextActionInput {
  text: string
}

export interface ComputerUseConfig {
  allowApps: string[]
  allowedBounds?: Bounds
  approvalMode: ApprovalMode
  auditLogPath: string
  binaries: {
    open: string
    osascript: string
    pbcopy: string
    pbpaste: string
    screencapture: string
    ssh: string
    swift: string
    tar: string
  }
  browserDomBridge: BrowserDomBridgeConfig
  defaultCaptureAfter: boolean
  denyApps: string[]
  denyWindowTitles: string[]
  executor: ExecutorKind
  launchHostProcess: string
  maxOperations: number
  maxOperationUnits: number
  maxPendingActions: number
  openableApps: string[]
  permissionChainHint: string
  remoteDisplaySize: DisplaySize
  remoteObservationBaseUrl?: string
  remoteObservationServePort?: number
  remoteObservationToken?: string
  remoteRunnerCommand: string
  remoteSshHost?: string
  remoteSshPort: number
  remoteSshUser?: string
  requireAllowedBoundsForMutatingActions: boolean
  requireCoordinateAlignmentForMutatingActions: boolean
  requireSessionTagForMutatingActions: boolean
  screenshotsDir: string
  sessionRoot: string
  sessionTag?: string
  terminalShell: string
  timeoutMs: number
}

export interface CoordinateSpaceInfo {
  aligned?: boolean
  allowedBounds?: Bounds
  lastScreenshot?: LastScreenshotInfo
  readyForMutations: boolean
  reason: string
}

export interface DesktopClickTargetInput {
  button?: MouseButton
  candidateId: string
  clickCount?: number
}

export interface DesktopEnsureChromeApprovalInput {
  cdpPort?: number
  url?: string
}

export interface DesktopExecutor {
  click: (input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => Promise<ExecutorActionResult>
  close?: () => Promise<void>
  describe: () => { kind: ExecutorKind, notes: string[] }
  focusApp: (input: FocusAppActionInput) => Promise<ExecutorActionResult>
  getDisplayInfo: () => Promise<DisplayInfo>
  getExecutionTarget: () => Promise<ExecutionTarget>
  getForegroundContext: () => Promise<ForegroundContext>
  getPermissionInfo: () => Promise<PermissionInfo>
  kind: ExecutorKind
  observeWindows: (request: ObserveWindowsRequest) => Promise<WindowObservation>
  openApp: (input: OpenAppActionInput) => Promise<ExecutorActionResult>
  openTestTarget?: () => Promise<TestTargetLaunchResult>
  pressKeys: (input: PressKeysActionInput) => Promise<ExecutorActionResult>
  scroll: (input: ScrollActionInput) => Promise<ExecutorActionResult>
  takeScreenshot: (request: ScreenshotRequest) => Promise<ScreenshotArtifact>
  typeText: (input: TypeTextActionInput) => Promise<ExecutorActionResult>
  wait: (input: WaitActionInput) => Promise<ExecutorActionResult>
}

export interface DesktopObserveInput {
  includeChrome?: boolean
}

export interface DisplayInfo {
  available: boolean
  capturedAt?: string
  combinedBounds?: Bounds
  displayCount?: number
  displays?: Array<{
    bounds: Bounds
    displayId: number
    isBuiltIn: boolean
    isMain: boolean
    pixelHeight: number
    pixelWidth: number
    scaleFactor: number
    visibleBounds: Bounds
  }>
  isRetina?: boolean
  logicalHeight?: number
  logicalWidth?: number
  note?: string
  pixelHeight?: number
  pixelWidth?: number
  platform: NodeJS.Platform
  scaleFactor?: number
}

export interface DisplaySize {
  height: number
  width: number
}

export type ExecutionMode = 'dry-run' | 'local-windowed' | 'remote'

export interface ExecutionTarget {
  displayId?: string
  hostName: string
  isolated: boolean
  mode: ExecutionMode
  note?: string
  remoteUser?: string
  sessionTag?: string
  tainted: boolean
  transport: ExecutionTransport
}

export type ExecutionTransport = 'local' | 'ssh-stdio'

export interface ExecutorActionResult {
  backend: ExecutorKind
  executionTarget?: ExecutionTarget
  notes: string[]
  performed: boolean
  pointerTrace?: PointerTracePoint[]
}

export type ExecutorKind = 'dry-run' | 'linux-x11' | 'macos-local'

export interface FocusAppActionInput {
  app: string
}

export interface ForegroundContext {
  /** Whether the current foreground app is agent-owned (launched/managed by the agent). */
  agentOwned?: boolean
  /** PID of the agent-owned window (if any). */
  agentWindowPid?: number
  appName?: string
  available: boolean
  platform: NodeJS.Platform
  unavailableReason?: string
  windowBounds?: Bounds
  windowTitle?: string
}

export interface LastScreenshotInfo {
  capturedAt?: string
  executionTargetMode?: ExecutionMode
  height?: number
  note?: string
  path: string
  placeholder: boolean
  sourceDisplayId?: string
  sourceHostName?: string
  sourceSessionTag?: string
  width?: number
}

export interface LaunchContext {
  argv: string[]
  hostName: string
  launchHostProcess: string
  permissionChainHint: string
  pid: number
  ppid: number
  processTitle: string
  sessionTag?: string
}

export type MouseButton = 'left' | 'middle' | 'right'

export interface ObserveWindowsRequest {
  app?: string
  limit?: number
}

export interface OpenAppActionInput {
  app: string
}

export interface PendingActionRecord {
  action: PendingExecutableAction
  context: ForegroundContext
  createdAt: string
  id: string
  policy: PolicyDecision
  toolName: string
}

export type PendingExecutableAction
  = | ActionInvocation
    | { input: DesktopEnsureChromeApprovalInput, kind: 'desktop_ensure_chrome' }
    | { input: PtyCreateApprovalInput, kind: 'pty_create' }

export interface PermissionInfo {
  accessibility: PermissionProbe
  automationToSystemEvents: PermissionProbe
  screenRecording: PermissionProbe
}

export interface PermissionProbe {
  checkedBy?: string
  note?: string
  status: PermissionStatus
  target: string
}

export type PermissionStatus = 'granted' | 'missing' | 'unknown' | 'unsupported'

export interface PointerTracePoint {
  delayMs: number
  x: number
  y: number
}

export interface PolicyDecision {
  allowed: boolean
  estimatedOperationUnits: number
  reason?: string
  reasons: string[]
  requiresApproval: boolean
  riskLevel: RiskLevel
}

export interface PressKeysActionInput {
  captureAfter?: boolean
  keys: string[]
}

/** Open Grant record for a PTY session. */
export interface PtyApprovalGrant {
  /** Whether the grant is still active. */
  active: boolean
  approvalSessionId: string
  /** ISO timestamp when the grant was created. */
  grantedAt: string
  ptySessionId: string
}

/** Minimal audit record for a PTY operation. */
export interface PtyAuditEntry {
  // destroy
  actor?: string
  alive?: boolean
  /** ISO timestamp. */
  at: string
  // send_input
  byteCount?: number
  cols?: number
  // create
  cwd?: string
  event: 'create' | 'destroy' | 'read_screen' | 'resize' | 'send_input'
  inputPreview?: string
  outcome?: string
  pid?: number
  ptySessionId: string
  // read_screen
  returnedLineCount?: number
  rows?: number
  stepId?: string
  taskId?: string
}

export interface PtyCreateApprovalInput {
  approvalSessionId?: string
  cols?: number
  cwd?: string
  rows?: number
  stepId?: string
  workflowStepLabel?: string
}

export type RiskLevel = 'high' | 'low' | 'medium'

export interface ScreenshotArtifact {
  capturedAt?: string
  dataBase64: string
  executionTargetMode?: ExecutionMode
  height?: number
  mimeType: 'image/png'
  note?: string
  observationRef?: string
  path: string
  placeholder?: boolean
  publicUrl?: string
  sourceDisplayId?: string
  sourceHostName?: string
  sourceSessionTag?: string
  width?: number
}

export interface ScreenshotRequest {
  label?: string
}

export interface ScrollActionInput {
  captureAfter?: boolean
  deltaX?: number
  deltaY: number
  /** Optional global logical screen coordinate to move to before scrolling. */
  x?: number
  /** Optional global logical screen coordinate to move to before scrolling. */
  y?: number
}

export interface SecretReadEnvValueActionInput {
  allowPlaceholder?: boolean
  filePath: string
  keys: string[]
}

export interface SessionTraceEntry {
  action: PendingExecutableAction
  at: string
  context: ForegroundContext
  event: 'approval_required' | 'approved' | 'denied' | 'executed' | 'failed' | 'rejected' | 'requested'
  id: string
  policy: PolicyDecision
  result?: Record<string, unknown>
  toolName: string
}

/** Persisted decision for the most recent surface routing. */
export interface SurfaceDecision {
  /** ISO timestamp. */
  at: string
  /** Why this surface was chosen. */
  reason: string
  /** Where the decision originated (e.g. 'strategy', 'workflow_reroute'). */
  source: string
  surface: TerminalSurface
  transport: TerminalTransport
}

export interface TerminalCommandResult {
  command: string
  durationMs: number
  effectiveCwd: string
  exitCode: number
  stderr: string
  stderrOriginalLength?: number
  stderrTruncated?: boolean
  stdout: string
  stdoutOriginalLength?: number
  stdoutTruncated?: boolean
  timedOut: boolean
}

export interface TerminalExecActionInput {
  command: string
  cwd?: string
  timeoutMs?: number
}

export interface TerminalResetActionInput {
  reason?: string
}

export interface TerminalRunner {
  describe: () => { kind: 'local-shell-runner', notes: string[] }
  execute: (input: TerminalExecActionInput) => Promise<TerminalCommandResult>
  getState: () => TerminalState
  resetState: (reason?: string) => TerminalState
}

export interface TerminalState {
  approvalGrantedScope?: ApprovalGrantScope
  approvalSessionActive?: boolean
  effectiveCwd: string
  lastCommandSummary?: string
  lastExitCode?: number
}

/** Which terminal surface a step/tool targets. */
export type TerminalSurface = 'exec' | 'pty' | 'vscode' | null

/**
 * How bytes actually reach the OS process.
 * v1: `vscode` always uses `exec` transport — no vscode+pty combo.
 */
export type TerminalTransport = 'exec' | 'pty' | null

export interface TestTargetLaunchResult {
  appName: string
  executionTarget: ExecutionTarget
  launched: boolean
  recommendedClickPoint: { x: number, y: number }
  windowTitle?: string
}

export interface TypeTextActionInput {
  captureAfter?: boolean
  pressEnter?: boolean
  text: string
  /** Optional global logical screen coordinate to focus before typing. */
  x?: number
  /** Optional global logical screen coordinate to focus before typing. */
  y?: number
}

export interface VscodeControllerState {
  codeCli?: {
    cli: string
    path: string
  }
  currentFile?: {
    column?: number
    filePath: string
    line?: number
  }
  lastProblems?: {
    command: string
    cwd: string
    problemCount: number
    problems: VscodeProblem[]
  }
  lastTask?: {
    command: string
    cwd: string
    exitCode: number
  }
  updatedAt: string
  workspacePath?: string
}

export interface VscodeProblem {
  code: string
  column: number
  file: string
  line: number
  message: string
  severity: string
}

export interface WaitActionInput {
  captureAfter?: boolean
  durationMs: number
}

export interface WindowInfo {
  appName: string
  bounds?: Bounds
  id: string
  isOnScreen?: boolean
  layer?: number
  ownerPid?: number
  title?: string
}

export interface WindowObservation {
  frontmostAppName?: string
  frontmostWindowTitle?: string
  observedAt: string
  windows: WindowInfo[]
}

/** Binds a workflow step to a terminal session. */
export interface WorkflowStepTerminalBinding {
  ptySessionId?: string
  stepId: string
  surface: TerminalSurface
  taskId: string
}
