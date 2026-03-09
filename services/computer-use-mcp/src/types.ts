export type ApprovalMode = 'never' | 'actions' | 'all'
export type ExecutorKind = 'dry-run' | 'macos-local' | 'linux-x11'
export type ExecutionMode = 'dry-run' | 'local-windowed' | 'remote'
export type ExecutionTransport = 'local' | 'ssh-stdio'
export type RiskLevel = 'low' | 'medium' | 'high'
export type MouseButton = 'left' | 'right' | 'middle'
export type ActionKind
  = | 'screenshot'
    | 'observe_windows'
    | 'open_app'
    | 'focus_app'
    | 'click'
    | 'type_text'
    | 'press_keys'
    | 'scroll'
    | 'wait'
    | 'terminal_exec'
    | 'terminal_reset'
export type ApprovalGrantScope = 'terminal_and_apps'

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
  x: number
  y: number
  button?: MouseButton
  clickCount?: number
  captureAfter?: boolean
}

export interface TypeTextActionInput {
  text: string
  x?: number
  y?: number
  pressEnter?: boolean
  captureAfter?: boolean
}

export interface PressKeysActionInput {
  keys: string[]
  captureAfter?: boolean
}

export interface ScrollActionInput {
  x?: number
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

export interface TerminalCommandResult {
  command: string
  stdout: string
  stderr: string
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
    | { kind: 'open_app', input: OpenAppActionInput }
    | { kind: 'focus_app', input: FocusAppActionInput }
    | { kind: 'click', input: ClickActionInput }
    | { kind: 'type_text', input: TypeTextActionInput }
    | { kind: 'press_keys', input: PressKeysActionInput }
    | { kind: 'scroll', input: ScrollActionInput }
    | { kind: 'wait', input: WaitActionInput }
    | { kind: 'terminal_exec', input: TerminalExecActionInput }
    | { kind: 'terminal_reset', input: TerminalResetActionInput }

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
  action: ActionInvocation
  context: ForegroundContext
  policy: PolicyDecision
  result?: Record<string, unknown>
}

export interface PendingActionRecord {
  id: string
  createdAt: string
  toolName: string
  action: ActionInvocation
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
  binaries: {
    swift: string
    osascript: string
    screencapture: string
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
