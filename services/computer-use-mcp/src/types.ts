export type ApprovalMode = 'never' | 'actions' | 'all'
export type ExecutorKind = 'dry-run' | 'macos-local' | 'linux-x11'
export type ExecutionMode = 'dry-run' | 'local-windowed' | 'remote'
export type ExecutionTransport = 'local' | 'ssh-stdio'
export type RiskLevel = 'low' | 'medium' | 'high'
export type MouseButton = 'left' | 'right' | 'middle'
export type ActionKind
  = | 'screenshot'
    | 'observe_windows'
    | 'desktop_observe'
    | 'desktop_click_target'
    | 'open_app'
    | 'focus_app'
    | 'secret_read_env_value'
    | 'clipboard_read_text'
    | 'clipboard_write_text'
    | 'click'
    | 'type_text'
    | 'press_keys'
    | 'scroll'
    | 'wait'
    | 'terminal_exec'
    | 'terminal_reset'
export type ApprovalGrantScope = 'terminal_and_apps' | 'pty_session'

// ---------------------------------------------------------------------------
// Terminal lane — formal surface / transport split
// ---------------------------------------------------------------------------

/** Which terminal surface a step/tool targets. */
export type TerminalSurface = 'exec' | 'pty' | 'vscode' | null

/**
 * How bytes actually reach the OS process.
 * v1: `vscode` always uses `exec` transport — no vscode+pty combo.
 */
export type TerminalTransport = 'exec' | 'pty' | null

/** Persisted decision for the most recent surface routing. */
export interface SurfaceDecision {
  surface: TerminalSurface
  transport: TerminalTransport
  /** Why this surface was chosen. */
  reason: string
  /** Where the decision originated (e.g. 'strategy', 'workflow_reroute'). */
  source: string
  /** ISO timestamp. */
  at: string
}

/** Binds a workflow step to a terminal session. */
export interface WorkflowStepTerminalBinding {
  taskId: string
  stepId: string
  surface: TerminalSurface
  ptySessionId?: string
}

/** Open Grant record for a PTY session. */
export interface PtyApprovalGrant {
  approvalSessionId: string
  ptySessionId: string
  /** ISO timestamp when the grant was created. */
  grantedAt: string
  /** Whether the grant is still active. */
  active: boolean
}

