import type { TauriInternals } from './types'
import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  electron,
  electronGetServerChannelQrPayload,
  electronGetWindowLifecycleState,
  stageTauriManagedWindowOpen,
  widgetsAdd,
  widgetsFetch,
  widgetsPrepareWindow,
} from '../contracts'
import { buildIpcRendererLike, createContextFromTauriIpc, subscribeTauriEvent } from './index'

type TauriCallback = (...args: unknown[]) => unknown

const { listenMock, invokeMock, registeredHandlers } = vi.hoisted(() => {
  const registeredHandlers = new Map<string, (event: any) => void>()
  const listenMock = vi.fn(async (eventName: string, handler: (event: any) => void) => {
    registeredHandlers.set(eventName, handler)
    return vi.fn(() => {
      registeredHandlers.delete(eventName)
    })
  })
  const invokeMock = vi.fn(async () => undefined)
  return { listenMock, invokeMock, registeredHandlers }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

function fireChannel(eventName: string, payload: any): void {
  const handler = registeredHandlers.get(eventName)
  if (!handler) throw new Error(`no registered listener for "${eventName}"`)
  handler({ event: eventName, id: 0, payload })
}

beforeEach(() => {
  listenMock.mockClear()
  invokeMock.mockClear()
  registeredHandlers.clear()
})

function buildMockInternals(): TauriInternals {
  const callbacks = new Map<number, TauriCallback>()
  let nextId = 1

  return {
    ipc: vi.fn(),
    invoke: vi.fn(async () => ({})),
    transformCallback: vi.fn((fn: TauriCallback) => {
      const id = nextId++
      callbacks.set(id, fn)
      return id
    }),
    unregisterCallback: vi.fn((id: number) => {
      callbacks.delete(id)
    }),
    convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
  }
}

describe('createContextFromTauriIpc', () => {
  it('should return a non-null eventa context', () => {
    const internals = buildMockInternals()
    const { context } = createContextFromTauriIpc(internals)
    expect(context).toBeTruthy()
    expect(typeof context.emit).toBe('function')
    expect(typeof context.on).toBe('function')
    expect(typeof context.off).toBe('function')
  })

  it('bridges eventa context.on subscriptions to Tauri native events', async () => {
    const internals = buildMockInternals()
    const { context } = createContextFromTauriIpc(internals)
    const listener = vi.fn()

    context.on({ id: 'eventa:event:electron:screen:cursor-screen-point', type: 'event' } as any, listener)

    expect(listenMock).toHaveBeenCalledWith('electron:screen:cursor-screen-point', expect.any(Function))
    await new Promise((resolve) => setTimeout(resolve, 0))
    fireChannel('electron:screen:cursor-screen-point', { x: 3, y: 4 })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0]).toMatchObject({
      id: 'eventa:event:electron:screen:cursor-screen-point',
      type: 'event',
      body: { x: 3, y: 4 },
    })
  })

  it('should dispose context and unsubscribe', () => {
    const internals = buildMockInternals()
    const { context, dispose } = createContextFromTauriIpc(internals)

    dispose()
    expect(() => {
      context.on({ id: 'x', type: 'event' } as any, () => {})
    }).not.toThrow()
  })

  it('sends ipc on outbound event emit (fire-and-forget)', () => {
    const internals = buildMockInternals()
    const { context } = createContextFromTauriIpc(internals)

    context.emit({ id: 'eventa:invoke:electron:window:get-bounds', type: 'event' } as any, undefined)

    expect(internals.ipc).toHaveBeenCalledOnce()
    const [msg] = (internals.ipc as any).mock.calls[0]
    expect(msg.cmd).toBe('eventa-message')
    expect(msg.payload).toBeTruthy()
  })

  it('bridges native eventa context.emit calls to the Rust event broadcaster', () => {
    const internals = buildMockInternals()
    const { context } = createContextFromTauriIpc(internals)

    context.emit({ id: 'eventa:event:electron:window:bounds', type: 'event' } as any, {
      x: 7,
      y: 8,
      width: 9,
      height: 10,
    })

    expect(invokeMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledWith('emit_event', {
      target: 'all',
      eventName: 'electron:window:bounds',
      payload: { x: 7, y: 8, width: 9, height: 10 },
    })
    expect(internals.ipc).not.toHaveBeenCalled()
  })

  it('maps eventa window get-bounds invokes to the registered Tauri command', async () => {
    const internals = buildMockInternals()
    vi.mocked(internals.invoke).mockResolvedValue({ x: 0, y: 0, width: 100, height: 100 })

    const { context } = createContextFromTauriIpc(internals)
    const getBounds = defineInvoke(context, electron.window.getBounds)

    const result = await getBounds()

    expect(internals.invoke).toHaveBeenCalledWith('electron_window_get_bounds', undefined)
    expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('maps eventa window lifecycle state invokes to the registered Tauri command', async () => {
    const internals = buildMockInternals()
    vi.mocked(internals.invoke).mockResolvedValue({
      focused: true,
      minimized: false,
      reason: 'snapshot',
      updatedAt: 123,
      visible: true,
    })

    const { context } = createContextFromTauriIpc(internals)
    const getLifecycleState = defineInvoke(context, electronGetWindowLifecycleState)

    const result = await getLifecycleState()

    expect(internals.invoke).toHaveBeenCalledWith('electron_window_get_lifecycle_state', undefined)
    expect(result).toEqual({
      focused: true,
      minimized: false,
      reason: 'snapshot',
      updatedAt: 123,
      visible: true,
    })
  })

  it('maps server-channel QR payload invokes to the registered Tauri command', async () => {
    const internals = buildMockInternals()
    vi.mocked(internals.invoke).mockResolvedValue({
      type: 'airi:server-channel',
      version: 1,
      urls: ['ws://192.168.1.10:49152/ws'],
      authToken: 'test-token',
    })

    const { context } = createContextFromTauriIpc(internals)
    const getQrPayload = defineInvoke(context, electronGetServerChannelQrPayload)

    const result = await getQrPayload()

    expect(internals.invoke).toHaveBeenCalledWith('electron_server_channel_get_qr_payload', undefined)
    expect(result).toEqual({
      type: 'airi:server-channel',
      version: 1,
      urls: ['ws://192.168.1.10:49152/ws'],
      authToken: 'test-token',
    })
  })

  it('maps request-window factory invokes to their registered Tauri commands', async () => {
    const internals = buildMockInternals()
    vi.mocked(internals.invoke).mockResolvedValue(true)

    const { context } = createContextFromTauriIpc(internals)
    const cases = [
      {
        id: 'eventa:invoke:open:electron:windows:notice',
        command: 'electron_windows_notice_invoke_open',
        payload: { id: 'notice-1', route: '/notice/fade-on-hover' },
      },
      {
        id: 'eventa:invoke:action:electron:windows:notice',
        command: 'electron_windows_notice_invoke_action',
        payload: { id: 'notice-1', action: 'confirm' },
      },
      {
        id: 'eventa:invoke:page-mounted:electron:windows:notice',
        command: 'electron_windows_notice_invoke_page_mounted',
        payload: { id: 'notice-1' },
      },
      {
        id: 'eventa:invoke:page-unmounted:electron:windows:notice',
        command: 'electron_windows_notice_invoke_page_unmounted',
        payload: { id: 'notice-1' },
      },
    ] as const

    for (const { id, command, payload } of cases) {
      const eventa = defineInvokeEventa<boolean, typeof payload>(id)
      const invoke = defineInvoke(context, eventa)
      const result = await invoke(payload)

      expect(internals.invoke).toHaveBeenLastCalledWith(command, payload)
      expect(result).toBe(true)
    }
  })

  it('maps managed stage-window invokes to the registered Tauri command', async () => {
    const internals = buildMockInternals()
    vi.mocked(internals.invoke).mockResolvedValue({ label: 'about', route: '/about', reused: false })

    const { context } = createContextFromTauriIpc(internals)
    const openManagedWindow = defineInvoke(context, stageTauriManagedWindowOpen)

    const result = await openManagedWindow({ label: 'about' })

    expect(internals.invoke).toHaveBeenCalledWith('stage_tauri_managed_window_open', { label: 'about' })
    expect(result).toEqual({ label: 'about', route: '/about', reused: false })
  })

  it('exports widget invoke contracts that map to registered Tauri commands', async () => {
    const internals = buildMockInternals()
    vi.mocked(internals.invoke).mockResolvedValue('widget-1')

    const { context } = createContextFromTauriIpc(internals)
    const addWidget = defineInvoke(context, widgetsAdd)
    const fetchWidget = defineInvoke(context, widgetsFetch)
    const prepareWidget = defineInvoke(context, widgetsPrepareWindow)

    await addWidget({ componentName: 'demo' })
    await fetchWidget({ id: 'widget-1' })
    await prepareWidget({ id: 'widget-1' })

    expect(internals.invoke).toHaveBeenNthCalledWith(1, 'electron_windows_widgets_add', { componentName: 'demo' })
    expect(internals.invoke).toHaveBeenNthCalledWith(2, 'electron_windows_widgets_fetch', { id: 'widget-1' })
    expect(internals.invoke).toHaveBeenNthCalledWith(3, 'electron_windows_widgets_prepare', { id: 'widget-1' })
  })

  it('re-exports pubsub helpers from the tauri adapter entry', () => {
    // The pubsub adapter is a separate module but consumers import the
    // `./index` barrel; assert the bridge surface is reachable.
    expect(typeof subscribeTauriEvent).toBe('function')
  })
})

describe('buildIpcRendererLike memory leaks', () => {
  it('post() called many times only registers transformCallback ONCE total', () => {
    const internals = buildMockInternals()
    const ipcRenderer = buildIpcRendererLike(internals) as any

    // Call post/send many times — each call used to register two throwaway
    // callbacks, leaking one entry per call in the JS callback registry.
    for (let i = 0; i < 25; i++) {
      ipcRenderer.send('some-channel', { n: i })
    }

    // A single shared dummy callback (registered with once=false) should be
    // reused across every post() invocation, so transformCallback is invoked
    // exactly once total — not twice per call.
    expect(internals.transformCallback).toHaveBeenCalledOnce()
    expect(internals.ipc).toHaveBeenCalledTimes(25)
  })

  it('removeAllListeners(channel) calls unregisterCallback with the bridge id', () => {
    const internals = buildMockInternals()
    const ipcRenderer = buildIpcRendererLike(internals) as any
    const listener = vi.fn()

    // Registering on() creates a native bridge callback.
    ipcRenderer.on('leak-channel', listener)
    expect(internals.transformCallback).toHaveBeenCalledOnce()
    const bridgeId = (internals.transformCallback as any).mock.results[0].value
    expect(typeof bridgeId).toBe('number')

    // removeAllListeners should tear down the native bridge.
    ipcRenderer.removeAllListeners('leak-channel')

    expect(internals.unregisterCallback).toHaveBeenCalledWith(bridgeId)
    expect(internals.unregisterCallback).toHaveBeenCalledOnce()
  })

  it('removeListener(channel, listener) that empties the bucket calls unregisterCallback', () => {
    const internals = buildMockInternals()
    const ipcRenderer = buildIpcRendererLike(internals) as any
    const listener = vi.fn()

    // Registering on() creates a native bridge callback.
    ipcRenderer.on('leak-channel', listener)
    expect(internals.transformCallback).toHaveBeenCalledOnce()
    const bridgeId = (internals.transformCallback as any).mock.results[0].value
    expect(typeof bridgeId).toBe('number')

    // Removing the sole listener empties the bucket, which should tear down
    // the native bridge via the stored offFn (internals.unregisterCallback).
    ipcRenderer.removeListener('leak-channel', listener)

    expect(internals.unregisterCallback).toHaveBeenCalledWith(bridgeId)
    expect(internals.unregisterCallback).toHaveBeenCalledOnce()
  })

  it('removeListener(channel, listener) with remaining listeners does NOT unregister', () => {
    const internals = buildMockInternals()
    const ipcRenderer = buildIpcRendererLike(internals) as any
    const listenerA = vi.fn()
    const listenerB = vi.fn()

    // Register two listeners on the same channel — bridge is created once.
    ipcRenderer.on('shared-channel', listenerA)
    ipcRenderer.on('shared-channel', listenerB)
    expect(internals.transformCallback).toHaveBeenCalledOnce()

    // Removing one of two listeners should NOT unregister the native bridge
    // because the bucket is not empty.
    ipcRenderer.removeListener('shared-channel', listenerA)
    expect(internals.unregisterCallback).not.toHaveBeenCalled()
  })
})
