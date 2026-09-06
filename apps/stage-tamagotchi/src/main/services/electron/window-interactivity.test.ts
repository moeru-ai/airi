import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockContext {
  emit: ReturnType<typeof vi.fn>
  invokeHandlers: Map<string, (payload: unknown, options?: unknown) => unknown>
}

interface MockEmitter {
  emit: (event: string, ...args: unknown[]) => void
  on: ReturnType<typeof vi.fn>
}

function createEmitter(): MockEmitter {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const eventHandlers = handlers.get(event) ?? []
      eventHandlers.push(handler)
      handlers.set(event, eventHandlers)
    }),
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? [])
        handler(...args)
    },
  }
}

function createMockContext(): MockContext {
  return {
    emit: vi.fn(),
    invokeHandlers: new Map(),
  }
}

async function setupWindowService(options: { manageWindowInteractivity?: boolean } = {}) {
  const rendererLoop = {
    start: vi.fn(),
    stop: vi.fn(),
  }

  vi.doMock('@moeru/eventa', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@moeru/eventa')>()
    return {
      ...actual,
      defineInvokeHandler: (
        context: MockContext,
        eventa: { sendEvent: { id: string } },
        handler: (payload: unknown, options?: unknown) => unknown,
      ) => {
        context.invokeHandlers.set(eventa.sendEvent.id.replace(/-send$/, ''), handler)
      },
    }
  })

  vi.doMock('@proj-airi/electron-eventa', () => ({
    bounds: { id: 'bounds' },
    startLoopGetBounds: { sendEvent: { id: 'start-loop-send' } },
  }))

  vi.doMock('@proj-airi/electron-vueuse/main', () => ({
    createRendererLoop: () => rendererLoop,
    safeClose: vi.fn(),
  }))

  vi.doMock('../../../shared/eventa', () => ({
    electron: {
      window: {
        getBounds: { sendEvent: { id: 'get-bounds-send' } },
        resize: { sendEvent: { id: 'resize-send' } },
        setBackgroundMaterial: { sendEvent: { id: 'set-background-material-send' } },
        setBounds: { sendEvent: { id: 'set-bounds-send' } },
        setIgnoreMouseEvents: { sendEvent: { id: 'set-ignore-mouse-events-send' } },
        setVibrancy: { sendEvent: { id: 'set-vibrancy-send' } },
      },
    },
    electronGetWindowLifecycleState: { sendEvent: { id: 'get-lifecycle-send' } },
    electronWindowClose: { sendEvent: { id: 'close-send' } },
    electronWindowLifecycleChanged: { id: 'lifecycle-changed' },
    electronWindowSetAlwaysOnTop: { sendEvent: { id: 'set-always-on-top-send' } },
  }))

  vi.doMock('../../libs/bootkit/lifecycle', () => ({
    onAppBeforeQuit: vi.fn(),
    onAppWindowAllClosed: vi.fn(),
  }))

  vi.doMock('../../windows/shared/window', () => ({
    resizeWindowByDelta: vi.fn(),
  }))

  vi.doMock('std-env', () => ({ isWindows: process.platform === 'win32' }))

  const windowEvents = createEmitter()
  const webContentsEvents = createEmitter()
  const setIgnoreMouseEvents = vi.fn()
  const window = {
    ...windowEvents,
    getBounds: vi.fn(() => ({ height: 600, width: 800, x: 0, y: 0 })),
    isFocused: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    setAlwaysOnTop: vi.fn(),
    setBackgroundMaterial: vi.fn(),
    setBounds: vi.fn(),
    setIgnoreMouseEvents,
    setVibrancy: vi.fn(),
    webContents: {
      ...webContentsEvents,
      id: 42,
    },
  }
  const context = createMockContext()
  const { createWindowService } = await import('./window')
  createWindowService({
    context: context as never,
    window: window as never,
    manageWindowInteractivity: options.manageWindowInteractivity,
  })

  return {
    context,
    setIgnoreMouseEvents,
    webContents: window.webContents,
  }
}

function sameWindowOptions() {
  return {
    raw: {
      ipcMainEvent: {
        sender: { id: 42 },
      },
    },
  }
}

describe('window interactivity recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.clearAllMocks()
  })

  // https://github.com/moeru-ai/airi/issues/2160
  it('starts each managed window with mouse input enabled (Issue #2160)', async () => {
    // ROOT CAUSE:
    //
    // The main process does not establish a fail-open input state when it registers a window.
    // A recreated native window can therefore depend on stale renderer state.
    // The fix must make the main process set the initial input state.
    const service = await setupWindowService()

    expect(service.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
  })

  it('preserves input isolation for a visual-only overlay', async () => {
    const service = await setupWindowService({ manageWindowInteractivity: false })

    expect(service.setIgnoreMouseEvents).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/issues/2160
  it('restores mouse input when the renderer process exits (Issue #2160)', async () => {
    // ROOT CAUSE:
    //
    // The renderer owns the native click-through state.
    // A renderer exit stops the code that can call `setIgnoreMouseEvents(false)`.
    // The fix must make the main process restore input after a renderer exit.
    const service = await setupWindowService()
    const handler = service.context.invokeHandlers.get('set-ignore-mouse-events')

    expect(handler).toBeDefined()
    handler!([true, { forward: true }], sameWindowOptions())
    service.webContents.emit('render-process-gone', {}, { reason: 'crashed' })

    expect(service.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
  })

  // https://github.com/moeru-ai/airi/issues/2160
  it('restores mouse input when the renderer becomes unresponsive (Issue #2160)', async () => {
    // ROOT CAUSE:
    //
    // An unresponsive renderer cannot send the request that restores native mouse input.
    // The fix must let the main process restore input without renderer cooperation.
    const service = await setupWindowService()
    const handler = service.context.invokeHandlers.get('set-ignore-mouse-events')

    expect(handler).toBeDefined()
    handler!([true, { forward: true }], sameWindowOptions())
    service.webContents.emit('unresponsive')

    expect(service.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
  })

  // https://github.com/moeru-ai/airi/issues/2160
  it('restores mouse input before renderer navigation (Issue #2160)', async () => {
    // ROOT CAUSE:
    //
    // Renderer navigation disposes the code that owns the current click-through state.
    // The fix must restore input before the old renderer lifecycle ends.
    const service = await setupWindowService()
    const handler = service.context.invokeHandlers.get('set-ignore-mouse-events')

    expect(handler).toBeDefined()
    handler!([true, { forward: true }], sameWindowOptions())
    service.webContents.emit('did-start-navigation', {}, 'file:///app/index.html', false, true)

    expect(service.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
  })

  // https://github.com/moeru-ai/airi/issues/2160
  it('restores mouse input when a click-through lease expires (Issue #2160)', async () => {
    // ROOT CAUSE:
    //
    // A click-through request has no lifetime and remains active until another renderer request changes it.
    // The fix must give this transient state a bounded lease that fails open.
    const service = await setupWindowService()
    const handler = service.context.invokeHandlers.get('set-ignore-mouse-events')

    expect(handler).toBeDefined()
    handler!([true, { forward: true }], sameWindowOptions())
    await vi.advanceTimersByTimeAsync(2001)

    expect(service.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
  })
})
