import type { ApprovalMode, Bounds, ComputerUseConfig, DisplaySize, ExecutorKind } from './types'

import { join } from 'node:path'
import { cwd, env } from 'node:process'

const defaultDeniedApps = [
  '1password',
  'keychain',
  'system settings',
  'activity monitor',
  'airi',
]

const defaultOpenableApps = [
  'Terminal',
  'Cursor',
  'Google Chrome',
]

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null)
    return fallback

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized))
    return true
  if (['0', 'false', 'no', 'off'].includes(normalized))
    return false
  return fallback
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value)
    return fallback

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseList(value: string | undefined, fallback: string[] = []) {
  if (!value)
    return fallback

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function parseBounds(value: string | undefined): Bounds | undefined {
  if (!value)
    return undefined

  const parts = value.split(',').map(item => Number.parseFloat(item.trim()))
  if (parts.length !== 4 || parts.some(item => !Number.isFinite(item))) {
    throw new Error(`invalid COMPUTER_USE_ALLOWED_BOUNDS: ${value}`)
  }

  const [x, y, width, height] = parts
  if (width <= 0 || height <= 0) {
    throw new Error(`invalid COMPUTER_USE_ALLOWED_BOUNDS dimensions: ${value}`)
  }

  return { x, y, width, height }
}

function parseExecutor(value: string | undefined): ExecutorKind {
  if (value === 'linux-x11' || value === 'macos-local')
    return value
  return 'dry-run'
}

function parseApprovalMode(value: string | undefined): ApprovalMode {
  if (value === 'never' || value === 'all' || value === 'actions')
    return value
  return 'actions'
}

function parseDisplaySize(value: string | undefined, fallback: DisplaySize): DisplaySize {
  if (!value)
    return fallback

  const match = value.trim().match(/^(\d+)x(\d+)$/i)
  if (!match) {
    throw new Error(`invalid COMPUTER_USE_REMOTE_DISPLAY_SIZE: ${value}`)
  }

  const width = Number.parseInt(match[1], 10)
  const height = Number.parseInt(match[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`invalid COMPUTER_USE_REMOTE_DISPLAY_SIZE dimensions: ${value}`)
  }

  return { width, height }
}

function inferPortFromUrl(value: string | undefined) {
  if (!value)
    return undefined

  try {
    const url = new URL(value)
    if (url.port)
      return Number.parseInt(url.port, 10)

    return url.protocol === 'https:' ? 443 : 80
  }
  catch {
    return undefined
  }
}

export function resolveComputerUseConfig(): ComputerUseConfig {
  const executor = parseExecutor(env.COMPUTER_USE_EXECUTOR)
  const sessionRoot = env.COMPUTER_USE_SESSION_ROOT?.trim() || join(cwd(), '.computer-use-mcp')
  const launchHostProcess = env.COMPUTER_USE_LAUNCH_HOST_PROCESS?.trim()
    || env.TERM_PROGRAM?.trim()
    || env.SHELL?.split('/').at(-1)
    || 'node'

  const remoteSshHost = env.COMPUTER_USE_REMOTE_SSH_HOST?.trim() || undefined
  const remoteSshUser = env.COMPUTER_USE_REMOTE_SSH_USER?.trim() || undefined
  const remoteDisplaySize = parseDisplaySize(env.COMPUTER_USE_REMOTE_DISPLAY_SIZE, {
    width: 1280,
    height: 720,
  })
  const remoteObservationBaseUrl = env.COMPUTER_USE_REMOTE_OBSERVATION_BASE_URL?.trim() || undefined
  const inferredObservationPort = inferPortFromUrl(remoteObservationBaseUrl)
  const remoteObservationServePort = env.COMPUTER_USE_REMOTE_OBSERVATION_SERVE_PORT?.trim()
    ? parseInteger(env.COMPUTER_USE_REMOTE_OBSERVATION_SERVE_PORT, 8765)
    : remoteObservationBaseUrl
      ? inferredObservationPort || 8765
      : undefined

  const requireSessionTagForMutatingActions = parseBoolean(
    env.COMPUTER_USE_REQUIRE_SESSION_TAG_FOR_MUTATIONS,
    executor === 'linux-x11',
  )
  const requireAllowedBoundsForMutatingActions = parseBoolean(
    env.COMPUTER_USE_REQUIRE_ALLOWED_BOUNDS_FOR_MUTATIONS,
    executor === 'linux-x11',
  )
  const requireCoordinateAlignmentForMutatingActions = parseBoolean(
    env.COMPUTER_USE_REQUIRE_COORDINATE_ALIGNMENT_FOR_MUTATIONS,
    executor === 'linux-x11',
  )

  return {
    sessionRoot,
    screenshotsDir: join(sessionRoot, 'screenshots'),
    auditLogPath: join(sessionRoot, 'audit.jsonl'),
    executor,
    approvalMode: parseApprovalMode(env.COMPUTER_USE_APPROVAL_MODE),
    defaultCaptureAfter: parseBoolean(env.COMPUTER_USE_DEFAULT_CAPTURE_AFTER, true),
    maxOperations: parseInteger(env.COMPUTER_USE_MAX_OPERATIONS, 80),
    maxOperationUnits: parseInteger(env.COMPUTER_USE_MAX_OPERATION_UNITS, 160),
    maxPendingActions: parseInteger(env.COMPUTER_USE_MAX_PENDING_ACTIONS, 24),
    allowedBounds: parseBounds(env.COMPUTER_USE_ALLOWED_BOUNDS),
    allowApps: parseList(env.COMPUTER_USE_ALLOW_APPS),
    denyApps: parseList(env.COMPUTER_USE_DENY_APPS, defaultDeniedApps),
    denyWindowTitles: parseList(env.COMPUTER_USE_DENY_WINDOW_TITLES),
    openableApps: parseList(env.COMPUTER_USE_OPENABLE_APPS, defaultOpenableApps),
    timeoutMs: parseInteger(env.COMPUTER_USE_TIMEOUT_MS, 15_000),
    sessionTag: env.COMPUTER_USE_SESSION_TAG?.trim() || undefined,
    launchHostProcess,
    permissionChainHint: env.COMPUTER_USE_PERMISSION_CHAIN_HINT?.trim()
      || (executor === 'linux-x11'
        ? `${launchHostProcess} -> ssh -> remote desktop-runner`
        : executor === 'macos-local'
          ? `${launchHostProcess} -> swift/quartz + open`
          : `${launchHostProcess} -> local dry-run`),
    requireSessionTagForMutatingActions,
    requireAllowedBoundsForMutatingActions,
    requireCoordinateAlignmentForMutatingActions,
    terminalShell: env.COMPUTER_USE_TERMINAL_SHELL?.trim() || env.SHELL?.trim() || '/bin/zsh',
    remoteSshHost,
    remoteSshUser,
    remoteSshPort: parseInteger(env.COMPUTER_USE_REMOTE_SSH_PORT, 22),
    remoteRunnerCommand: env.COMPUTER_USE_REMOTE_RUNNER_COMMAND?.trim() || '~/.local/bin/airi-desktop-runner',
    remoteDisplaySize,
    remoteObservationBaseUrl,
    remoteObservationServePort,
    remoteObservationToken: env.COMPUTER_USE_REMOTE_OBSERVATION_TOKEN?.trim() || undefined,
    binaries: {
      swift: env.COMPUTER_USE_SWIFT_BINARY?.trim() || 'swift',
      osascript: env.COMPUTER_USE_OSASCRIPT_BINARY?.trim() || 'osascript',
      screencapture: env.COMPUTER_USE_SCREENSHOT_BINARY?.trim() || 'screencapture',
      ssh: env.COMPUTER_USE_SSH_BINARY?.trim() || 'ssh',
      tar: env.COMPUTER_USE_TAR_BINARY?.trim() || 'tar',
      open: env.COMPUTER_USE_OPEN_BINARY?.trim() || 'open',
    },
  }
}
