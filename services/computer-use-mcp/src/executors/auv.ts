import type { RunnerClient } from '@auv-js/sdk/node'

import type {
  Bounds,
  ClickActionInput,
  ComputerUseConfig,
  DesktopExecutor,
  DisplayInfo,
  ExecutionTarget,
  FocusAppActionInput,
  OpenAppActionInput,
  PermissionInfo,
  PointerTracePoint,
  PressKeysActionInput,
  ScreenshotArtifact,
  ScreenshotRequest,
  ScrollActionInput,
  TypeTextActionInput,
  WaitActionInput,
  WindowInfo,
  WindowObservation,
} from '../types'
import type { AuvExecutorRuntime, AuvSession } from './auv-runtime'

import { hostname } from 'node:os'
import { platform } from 'node:process'

import { errorMessageFromValue } from '../utils/error-message'
import { AuvExecutorError, wrapAuvError } from './auv-errors'
import { createAuvExecutorRuntime } from './auv-runtime'

export interface AuvExecutorOptions {
  runtime?: AuvExecutorRuntime
}

export interface AuvWindowProperties {
  title?: string | null
  applicationName?: string | null
  application_name?: string | null
  applicationId?: string | null
  application_id?: string | null
  appName?: string | null
  app_name?: string | null
  processId?: number | null
  process_id?: number | null
  frame?: { x: number, y: number, width: number, height: number } | null
  isVisible?: boolean | null
  is_visible?: boolean | null
  ref?: { windowId?: string | null, window_id?: string | null } | null
  reference?: { id?: string | null } | null
}

export interface AuvWindowClient {
  id?: string | null
  reference?: { id?: string | null } | null
  window?: AuvWindowProperties | null
}

const COORDINATE_SPACE = 'logical-screen'

function extractAppName(win: AuvWindowProperties | null | undefined): string | undefined {
  const candidate = win?.applicationName
    || (win as { application_name?: string | null } | undefined)?.application_name
    || win?.applicationId
    || (win as { application_id?: string | null } | undefined)?.application_id
    || win?.app_name
    || win?.appName
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined
}