/** Minimal audit record for a PTY operation. */
export interface PtyAuditEntry {
  taskId?: string
  stepId?: string
  ptySessionId: string
  event: 'create' | 'send_input' | 'read_screen' | 'resize' | 'destroy'
  /** ISO timestamp. */
  at: string
  // create
  cwd?: string
  rows?: number
  cols?: number
  pid?: number
  // send_input
  byteCount?: number
  inputPreview?: string
  // read_screen
  returnedLineCount?: number
  alive?: boolean
  // destroy
  actor?: string
  outcome?: string
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplaySize {
  width: number
  height: number
}

export interface ExecutionTarget {
  mode: ExecutionMode
  transport: ExecutionTransport
  hostName: string
  remoteUser?: string
  displayId?: string
  sessionTag?: string
  isolated: boolean
  tainted: boolean
  note?: string
}

export interface ForegroundContext {
  available: boolean
  appName?: string
  windowTitle?: string
  windowBounds?: Bounds
  platform: NodeJS.Platform
  unavailableReason?: string
  /** Whether the current foreground app is agent-owned (launched/managed by the agent). */
  agentOwned?: boolean
  /** PID of the agent-owned window (if any). */
  agentWindowPid?: number
}

/**
 * State of the agent's dedicated Chrome session.
 *
 * Created by `ChromeSessionManager.ensureAgentWindow()` and persisted in
 * `RunState.chromeSession` for the lifetime of the agent session.
 */
export interface ChromeSessionInfo {
  /** Whether Chrome was already running before the agent launched it. */
  wasAlreadyRunning: boolean
  /** Window identity string from observe-windows (ownerPid:layer:title). */
  windowId: string
  /** CDP WebSocket URL if Chrome was launched with --remote-debugging-port. */
  cdpUrl?: string
  /** Chrome process PID. */
  pid: number
  /** Whether the agent started this Chrome instance. */
  agentOwned: boolean
  /** The URL navigated to (if any). */
  initialUrl?: string
  /** ISO timestamp of session creation. */
  createdAt: string
}

export interface WindowInfo {
  id: string
  appName: string
  title?: string
  bounds?: Bounds
  ownerPid?: number
  layer?: number
  isOnScreen?: boolean
}

export interface WindowObservation {
  frontmostAppName?: string
  frontmostWindowTitle?: string
  windows: WindowInfo[]
  observedAt: string
}

export interface ScreenshotArtifact {
  dataBase64: string
  mimeType: 'image/png'
  path: string
  publicUrl?: string
  observationRef?: string
  width?: number
  height?: number
  capturedAt?: string
  placeholder?: boolean
  note?: string
  executionTargetMode?: ExecutionMode
  sourceHostName?: string
  sourceDisplayId?: string
  sourceSessionTag?: string
}

export interface PointerTracePoint {
  x: number
  y: number
  delayMs: number
}

export interface ClickActionInput {
  /** Global logical screen coordinate, not Retina backing pixels. */
  x: number
  /** Global logical screen coordinate, not Retina backing pixels. */
  y: number
  button?: MouseButton
  clickCount?: number
  captureAfter?: boolean
}

export interface TypeTextActionInput {
  text: string
  /** Optional global logical screen coordinate to focus before typing. */
  x?: number
  /** Optional global logical screen coordinate to focus before typing. */
  y?: number
  pressEnter?: boolean
  captureAfter?: boolean
}

export interface PressKeysActionInput {
  keys: string[]
  captureAfter?: boolean
}

export interface ScrollActionInput {
  /** Optional global logical screen coordinate to move to before scrolling. */
  x?: number
  /** Optional global logical screen coordinate to move to before scrolling. */
  y?: number
  deltaX?: number
  deltaY: number
  captureAfter?: boolean
}

export interface WaitActionInput {
  durationMs: number
  captureAfter?: boolean
}

export interface ObserveWindowsRequest {
  limit?: number
  app?: string
}

export interface OpenAppActionInput {
  app: string
}

export interface FocusAppActionInput {
  app: string
}

export interface ClipboardReadTextActionInput {
  maxLength?: number
  trim?: boolean
}

export interface SecretReadEnvValueActionInput {
  filePath: string
  keys: string[]
  allowPlaceholder?: boolean
}

export interface ClipboardWriteTextActionInput {
  text: string
}

export interface DesktopObserveInput {
  includeChrome?: boolean
}

export interface DesktopClickTargetInput {
  candidateId: string
  clickCount?: number
  button?: MouseButton
}

export interface DesktopEnsureChromeApprovalInput {
  url?: string
  cdpPort?: number
}

export interface ScreenshotRequest {
  label?: string
}

export interface TerminalExecActionInput {
  command: string
  cwd?: string
  timeoutMs?: number
}

export interface TerminalResetActionInput {
  reason?: string
}

export interface PtyCreateApprovalInput {
  rows?: number
  cols?: number
  cwd?: string
  stepId?: string
  workflowStepLabel?: string
  approvalSessionId?: string
}

export interface TerminalCommandResult {
  command: string
  stdout: string
  stderr: string
  stdoutTruncated?: boolean
  stderrTruncated?: boolean
  stdoutOriginalLength?: number
  stderrOriginalLength?: number
  exitCode: number
  effectiveCwd: string
  durationMs: number
  timedOut: boolean
}

export interface TerminalState {
  effectiveCwd: string
  lastExitCode?: number
  lastCommandSummary?: string
  approvalSessionActive?: boolean
  approvalGrantedScope?: ApprovalGrantScope
}

export interface VscodeProblem {
  file: string
  line: number
  column: number
  severity: string
  code: string
  message: string
}

export interface VscodeControllerState {
  codeCli?: {
    cli: string
    path: string
  }
  workspacePath?: string
  currentFile?: {
    filePath: string
    line?: number
    column?: number
  }
  lastTask?: {
    command: string
    cwd: string
    exitCode: number
  }
  lastProblems?: {
    command: string
    cwd: string
    problemCount: number
    problems: VscodeProblem[]
  }
  updatedAt: string
}

export interface TestTargetLaunchResult {
  launched: boolean
  appName: string
  windowTitle?: string
  recommendedClickPoint: { x: number, y: number }
  executionTarget: ExecutionTarget
}

export type ActionInvocation
  = | { kind: 'screenshot', input: ScreenshotRequest }
    | { kind: 'observe_windows', input: ObserveWindowsRequest }
    | { kind: 'desktop_observe', input: DesktopObserveInput }
    | { kind: 'desktop_click_target', input: DesktopClickTargetInput }
    | { kind: 'open_app', input: OpenAppActionInput }
    | { kind: 'focus_app', input: FocusAppActionInput }
    | { kind: 'secret_read_env_value', input: SecretReadEnvValueActionInput }
    | { kind: 'clipboard_read_text', input: ClipboardReadTextActionInput }
    | { kind: 'clipboard_write_text', input: ClipboardWriteTextActionInput }
    | { kind: 'click', input: ClickActionInput }
    | { kind: 'type_text', input: TypeTextActionInput }
    | { kind: 'press_keys', input: PressKeysActionInput }
    | { kind: 'scroll', input: ScrollActionInput }
    | { kind: 'wait', input: WaitActionInput }
    | { kind: 'terminal_exec', input: TerminalExecActionInput }
    | { kind: 'terminal_reset', input: TerminalResetActionInput }

export type PendingExecutableAction
  = | ActionInvocation
    | { kind: 'desktop_ensure_chrome', input: DesktopEnsureChromeApprovalInput }
    | { kind: 'pty_create', input: PtyCreateApprovalInput }

export interface PolicyDecision {
  allowed: boolean
  requiresApproval: boolean
  reason?: string
  reasons: string[]
  riskLevel: RiskLevel
  estimatedOperationUnits: number
}

export interface SessionTraceEntry {
  id: string
  at: string
  event: 'requested' | 'approval_required' | 'approved' | 'rejected' | 'executed' | 'denied' | 'failed'
  toolName: string
  action: PendingExecutableAction
  context: ForegroundContext
  policy: PolicyDecision
  result?: Record<string, unknown>
}

export interface PendingActionRecord {
  id: string
  createdAt: string
  toolName: string
  action: PendingExecutableAction
  policy: PolicyDecision
  context: ForegroundContext
}

export interface LaunchContext {
  hostName: string
  sessionTag?: string
  pid: number
  ppid: number
  processTitle: string
  argv: string[]
  launchHostProcess: string
  permissionChainHint: string
}

export interface DisplayInfo {
  available: boolean
  platform: NodeJS.Platform
  logicalWidth?: number
  logicalHeight?: number
  pixelWidth?: number
  pixelHeight?: number
  scaleFactor?: number
  isRetina?: boolean
  displayCount?: number
  displays?: Array<{
    displayId: number
    isMain: boolean
    isBuiltIn: boolean
    bounds: Bounds
    visibleBounds: Bounds
    scaleFactor: number
    pixelWidth: number
    pixelHeight: number
  }>
  combinedBounds?: Bounds
  capturedAt?: string
  note?: string
}

export type PermissionStatus = 'granted' | 'missing' | 'unknown' | 'unsupported'

export interface PermissionProbe {
  status: PermissionStatus
  target: string
  checkedBy?: string
  note?: string
}

export interface PermissionInfo {
  screenRecording: PermissionProbe
  accessibility: PermissionProbe
  automationToSystemEvents: PermissionProbe
}

export interface LastScreenshotInfo {
  path: string
  width?: number
  height?: number
  capturedAt?: string
  placeholder: boolean
  note?: string
  executionTargetMode?: ExecutionMode
  sourceHostName?: string
  sourceDisplayId?: string
  sourceSessionTag?: string
}

export interface CoordinateSpaceInfo {
  readyForMutations: boolean
  aligned?: boolean
  reason: string
  allowedBounds?: Bounds
  lastScreenshot?: LastScreenshotInfo
}

export interface BrowserDomBridgeConfig {
  enabled: boolean
  host: string
  port: number
  requestTimeoutMs: number
}

export interface BrowserDomBridgeHello {
  source?: string
  version?: string
  connectedAt?: string
}

export interface BrowserDomBridgeStatus {
  enabled: boolean
  host: string
  port: number
  connected: boolean
  pendingRequests: number
  lastHello?: BrowserDomBridgeHello
  lastError?: string
}

export type BrowserSurfaceKind = 'browser_dom' | 'browser_cdp'

export interface BrowserSurfaceAvailability {
  executionMode: ExecutionMode
  suitable: boolean
  availableSurfaces: BrowserSurfaceKind[]
  preferredSurface?: BrowserSurfaceKind
  selectedToolName?: 'browser_dom_read_page' | 'browser_cdp_collect_elements'
  reason: string
  extension: {
    enabled: boolean
    connected: boolean
    lastError?: string
  }
  cdp: {
    endpoint: string
    connected: boolean
    connectable: boolean
    lastError?: string
  }
}

export interface BrowserDomInteractiveElement {
  tag?: string
  id?: string
  name?: string
  type?: string
  className?: string
  text?: string
  value?: string
  href?: string
  placeholder?: string
  role?: string
  disabled?: boolean
  checked?: boolean
  visible?: boolean
  rect?: {
    x: number
    y: number
    w: number
    h: number
  }
  center?: {
    x: number
    y: number
  }
}

export interface BrowserDomFrameDom {
  url?: string
  title?: string
  frameName?: string
  frameOffset?: {
    x: number
    y: number
  }
  frameOffsetInParent?: {
    x: number
    y: number
  }
  bodyText?: string
  frameRect?: {
    x: number
    y: number
    w: number
    h: number
  }
  interactiveElements?: BrowserDomInteractiveElement[]
}

export interface BrowserDomFrameResult<T = unknown> {
  frameId: number
  result: T
}

export interface ComputerUseConfig {
  sessionRoot: string
  screenshotsDir: string
  auditLogPath: string
  executor: ExecutorKind
  approvalMode: ApprovalMode
  defaultCaptureAfter: boolean
  maxOperations: number
  maxOperationUnits: number
  maxPendingActions: number
  allowedBounds?: Bounds
  allowApps: string[]
  denyApps: string[]
  denyWindowTitles: string[]
  openableApps: string[]
  timeoutMs: number
  sessionTag?: string
  launchHostProcess: string
  permissionChainHint: string
  requireSessionTagForMutatingActions: boolean
  requireAllowedBoundsForMutatingActions: boolean
  requireCoordinateAlignmentForMutatingActions: boolean
  terminalShell: string
  remoteSshHost?: string
  remoteSshUser?: string
  remoteSshPort: number
  remoteRunnerCommand: string
  remoteDisplaySize: DisplaySize
  remoteObservationBaseUrl?: string
  remoteObservationServePort?: number
  remoteObservationToken?: string
  browserDomBridge: BrowserDomBridgeConfig
  binaries: {
    swift: string
    osascript: string
    screencapture: string
    pbcopy: string
    pbpaste: string
    ssh: string
    tar: string
    open: string
  }
}

export interface ExecutorActionResult {
  performed: boolean
  backend: ExecutorKind
  notes: string[]
  pointerTrace?: PointerTracePoint[]
  executionTarget?: ExecutionTarget
}

export interface DesktopExecutor {
  kind: ExecutorKind
  describe: () => { kind: ExecutorKind, notes: string[] }
  getExecutionTarget: () => Promise<ExecutionTarget>
  getForegroundContext: () => Promise<ForegroundContext>
  getDisplayInfo: () => Promise<DisplayInfo>
  getPermissionInfo: () => Promise<PermissionInfo>
  observeWindows: (request: ObserveWindowsRequest) => Promise<WindowObservation>
  takeScreenshot: (request: ScreenshotRequest) => Promise<ScreenshotArtifact>
  openApp: (input: OpenAppActionInput) => Promise<ExecutorActionResult>
  focusApp: (input: FocusAppActionInput) => Promise<ExecutorActionResult>
  click: (input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => Promise<ExecutorActionResult>
  typeText: (input: TypeTextActionInput) => Promise<ExecutorActionResult>
  pressKeys: (input: PressKeysActionInput) => Promise<ExecutorActionResult>
  scroll: (input: ScrollActionInput) => Promise<ExecutorActionResult>
  wait: (input: WaitActionInput) => Promise<ExecutorActionResult>
  openTestTarget?: () => Promise<TestTargetLaunchResult>
  close?: () => Promise<void>
}

export interface TerminalRunner {
  describe: () => { kind: 'local-shell-runner', notes: string[] }
  execute: (input: TerminalExecActionInput) => Promise<TerminalCommandResult>
  getState: () => TerminalState
  resetState: (reason?: string) => TerminalState
}
