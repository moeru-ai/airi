import type {
  CaptureResolution,
  ImageEncoding,
  MouseButton,
} from '@auv-js/sdk'
import type { RunnerClient } from '@auv-js/sdk/node'

import type {
  Bounds,
  ClickActionInput,
  ComputerUseConfig,
  DesktopExecutor,
  DisplayInfo,
  ExecutionTarget,
  ExecutorActionResult,
  ExecutorCallOptions,
  FocusAppActionInput,
  ForegroundContext,
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

import { Buffer } from 'node:buffer'
import { hostname } from 'node:os'
import { platform } from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { CaptureResolution as CaptureResolutionValue, ImageEncoding as ImageEncodingValue, InputPolicy as InputPolicyValue, MouseButton as MouseButtonValue } from '@auv-js/sdk'

import { errorMessageFromValue } from '../utils/error-message'
import { writeScreenshotArtifact } from '../utils/screenshot'
import { AuvExecutorError, wrapAuvError } from './auv-errors'
import { createAuvExecutorRuntime } from './auv-runtime'

const COORDINATE_SPACE = 'logical-screen'
type AuvWindowClient = Awaited<ReturnType<RunnerClient['windows']['get']>>
type AuvActivation = Awaited<ReturnType<RunnerClient['applications']['activate']>>
interface AuvDeliveryResult {
  action?: { attempts?: Array<{ succeeded?: boolean }> }
  attempts?: Array<{ succeeded?: boolean }>
}

function mapWindow(client: AuvWindowClient): WindowInfo {
  const window = client.window
  return {
    id: client.id,
    appName: window.applicationName || window.applicationId || 'unknown',
    title: window.title,
    bounds: window.frame,
    ownerPid: window.processId,
    isOnScreen: window.isVisible,
  }
}

function executionTarget(config: ComputerUseConfig, session?: AuvSession, displayId?: string): ExecutionTarget {
  return {
    mode: 'local-windowed',
    transport: 'local',
    hostName: hostname(),
    displayId,
    sessionTag: config.sessionTag,
    isolated: false,
    tainted: false,
    note: session
      ? `auv daemon ${session.daemonId || 'unknown'}${session.runId ? `, run ${session.runId}` : ''}`
      : 'auv session not started yet',
  }
}

function actionResult(notes: string[], target: ExecutionTarget): ExecutorActionResult {
  return { performed: true, backend: 'auv', notes, executionTarget: target }
}

function assertDelivery(result: AuvDeliveryResult, operation: string) {
  if (!result || typeof result !== 'object')
    throw new AuvExecutorError('unknown', `${operation} returned no delivery result`)
  const attempts = result.action?.attempts ?? result.attempts
  if (!attempts?.length) {
    throw new AuvExecutorError('unknown', `${operation} returned no delivery attempts; inspect the current application state before retrying`)
  }
  if (!attempts.some(attempt => attempt.succeeded === true)) {
    throw new AuvExecutorError('unavailable', `${operation} returned without a successful input delivery attempt`)
  }
}

function requireVerifiedActivation(activation: AuvActivation, app: string, operation: string, config: ComputerUseConfig, session: AuvSession) {
  const verification = activation.verification?.verification.case
  if (verification !== 'verifiedForeground') {
    throw new AuvExecutorError('unavailable', `AUV did not verify ${app} in the foreground. If it is not running, launch it through the approved Terminal lane, then observe windows again.`)
  }
  return actionResult([`${operation} existing app window ${app}`], executionTarget(config, session))
}

function buttonValue(button: ClickActionInput['button']): MouseButton {
  if (button === 'right')
    return MouseButtonValue.RIGHT as MouseButton
  if (button === 'middle')
    return MouseButtonValue.MIDDLE as MouseButton
  return MouseButtonValue.LEFT as MouseButton
}

function isInside(bounds: Bounds | undefined, x: number, y: number) {
  return Boolean(bounds && x >= bounds.x && y >= bounds.y && x <= bounds.x + bounds.width && y <= bounds.y + bounds.height)
}

export interface AuvExecutorOptions {
  runtime?: AuvExecutorRuntime
}

export function createAuvExecutor(config: ComputerUseConfig, options: AuvExecutorOptions = {}): DesktopExecutor {
  const runtime = options.runtime ?? createAuvExecutorRuntime(config)
  let knownSession: AuvSession | undefined

  const ensureSession = async () => {
    try {
      knownSession = await runtime.ensureSession()
      return knownSession
    }
    catch (error) {
      throw wrapAuvError('session startup', error)
    }
  }

  const callRunner = async <T>(session: AuvSession, operation: string, call: (runner: RunnerClient) => Promise<T>) => {
    try {
      return await call(session.runner)
    }
    catch (error) {
      throw wrapAuvError(operation, error)
    }
  }

  const resolveTargetWindow = async (session: AuvSession, options: ExecutorCallOptions = {}, point?: { x: number, y: number }) => {
    const expected = options.targetWindowContext
    const targetWindowId = options.targetWindowId || expected?.windowId
    if (targetWindowId) {
      const client = await session.runner.windows.get(targetWindowId, { signal: options.signal })
      const actual = client.window
      if (expected?.ownerPid !== undefined && expected.ownerPid !== actual.processId) {
        throw new AuvExecutorError('not_found', `target window ${targetWindowId} now belongs to a different process`)
      }
      if (expected?.appName && (!actual.applicationName || expected.appName.toLowerCase() !== actual.applicationName.toLowerCase())) {
        throw new AuvExecutorError('not_found', `target window ${targetWindowId} now belongs to ${actual.applicationName}, expected ${expected.appName}`)
      }
      return client
    }

    if (point) {
      const windows = await session.runner.windows.list({ signal: options.signal })
      const matching = windows.find((candidate) => {
        const bounds = candidate.window.frame
        return candidate.window.isVisible && isInside(bounds, point.x, point.y)
      })
      if (matching)
        return matching
      throw new AuvExecutorError('not_found', `no visible AUV window contains screen point (${point.x}, ${point.y})`)
    }

    return await session.runner.windows.resolve({ frontmost: true }, { signal: options.signal })
  }

  const resolveLocalPoint = async (session: AuvSession, options: ExecutorCallOptions, point: { x: number, y: number }) => {
    const window = await resolveTargetWindow(session, options, point)
    const bounds = window.window.frame
    if (!bounds)
      throw new AuvExecutorError('not_found', `target window ${window.id} has no usable frame`)
    if (!isInside(bounds, point.x, point.y))
      throw new AuvExecutorError('not_found', `screen point (${point.x}, ${point.y}) is outside target window ${window.id}`)
    return { window, point: { x: point.x - bounds.x, y: point.y - bounds.y } }
  }

  const captureDisplay = async (session: AuvSession, request: ScreenshotRequest, options: ExecutorCallOptions): Promise<ScreenshotArtifact> => {
    const targetWindow = options.targetWindowContext?.windowId
      ? await resolveTargetWindow(session, options)
      : await callRunner(session, 'resolve screenshot window', runner => runner.windows.resolve({ frontmost: true }, { signal: options.signal }).catch(() => undefined))
    const targetBounds = targetWindow?.window.frame
    const displays = await callRunner(session, 'list screenshot displays', runner => runner.displays.list({ signal: options.signal }))
    const center = targetBounds
      ? { x: targetBounds.x + targetBounds.width / 2, y: targetBounds.y + targetBounds.height / 2 }
      : undefined
    const selectedDisplay = (center && displays.find((display) => {
      const bounds = display.frame
      return Boolean(bounds && isInside(bounds, center.x, center.y))
    })) || displays.find(display => display.primary) || displays[0]
    const displaySelector = selectedDisplay
      ? { selector: { case: 'display' as const, value: { displayId: selectedDisplay.displayId } } }
      : undefined
    const captured = await callRunner(session, 'capture display', runner => runner.displays.capture(displaySelector, {
      resolution: CaptureResolutionValue.LOGICAL as CaptureResolution,
      signal: options.signal,
    }))
    if (!captured.capture)
      throw new AuvExecutorError('unknown', 'AUV display capture returned no capture reference')

    const image = await callRunner(session, 'read display capture', runner => runner.captures.image(captured.capture!, {
      encoding: ImageEncodingValue.PNG as ImageEncoding,
      signal: options.signal,
    }))
    const frontmostAfter = await callRunner(session, 'resolve screenshot window', runner => runner.windows.resolve({ frontmost: true }, { signal: options.signal }).catch(() => undefined))
    const rawDisplayId = captured.display?.displayId
    const displayIndex = displays.findIndex(display => display.displayId === rawDisplayId)
    const displayId = displayIndex >= 0 ? String(displayIndex + 1) : undefined
    const target = executionTarget(config, session, displayId)
    const displayBounds = captured.display?.frame ?? selectedDisplay?.frame
    const foregroundBounds = frontmostAfter?.window.frame
    const foregroundCenter = foregroundBounds
      ? { x: foregroundBounds.x + foregroundBounds.width / 2, y: foregroundBounds.y + foregroundBounds.height / 2 }
      : undefined
    const sourceWindowId = foregroundCenter && displayBounds && isInside(displayBounds, foregroundCenter.x, foregroundCenter.y)
      ? frontmostAfter?.id
      : undefined
    return await writeScreenshotArtifact({
      label: request.label,
      screenshotsDir: config.screenshotsDir,
      dataBase64: Buffer.from(image.data).toString('base64'),
      note: `AUV display capture (${COORDINATE_SPACE}) at global origin (${displayBounds?.x ?? 0}, ${displayBounds?.y ?? 0}); foreground window ${sourceWindowId || 'unbound'}`,
      executionTarget: target,
      sourceWindowId,
    })
  }

  const foreground = async (session: AuvSession, options: ExecutorCallOptions = {}): Promise<ForegroundContext> => {
    try {
      const client = await callRunner(session, 'resolve frontmost window', runner => runner.windows.resolve({ frontmost: true }, { signal: options.signal }))
      const window = client.window
      return {
        available: Boolean(window.applicationName || window.applicationId || window.title),
        platform,
        appName: window.applicationName || window.applicationId,
        windowTitle: window.title,
        windowId: client.id,
        ownerPid: window.processId,
        windowBounds: window.frame,
        unavailableReason: undefined,
      }
    }
    catch (error) {
      return { available: false, platform, unavailableReason: errorMessageFromValue(error) }
    }
  }

  const wait = async (input: WaitActionInput, options: ExecutorCallOptions = {}) => {
    await delay(Math.max(0, input.durationMs), undefined, { signal: options.signal })
    return actionResult(['waited through AUV execution lane'], executionTarget(config, knownSession))
  }

  return {
    kind: 'auv',
    describe: () => ({
      kind: 'auv',
      notes: [
        'AUV-backed Windows observation and input',
        `window bounds and input coordinates use ${COORDINATE_SPACE}`,
        'each mutating call is bound to a freshly resolved window and Host approval remains required',
      ],
    }),
    getExecutionTarget: async () => executionTarget(config, await ensureSession()),
    getForegroundContext: async () => foreground(await ensureSession()),
    getDisplayInfo: async () => {
      const session = await ensureSession()
      try {
        const displays = await callRunner(session, 'list displays', runner => runner.displays.list())
        const mapped = displays.map((display, index) => {
          const frame = display.frame
          const displayId = index + 1
          return {
            displayId,
            isMain: display.primary,
            isBuiltIn: display.builtin ?? false,
            bounds: frame || { x: 0, y: 0, width: 0, height: 0 },
            visibleBounds: frame || { x: 0, y: 0, width: 0, height: 0 },
            scaleFactor: display.scaleFactor || 1,
            pixelWidth: frame ? Math.round(frame.width * (display.scaleFactor || 1)) : 0,
            pixelHeight: frame ? Math.round(frame.height * (display.scaleFactor || 1)) : 0,
          }
        })
        const primary = mapped.find(display => display.isMain) ?? mapped[0]
        const combinedBounds = mapped.reduce<Bounds | undefined>((combined, display) => {
          if (!combined)
            return display.bounds
          const right = Math.max(combined.x + combined.width, display.bounds.x + display.bounds.width)
          const bottom = Math.max(combined.y + combined.height, display.bounds.y + display.bounds.height)
          const left = Math.min(combined.x, display.bounds.x)
          const top = Math.min(combined.y, display.bounds.y)
          return { x: left, y: top, width: right - left, height: bottom - top }
        }, undefined)
        return {
          available: mapped.length > 0,
          platform,
          logicalWidth: primary?.bounds.width,
          logicalHeight: primary?.bounds.height,
          scaleFactor: primary?.scaleFactor,
          isRetina: primary ? primary.scaleFactor > 1 : undefined,
          displayCount: mapped.length,
          displays: mapped,
          combinedBounds,
          capturedAt: new Date().toISOString(),
          note: `AUV display frames use ${COORDINATE_SPACE} coordinates`,
        } satisfies DisplayInfo
      }
      catch (error) {
        return { available: false, platform, capturedAt: new Date().toISOString(), note: `AUV display listing failed: ${errorMessageFromValue(error)}` } satisfies DisplayInfo
      }
    },
    getPermissionInfo: async () => {
      const probe = (target: string) => ({
        status: 'unknown' as const,
        target,
        checkedBy: 'AUV Windows Runner',
        note: 'AUV reports operation readiness at call time; Windows permissions are not exposed as a separate probe.',
      })
      return {
        screenRecording: probe('screen capture'),
        accessibility: probe('input delivery'),
        automationToSystemEvents: probe('application activation'),
      } satisfies PermissionInfo
    },
    observeWindows: async (request, options = {}) => {
      const session = await ensureSession()
      return await callRunner(session, 'observe windows', async (runner) => {
        const [clients, frontmost] = await Promise.all([
          runner.windows.list({ signal: options.signal }),
          runner.windows.resolve({ frontmost: true }, { signal: options.signal }).catch(() => undefined),
        ])
        let windows = clients.map(mapWindow)
        if (request.app) {
          const needle = request.app.trim().toLowerCase()
          windows = windows.filter(window => window.appName.toLowerCase().includes(needle))
        }
        if (request.limit !== undefined)
          windows = windows.slice(0, Math.max(0, request.limit))
        const front = frontmost ? mapWindow(frontmost) : undefined
        return {
          frontmostAppName: front?.appName,
          frontmostWindowTitle: front?.title,
          windows,
          observedAt: new Date().toISOString(),
          provenance: {
            backend: 'auv',
            daemonId: session.daemonId,
            runId: session.runId,
            deviceId: session.deviceId,
            coordinateSpace: COORDINATE_SPACE,
          },
        } satisfies WindowObservation
      })
    },
    takeScreenshot: async (request, options = {}) => captureDisplay(await ensureSession(), request, options),
    openApp: async (input: OpenAppActionInput, options = {}) => {
      const session = await ensureSession()
      const activation = await callRunner(session, `activate app ${input.app}`, runner => runner.applications.activate({ applicationId: input.app }, { signal: options.signal }))
      return requireVerifiedActivation(activation, input.app, 'activated', config, session)
    },
    focusApp: async (input: FocusAppActionInput, options = {}) => {
      const session = await ensureSession()
      const activation = await callRunner(session, `focus app ${input.app}`, runner => runner.applications.activate({ applicationId: input.app }, { signal: options.signal }))
      return requireVerifiedActivation(activation, input.app, 'focused', config, session)
    },
    click: async (input: ClickActionInput & { pointerTrace: PointerTracePoint[] }, options = {}) => {
      const session = await ensureSession()
      const { window, point } = await resolveLocalPoint(session, options, { x: input.x, y: input.y })
      const inputResult = await callRunner(session, 'click window', current => current.windows.from(window).click(point, {
        button: buttonValue(input.button),
        click: { count: Math.max(1, input.clickCount ?? 1) },
        policy: InputPolicyValue.FOREGROUND_PREFERRED,
      }, { signal: options.signal }))
      assertDelivery(inputResult, 'click')
      return { ...actionResult(['AUV accepted the click delivery; inspect the captured application state for the requested effect'], executionTarget(config, session)), pointerTrace: input.pointerTrace }
    },
    typeText: async (input: TypeTextActionInput, options = {}) => {
      const session = await ensureSession()
      const window = await resolveTargetWindow(session, options)
      const inputResult = await callRunner(session, 'type text into window', current => current.windows.from(window).typeText(input.text, {
        policy: InputPolicyValue.FOREGROUND_PREFERRED,
      }, { signal: options.signal }))
      assertDelivery(inputResult, 'type text')
      if (input.pressEnter)
        assertDelivery(await callRunner(session, 'press Enter after typing', current => current.windows.from(window).pressKeys(['return'], { policy: InputPolicyValue.FOREGROUND_PREFERRED }, { signal: options.signal })), 'press Enter')
      return actionResult([`AUV accepted text delivery for ${input.text.length} characters; inspect the captured application state for the requested effect`], executionTarget(config, session))
    },
    pressKeys: async (input: PressKeysActionInput, options = {}) => {
      const session = await ensureSession()
      const window = await resolveTargetWindow(session, options)
      const inputResult = await callRunner(session, 'press keys in window', current => current.windows.from(window).pressKeys(input.keys, { policy: InputPolicyValue.FOREGROUND_PREFERRED }, { signal: options.signal }))
      assertDelivery(inputResult, 'press keys')
      return actionResult([`AUV accepted key delivery for ${input.keys.join('+')}; inspect the captured application state for the requested effect`], executionTarget(config, session))
    },
    scroll: async (input: ScrollActionInput, options = {}) => {
      const session = await ensureSession()
      const point = typeof input.x === 'number' && typeof input.y === 'number' ? { x: input.x, y: input.y } : undefined
      const window = point
        ? (await resolveLocalPoint(session, options, point)).window
        : await resolveTargetWindow(session, options)
      const bounds = window.window.frame
      if (!bounds)
        throw new AuvExecutorError('not_found', `target window ${window.id} has no usable frame`)
      const scrollPoint = point
        ? { x: point.x - bounds.x, y: point.y - bounds.y }
        : { x: bounds.width / 2, y: bounds.height / 2 }
      const scrollResult = await callRunner(session, 'scroll window', current => current.windows.from(window).scroll(scrollPoint, {
        deltaX: input.deltaX ?? 0,
        deltaY: input.deltaY,
      }, {}, { signal: options.signal }))
      assertDelivery(scrollResult, 'scroll')
      return actionResult(['AUV accepted the scroll delivery; inspect the captured application state for the requested effect'], executionTarget(config, session))
    },
    wait,
    close: async () => {
      knownSession = undefined
      await runtime.close()
    },
  }
}
