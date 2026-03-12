import type {
  ComputerUseConfig,
  DisplayInfo,
  ExecutionTarget,
  LastScreenshotInfo,
  PermissionInfo,
  TerminalState,
} from './types'

export function createTestConfig(overrides: Partial<ComputerUseConfig> = {}): ComputerUseConfig {
  const baseConfig: ComputerUseConfig = {
    sessionRoot: '/tmp/computer-use-mcp',
    screenshotsDir: '/tmp/computer-use-mcp/screenshots',
    auditLogPath: '/tmp/computer-use-mcp/audit.jsonl',
    executor: 'linux-x11',
    approvalMode: 'actions',
    defaultCaptureAfter: true,
    maxOperations: 80,
    maxOperationUnits: 160,
    maxPendingActions: 24,
    allowedBounds: { x: 0, y: 0, width: 1280, height: 720 },
    allowApps: [],
    denyApps: ['airi'],
    denyWindowTitles: ['keychain'],
    openableApps: ['Finder', 'Terminal', 'Cursor', 'Visual Studio Code', 'Google Chrome'],
    timeoutMs: 15_000,
    sessionTag: 'vm-local-1',
    launchHostProcess: 'Terminal',
    permissionChainHint: 'Terminal -> ssh -> remote desktop-runner',
    requireSessionTagForMutatingActions: true,
    requireAllowedBoundsForMutatingActions: true,
    requireCoordinateAlignmentForMutatingActions: true,
    terminalShell: '/bin/zsh',
    remoteSshHost: '20.196.212.37',
    remoteSshUser: 'airi',
    remoteSshPort: 22,
    remoteRunnerCommand: '~/.local/bin/airi-desktop-runner',
    remoteDisplaySize: {
      width: 1280,
      height: 720,
    },
    remoteObservationBaseUrl: undefined,
    remoteObservationServePort: undefined,
    remoteObservationToken: undefined,
    browserDomBridge: {
      enabled: true,
      host: '127.0.0.1',
      port: 8765,
      requestTimeoutMs: 10_000,
    },
    binaries: {
      swift: 'swift',
      osascript: 'osascript',
      screencapture: 'screencapture',
      pbcopy: 'pbcopy',
      pbpaste: 'pbpaste',
      ssh: 'ssh',
      tar: 'tar',
      open: 'open',
    },
  }

  return {
    ...baseConfig,
    ...overrides,
    remoteDisplaySize: {
      width: overrides.remoteDisplaySize?.width ?? baseConfig.remoteDisplaySize.width,
      height: overrides.remoteDisplaySize?.height ?? baseConfig.remoteDisplaySize.height,
    },
    binaries: {
      swift: overrides.binaries?.swift ?? baseConfig.binaries.swift,
      osascript: overrides.binaries?.osascript ?? baseConfig.binaries.osascript,
      screencapture: overrides.binaries?.screencapture ?? baseConfig.binaries.screencapture,
      pbcopy: overrides.binaries?.pbcopy ?? baseConfig.binaries.pbcopy,
      pbpaste: overrides.binaries?.pbpaste ?? baseConfig.binaries.pbpaste,
      ssh: overrides.binaries?.ssh ?? baseConfig.binaries.ssh,
      tar: overrides.binaries?.tar ?? baseConfig.binaries.tar,
      open: overrides.binaries?.open ?? baseConfig.binaries.open,
    },
  }
}

export function createRemoteExecutionTarget(overrides: Partial<ExecutionTarget> = {}): ExecutionTarget {
  return {
    mode: 'remote',
    transport: 'ssh-stdio',
    hostName: 'fake-remote',
    remoteUser: 'airi',
    displayId: ':99',
    sessionTag: 'vm-local-1',
    isolated: true,
    tainted: false,
    ...overrides,
  }
}

export function createLocalExecutionTarget(overrides: Partial<ExecutionTarget> = {}): ExecutionTarget {
  return {
    mode: 'local-windowed',
    transport: 'local',
    hostName: 'macbook-pro',
    sessionTag: 'local-session',
    isolated: false,
    tainted: false,
    ...overrides,
  }
}

export function createDisplayInfo(overrides: Partial<DisplayInfo> = {}): DisplayInfo {
  return {
    available: true,
    platform: 'linux',
    logicalWidth: 1280,
    logicalHeight: 720,
    pixelWidth: 1280,
    pixelHeight: 720,
    scaleFactor: 1,
    isRetina: false,
    note: 'managed virtual X session :99',
    ...overrides,
  }
}

export function createPermissionInfo(): PermissionInfo {
  return {
    screenRecording: {
      status: 'granted',
      target: ':99 via scrot',
      checkedBy: 'scrot',
    },
    accessibility: {
      status: 'unsupported',
      target: ':99 linux-x11 session',
      note: 'linux-x11 runner does not rely on accessibility APIs',
    },
    automationToSystemEvents: {
      status: 'unsupported',
      target: ':99 linux-x11 session',
      note: 'linux-x11 runner does not use System Events',
    },
  }
}

export function createLastScreenshot(overrides: Partial<LastScreenshotInfo> = {}): LastScreenshotInfo {
  return {
    path: '/tmp/computer-use-mcp/screenshots/last.png',
    width: 1280,
    height: 720,
    capturedAt: '2026-03-09T00:00:00.000Z',
    placeholder: false,
    executionTargetMode: 'remote',
    sourceHostName: 'fake-remote',
    sourceDisplayId: ':99',
    sourceSessionTag: 'vm-local-1',
    ...overrides,
  }
}

export function createTerminalState(overrides: Partial<TerminalState> = {}): TerminalState {
  return {
    effectiveCwd: '/Users/liuziheng/airi',
    lastExitCode: 0,
    lastCommandSummary: 'pwd',
    ...overrides,
  }
}
