import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockContext {
  invokeHandlers: Map<string, (payload: never, options?: never) => unknown>
}

function createEmitter() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const eventHandlers = handlers.get(event) ?? []
      eventHandlers.push(handler)
      handlers.set(event, eventHandlers)
    }),
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? [])
        handler(...args)
    },
  }
}

async function setupScreenCapture() {
  const context: MockContext = { invokeHandlers: new Map() }
  let displayMediaHandler: unknown = null
  const setDisplayMediaRequestHandler = vi.fn((handler: unknown) => {
    displayMediaHandler = handler
  })
  const getSources = vi.fn(async () => [])
  const commandLineSwitches = new Map<string, string>()

  vi.doMock('electron', () => ({
    app: {
      commandLine: {
        appendSwitch: vi.fn((key: string, value: string) => commandLineSwitches.set(key, value)),
        getSwitchValue: vi.fn((key: string) => commandLineSwitches.get(key) ?? ''),
        hasSwitch: vi.fn((key: string) => commandLineSwitches.has(key)),
        removeSwitch: vi.fn((key: string) => commandLineSwitches.delete(key)),
      },
    },
    desktopCapturer: {
      getSources,
    },
    ipcMain: {},
    session: {
      defaultSession: {
        setDisplayMediaRequestHandler,
      },
    },
    shell: {
      openExternal: vi.fn(),
    },
    systemPreferences: {
      getMediaAccessStatus: vi.fn(),
    },
  }))

  vi.doMock('@moeru/eventa/adapters/electron/main', () => ({
    createContext: () => ({ context }),
  }))

  vi.doMock('@moeru/eventa', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@moeru/eventa')>()
    return {
      ...actual,
      defineInvokeHandler: (
        target: MockContext,
        eventa: { sendEvent: { id: string } },
        handler: (payload: never, options?: never) => unknown,
      ) => {
        target.invokeHandlers.set(eventa.sendEvent.id.replace(/-send$/, ''), handler)
      },
    }
  })

  vi.doMock('@guiiai/logg', () => ({
    useLogg: () => ({
      useGlobalConfig: () => ({
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        withError() {
          return this
        },
        withFields() {
          return this
        },
        withFormat() {
          return this
        },
        withLogLevelString() {
          return this
        },
      }),
    }),
  }))

  vi.doMock('nanoid', () => ({ nanoid: () => 'capture-handle' }))

  const screenCapture = await import('./index')
  screenCapture.initScreenCaptureForMain()

  const windowEvents = createEmitter()
  const webContentsEvents = createEmitter()
  const window = {
    ...windowEvents,
    getTitle: vi.fn(() => 'AIRI'),
    id: 7,
    isDestroyed: vi.fn(() => false),
    webContents: {
      ...webContentsEvents,
      id: 42,
    },
  }
  screenCapture.initScreenCaptureForWindow(window as never)

  return {
    context,
    getSources,
    getDisplayMediaHandler: () => displayMediaHandler,
    screenCapture,
    setDisplayMediaRequestHandler,
    window,
    webContents: window.webContents,
  }
}

describe('electron screen capture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('deduplicates Chromium feature flags', async () => {
    const { screenCapture } = await setupScreenCapture()
    const flags = screenCapture.buildFeatureFlags({
      otherEnabledFeatures: ['Vulkan', 'Vulkan', 'SharedArrayBuffer'],
    }).split(',')

    expect(flags).toEqual([...new Set(flags)])
  })

  it('clears a selected source when its renderer process exits', async () => {
    // ROOT CAUSE:
    //
    // The selected source and its mutex belong to the renderer that made the request.
    // A renderer exit does not reset either resource, so later capture requests can remain blocked.
    // The fix must release both resources when the owning renderer exits.
    const service = await setupScreenCapture()
    const setSource = service.context.invokeHandlers.get('eventa:invoke:electron:screen-capture:set-source')
    const resetSource = service.context.invokeHandlers.get('eventa:invoke:electron:screen-capture:reset-source')

    expect(setSource).toBeDefined()
    expect(resetSource).toBeDefined()

    const handle = await setSource!({
      options: { types: ['screen'] },
      sourceId: 'screen:1:0',
      timeout: 5000,
    } as never, {
      raw: { ipcMainEvent: { sender: { id: 42 } } },
    } as never) as string

    expect(service.screenCapture.hasSelectedScreenCaptureSource()).toBe(true)
    expect(service.getDisplayMediaHandler()).not.toBeNull()

    service.webContents.emit('render-process-gone', {}, { reason: 'crashed' })
    const sourceSelectedAfterCrash = service.screenCapture.hasSelectedScreenCaptureSource()
    const handlerAfterCrash = service.getDisplayMediaHandler()

    await resetSource!(handle as never)

    expect(sourceSelectedAfterCrash).toBe(false)
    expect(handlerAfterCrash).toBeNull()
  })

  it('clears a selected source when its owner window closes', async () => {
    // ROOT CAUSE:
    //
    // The source mutex outlives its BrowserWindow owner.
    // The closed window cannot reset the source, so another window can remain blocked until timeout.
    // The fix must release capture resources when the owner window closes.
    const service = await setupScreenCapture()
    const setSource = service.context.invokeHandlers.get('eventa:invoke:electron:screen-capture:set-source')

    expect(setSource).toBeDefined()

    await setSource!({
      options: { types: ['screen'] },
      sourceId: 'screen:1:0',
      timeout: 5000,
    } as never, {
      raw: { ipcMainEvent: { sender: { id: 42 } } },
    } as never)

    service.window.emit('closed')

    expect(service.screenCapture.hasSelectedScreenCaptureSource()).toBe(false)
    expect(service.getDisplayMediaHandler()).toBeNull()
  })

  // https://github.com/moeru-ai/airi/issues/2268
  it('clears capture authorization when the selected Wayland source is unavailable (Issue #2268)', async () => {
    // ROOT CAUSE:
    //
    // A portal or compositor can return a source that is unavailable when Electron starts capture.
    // The display handler throws but keeps the selection mutex and authorization active.
    // The fix must clear both resources after this failure.
    const service = await setupScreenCapture()
    const setSource = service.context.invokeHandlers.get('eventa:invoke:electron:screen-capture:set-source')

    expect(setSource).toBeDefined()

    await setSource!({
      options: { types: ['screen'] },
      sourceId: 'screen:1:0',
      timeout: 5000,
    } as never, {
      raw: { ipcMainEvent: { sender: { id: 42 } } },
    } as never)

    const displayMediaHandler = service.getDisplayMediaHandler() as (
      request: unknown,
      callback: (streams: unknown) => void,
    ) => Promise<void>
    await expect(displayMediaHandler({}, vi.fn())).rejects.toThrow('Source with id screen:1:0 not found.')

    expect(service.getSources).toHaveBeenCalled()
    expect(service.screenCapture.hasSelectedScreenCaptureSource()).toBe(false)
    expect(service.getDisplayMediaHandler()).toBeNull()
  })

  it('releases capture authorization after its timeout', async () => {
    const service = await setupScreenCapture()
    const setSource = service.context.invokeHandlers.get('eventa:invoke:electron:screen-capture:set-source')

    expect(setSource).toBeDefined()

    await setSource!({
      options: { types: ['screen'] },
      sourceId: 'screen:1:0',
      timeout: 1000,
    } as never, {
      raw: { ipcMainEvent: { sender: { id: 42 } } },
    } as never)
    await vi.advanceTimersByTimeAsync(1001)

    expect(service.screenCapture.hasSelectedScreenCaptureSource()).toBe(false)
    expect(service.getDisplayMediaHandler()).toBeNull()
  })
})
