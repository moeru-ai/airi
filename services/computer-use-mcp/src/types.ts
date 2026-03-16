export type ApprovalMode = 'never' | 'actions' | 'all'
// NOTICE: `linux-x11` is a deprecated legacy remote executor kept only for the
// old SSH/X11 runner path. New work should target `macos-local` and the newer
// terminal/browser/IDE surfaces instead of extending this executor.
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
    | 'focus_window'
    | 'set_window_bounds'
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
    | 'coding_review_workspace'
    | 'coding_read_file'
    | 'coding_apply_patch'
    | 'coding_compress_context'
    | 'coding_report_status'
    | 'coding_search_text'
    | 'coding_search_symbol'
    | 'coding_find_references'
    | 'coding_analyze_impact'
    | 'coding_validate_hypothesis'
    | 'coding_select_target'
    | 'coding_plan_changes'
    | 'coding_review_changes'
    | 'coding_diagnose_changes'
    | 'coding_capture_validation_baseline'
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
}

export interface WindowInfo {
  id: string
  windowNumber?: number
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

export interface FocusWindowActionInput {
  windowId: string
  windowNumber?: number
  ownerPid?: number
  appName?: string
  title?: string
  bounds?: Bounds
  observedBounds?: Bounds
}

export interface SetWindowBoundsActionInput {
  windowId: string
  windowNumber?: number
  ownerPid?: number
  bounds: Bounds
  observedBounds?: Bounds
  appName?: string
  title?: string
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

export interface CodingSearchTextActionInput {
  query: string
  targetPath?: string
  glob?: string
  limit?: number
}

export interface CodingSearchSymbolActionInput {
  symbolName: string
  targetPath?: string
  glob?: string
  limit?: number
}

export interface CodingFindReferencesActionInput {
  filePath: string
  targetLine: number
  targetColumn: number
  limit?: number
}

export interface CodingSelectTargetActionInput {
  targetFile?: string
  targetPath?: string
  targetSymbol?: string
  searchQuery?: string
  changeIntent?: 'behavior_fix' | 'refactor' | 'api_change' | 'config_change' | 'test_fix'
}

export interface CodingPlanChangesActionInput {
  intent: string
  allowMultiFile?: boolean
  maxPlannedFiles?: number
  changeIntent?: 'behavior_fix' | 'refactor' | 'api_change' | 'config_change' | 'test_fix'
  sessionAware?: boolean
}

export interface CodingReviewChangesActionInput {
  currentFilePath?: string
}

export interface CodingAnalyzeImpactActionInput {
  targetFile?: string
  targetPath?: string
  targetSymbol?: string
  searchQuery?: string
  maxDepth?: number
}

export interface CodingValidateHypothesisActionInput {
  targetFile?: string
  targetPath?: string
  targetSymbol?: string
  searchQuery?: string
  changeIntent: 'behavior_fix' | 'refactor' | 'api_change' | 'config_change' | 'test_fix'
}

export interface CodingDiagnoseChangesActionInput {
  currentFilePath?: string
  validationOutput?: string
}

export interface CodingCaptureValidationBaselineActionInput {
  workspacePath?: string
  createTemporaryWorktree?: boolean
}

export interface PtyCreateApprovalInput {
  rows?: number
  cols?: number
  cwd?: string
  stepId?: string
  workflowStepLabel?: string
  approvalSessionId?: string
}

export interface DesktopRequestLeaseApprovalInput {
  kind: 'act'
  ttlMs?: number
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
    | { kind: 'open_app', input: OpenAppActionInput }
    | { kind: 'focus_app', input: FocusAppActionInput }
    | { kind: 'focus_window', input: FocusWindowActionInput }
    | { kind: 'set_window_bounds', input: SetWindowBoundsActionInput }
    | { kind: 'secret_read_env_value', input: SecretReadEnvValueActionInput }
    | { kind: 'clipboard_read_text', input: ClipboardReadTextActionInput }
    | { kind: 'clipboard_write_text', input: ClipboardWriteTextActionInput }
    | { kind: 'click', input: ClickActionInput }
    | { kind: 'type_text', input: TypeTextActionInput }
    | { kind: 'press_keys', input: PressKeysActionInput }
    // Coding Action Invocation Types
    | { kind: 'coding_review_workspace', input: { workspacePath: string } }
    | { kind: 'coding_read_file', input: { filePath: string, startLine?: number, endLine?: number } }
    | { kind: 'coding_apply_patch', input: { filePath: string, oldString: string, newString: string } }
    | { kind: 'coding_compress_context', input: { goal: string, filesSummary: string, recentResultSummary: string, unresolvedIssues: string, nextStepRecommendation: string } }
    | { kind: 'coding_report_status', input: { status: 'completed' | 'in_progress' | 'blocked' | 'failed' | 'auto', summary: string, filesTouched: string[], commandsRun: string[], checks: string[], nextStep: string } }
    | { kind: 'coding_search_text', input: CodingSearchTextActionInput }
    | { kind: 'coding_search_symbol', input: CodingSearchSymbolActionInput }
    | { kind: 'coding_find_references', input: CodingFindReferencesActionInput }
    | { kind: 'coding_analyze_impact', input: CodingAnalyzeImpactActionInput }
    | { kind: 'coding_validate_hypothesis', input: CodingValidateHypothesisActionInput }
    | { kind: 'coding_select_target', input: CodingSelectTargetActionInput }
    | { kind: 'coding_plan_changes', input: CodingPlanChangesActionInput }
    | { kind: 'coding_review_changes', input: CodingReviewChangesActionInput }
    | { kind: 'coding_diagnose_changes', input: CodingDiagnoseChangesActionInput }
    | { kind: 'coding_capture_validation_baseline', input: CodingCaptureValidationBaselineActionInput }
    | { kind: 'scroll', input: ScrollActionInput }
    | { kind: 'wait', input: WaitActionInput }
    | { kind: 'terminal_exec', input: TerminalExecActionInput }
    | { kind: 'terminal_reset', input: TerminalResetActionInput }

export type PendingExecutableAction
  = | ActionInvocation
    | { kind: 'pty_create', input: PtyCreateApprovalInput }
    | { kind: 'desktop_request_lease', input: DesktopRequestLeaseApprovalInput }

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
  bodyText?: string
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
  focusWindow: (input: FocusWindowActionInput) => Promise<ExecutorActionResult>
  setWindowBounds: (input: SetWindowBoundsActionInput) => Promise<ExecutorActionResult>
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
