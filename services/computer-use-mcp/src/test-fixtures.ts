import type {
  ComputerUseConfig,
  DisplayInfo,
  ExecutionTarget,
  LastScreenshotInfo,
  PermissionInfo,
  TerminalState,
} from './types'

export function createDisplayInfo(overrides: Partial<DisplayInfo> = {}): DisplayInfo {
  return {
    available: true,
    isRetina: false,
    logicalHeight: 720,
    logicalWidth: 1280,
    note: 'managed virtual X session :99',
    pixelHeight: 720,
    pixelWidth: 1280,
    platform: 'linux',
    scaleFactor: 1,
    ...overrides,
  }
}

export function createLastScreenshot(overrides: Partial<LastScreenshotInfo> = {}): LastScreenshotInfo {
  return {
    capturedAt: '2026-03-09T00:00:00.000Z',
    executionTargetMode: 'remote',
    height: 720,
    path: '/tmp/computer-use-mcp/screenshots/last.png',
    placeholder: false,
    sourceDisplayId: ':99',
    sourceHostName: 'fake-remote',
    sourceSessionTag: 'vm-local-1',
    width: 1280,
    ...overrides,
  }
}

export function createLocalExecutionTarget(overrides: Partial<ExecutionTarget> = {}): ExecutionTarget {
  return {
    hostName: 'macbook-pro',
    isolated: false,
    mode: 'local-windowed',
    sessionTag: 'local-session',
    tainted: false,
    transport: 'local',
    ...overrides,
  }
}

export function createPermissionInfo(): PermissionInfo {
  return {
    accessibility: {
      note: 'linux-x11 runner does not rely on accessibility APIs',
      status: 'unsupported',
      target: ':99 linux-x11 session',
    },
    automationToSystemEvents: {
      note: 'linux-x11 runner does not use System Events',
      status: 'unsupported',
      target: ':99 linux-x11 session',
    },
    screenRecording: {
      checkedBy: 'scrot',
      status: 'granted',
      target: ':99 via scrot',
    },
  }
}

export function createRemoteExecutionTarget(overrides: Partial<ExecutionTarget> = {}): ExecutionTarget {
  return {
    displayId: ':99',
    hostName: 'fake-remote',
    isolated: true,
    mode: 'remote',
    remoteUser: 'airi',
    sessionTag: 'vm-local-1',
    tainted: false,
    transport: 'ssh-stdio',
    ...overrides,
  }
}

export function createTerminalState(overrides: Partial<TerminalState> = {}): TerminalState {
  return {
    effectiveCwd: '/workspace/airi',
    lastCommandSummary: 'pwd',
    lastExitCode: 0,
    ...overrides,
  }
}

export function createTestConfig(overrides: Partial<ComputerUseConfig> = {}): ComputerUseConfig {
  const baseConfig: ComputerUseConfig = {
    allowApps: [],
    allowedBounds: { height: 720, width: 1280, x: 0, y: 0 },
    approvalMode: 'actions',
    auditLogPath: '/tmp/computer-use-mcp/audit.jsonl',
    binaries: {
      open: 'open',
      osascript: 'osascript',
      pbcopy: 'pbcopy',
      pbpaste: 'pbpaste',
      screencapture: 'screencapture',
      ssh: 'ssh',
      swift: 'swift',
      tar: 'tar',
    },
    browserDomBridge: {
      enabled: true,
      host: '127.0.0.1',
      port: 8765,
      requestTimeoutMs: 10_000,
    },
    defaultCaptureAfter: true,
    denyApps: ['airi'],
    denyWindowTitles: ['keychain'],
    executor: 'linux-x11',
    launchHostProcess: 'Terminal',
    maxOperations: 80,
    maxOperationUnits: 160,
    maxPendingActions: 24,
    openableApps: ['Finder', 'Terminal', 'Cursor', 'Visual Studio Code', 'Google Chrome'],
    permissionChainHint: 'Terminal -> ssh -> remote desktop-runner',
    remoteDisplaySize: {
      height: 720,
      width: 1280,
    },
    remoteObservationBaseUrl: undefined,
    remoteObservationServePort: undefined,
    remoteObservationToken: undefined,
    remoteRunnerCommand: '$HOME/.local/bin/airi-desktop-runner',
    remoteSshHost: '20.196.212.37',
    remoteSshPort: 22,
    remoteSshUser: 'airi',
    requireAllowedBoundsForMutatingActions: true,
    requireCoordinateAlignmentForMutatingActions: true,
    requireSessionTagForMutatingActions: true,
    screenshotsDir: '/tmp/computer-use-mcp/screenshots',
    sessionRoot: '/tmp/computer-use-mcp',
    sessionTag: 'vm-local-1',
    terminalShell: '/bin/zsh',
    timeoutMs: 15_000,
  }

  return {
    ...baseConfig,
    ...overrides,
    binaries: {
      open: overrides.binaries?.open ?? baseConfig.binaries.open,
      osascript: overrides.binaries?.osascript ?? baseConfig.binaries.osascript,
      pbcopy: overrides.binaries?.pbcopy ?? baseConfig.binaries.pbcopy,
      pbpaste: overrides.binaries?.pbpaste ?? baseConfig.binaries.pbpaste,
      screencapture: overrides.binaries?.screencapture ?? baseConfig.binaries.screencapture,
      ssh: overrides.binaries?.ssh ?? baseConfig.binaries.ssh,
      swift: overrides.binaries?.swift ?? baseConfig.binaries.swift,
      tar: overrides.binaries?.tar ?? baseConfig.binaries.tar,
    },
    remoteDisplaySize: {
      height: overrides.remoteDisplaySize?.height ?? baseConfig.remoteDisplaySize.height,
      width: overrides.remoteDisplaySize?.width ?? baseConfig.remoteDisplaySize.width,
    },
  }
}