export function mapAuvWindow(client: AuvWindowClient | null | undefined): WindowInfo {
  const win = client?.window
  const winRef = win?.ref as { windowId?: string | null, window_id?: string | null } | undefined
  const id = client?.id
    || client?.reference?.id
    || (client as { reference_id?: string | null } | undefined)?.reference_id
    || winRef?.windowId
    || winRef?.window_id
    || win?.reference?.id
    || (win as { reference_id?: string | null } | undefined)?.reference_id
    || 'unknown'
  const appName = extractAppName(win) || 'unknown'
  const rawTitle = win?.title
  const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : undefined
  const rawProcessId: unknown = win?.processId ?? win?.process_id
  const ownerPid = typeof rawProcessId === 'number' && Number.isInteger(rawProcessId)
    ? rawProcessId
    : typeof rawProcessId === 'string' && /^\d+$/.test(rawProcessId.trim())
      ? Number.parseInt(rawProcessId.trim(), 10)
      : undefined
  const isVisible = win?.isVisible ?? win?.is_visible ?? undefined
  const frame = win?.frame
  const bounds = frame && [frame.x, frame.y, frame.width, frame.height].every(n => typeof n === 'number' && Number.isFinite(n))
    ? { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
    : undefined

  return {
    id: String(id),
    appName,
    title,
    bounds,
    ownerPid,
    isOnScreen: typeof isVisible === 'boolean' ? isVisible : undefined,
  }
}

function toBounds(rect: { x: number, y: number, width: number, height: number } | undefined | null): Bounds | undefined {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(n => typeof n === 'number' && Number.isFinite(n)))
    return undefined
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function buildExecutionTarget(config: ComputerUseConfig, session: AuvSession | undefined): ExecutionTarget {
  return {
    mode: 'local-windowed',
    transport: 'local',
    hostName: hostname(),
    sessionTag: config.sessionTag,
    isolated: false,
    tainted: false,
    note: session
      ? `auv daemon ${session.daemonId ?? 'unknown'}${session.runId ? `, run ${session.runId}` : ''}`
      : 'auv session not started yet',
  }
}

function unsupported(action: string): never {
  throw new AuvExecutorError('unsupported', `${action} is not implemented by the auv executor in Slice 2 (read-only window observation only)`)
}

export function createAuvExecutor(config: ComputerUseConfig, options: AuvExecutorOptions = {}): DesktopExecutor {
  const runtime = options.runtime ?? createAuvExecutorRuntime(config)
  let knownSession: AuvSession | undefined

  const ensureSession = async () => {
    try {
      const session = await runtime.ensureSession()
      knownSession = session
      return session
    }
    catch (error) {
      throw wrapAuvError('session startup', error)
    }
  }

  const callRunner = async <T>(session: AuvSession, operation: string, call: (runner: RunnerClient) => Promise<T>): Promise<T> => {
    try {
      return await call(session.runner)
    }
    catch (error) {
      throw wrapAuvError(operation, error)
    }
  }

  return {
    kind: 'auv',
    describe: () => ({
      kind: 'auv',
      notes: [
        'AUV-backed desktop window observation (read-only)',
        `window bounds use ${COORDINATE_SPACE} coordinates`,
        'mutating actions and display capture are unsupported and fail closed',
      ],
    }),
    getExecutionTarget: async () => buildExecutionTarget(config, knownSession),
    getForegroundContext: async () => {
      const session = knownSession
      if (!session) {
        return {
          available: false,
          platform,
          unavailableReason: 'auv session not started yet (no observation ran)',
        }
      }

      try {
        const frontmost = await callRunner(session, 'observe frontmost window', runner => runner.windows.resolve({ frontmost: true }))
        const win = frontmost?.window as AuvWindowProperties | undefined
        const appName = extractAppName(win)
        const title = win?.title ?? undefined
        const frame = win?.frame
        return {
          available: Boolean(appName || title),
          platform,
          appName: appName || undefined,
          windowTitle: title,
          windowBounds: toBounds(frame),
        }
      }
      catch (error) {
        return {
          available: false,
          platform,
          unavailableReason: errorMessageFromValue(error),
        }
      }
    },
    getDisplayInfo: async () => {
      const session = knownSession
      if (!session) {
        return {
          available: false,
          platform,
          capturedAt: new Date().toISOString(),
          note: 'auv session not started yet (no observation ran)',
        }
      }

      try {
        const displays = await callRunner(session, 'list displays', runner => runner.displays.list())
        const primary = displays.find(display => display.primary) ?? displays[0]
        return {
          available: displays.length > 0,
          platform,
          logicalWidth: primary?.frame?.width,
          logicalHeight: primary?.frame?.height,
          scaleFactor: primary?.scaleFactor,
          isRetina: primary ? primary.scaleFactor > 1 : undefined,
          displayCount: displays.length,
          capturedAt: new Date().toISOString(),
          note: `auv: display frames use ${COORDINATE_SPACE} coordinates`,
        } satisfies DisplayInfo
      }
      catch (error) {
        return {
          available: false,
          platform,
          capturedAt: new Date().toISOString(),
          note: `auv display listing failed: ${errorMessageFromValue(error)}`,
        } satisfies DisplayInfo
      }
    },
    getPermissionInfo: async () => {
      const probe = (target: string) => ({
        status: 'unsupported' as const,
        target,
        checkedBy: 'auv executor',
        note: 'AUV permission probing is macOS-only in @auv-js/sdk',
      })
      return {
        screenRecording: probe('screen recording'),
        accessibility: probe('accessibility'),
        automationToSystemEvents: probe('automation to system events'),
      } satisfies PermissionInfo
    },
    observeWindows: async (request) => {
      const session = await ensureSession()
      return callRunner(session, 'observe windows', async (runner) => {
        const [clients, frontmost] = await Promise.all([
          runner.windows.list(),
          runner.windows.resolve({ frontmost: true }).catch(() => undefined),
        ])

        let windows = clients.map(client => mapAuvWindow(client))
        if (request.app) {
          const needle = request.app.trim().toLowerCase()
          if (needle) {
            windows = windows.filter(window => window.appName.toLowerCase().includes(needle))
          }
        }
        if (request.limit !== undefined) {
          windows = windows.slice(0, Math.max(request.limit, 0))
        }

        const frontWin = frontmost?.window as AuvWindowProperties | undefined
        const frontAppName = extractAppName(frontWin)
        const rawFrontTitle = frontWin?.title
        const frontTitle = typeof rawFrontTitle === 'string' && rawFrontTitle.trim() ? rawFrontTitle.trim() : undefined

        return {
          frontmostAppName: frontAppName,
          frontmostWindowTitle: frontTitle,
          windows,
          observedAt: new Date().toISOString(),
          provenance: {
            backend: 'auv',
            runId: session.runId,
            deviceId: session.deviceId,
            daemonId: session.daemonId,
            coordinateSpace: COORDINATE_SPACE,
          },
        } satisfies WindowObservation
      })
    },
    takeScreenshot: async (_request: ScreenshotRequest): Promise<ScreenshotArtifact> => unsupported('takeScreenshot'),
    openApp: async (_input: OpenAppActionInput) => unsupported('openApp'),
    focusApp: async (_input: FocusAppActionInput) => unsupported('focusApp'),
    click: async (_input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => unsupported('click'),
    typeText: async (_input: TypeTextActionInput) => unsupported('typeText'),
    pressKeys: async (_input: PressKeysActionInput) => unsupported('pressKeys'),
    scroll: async (_input: ScrollActionInput) => unsupported('scroll'),
    wait: async (_input: WaitActionInput) => unsupported('wait'),
    close: async () => {
      knownSession = undefined
      await runtime.close()
    },
  }
}
