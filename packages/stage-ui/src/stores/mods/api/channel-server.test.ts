import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const serverSdkMocks = vi.hoisted(() => {
  class MockClient {
    static instances: MockClient[] = []

    readonly listeners = new Map<string, Set<(event: any) => void | Promise<void>>>()
    readonly sent: any[] = []

    constructor(public readonly options: Record<string, any>) {
      MockClient.instances.push(this)
    }

    onEvent(type: string, callback: (event: any) => void | Promise<void>) {
      let callbacks = this.listeners.get(type)
      if (!callbacks) {
        callbacks = new Set()
        this.listeners.set(type, callbacks)
      }

      callbacks.add(callback)

      return () => {
        this.offEvent(type, callback)
      }
    }

    offEvent(type: string, callback?: (event: any) => void | Promise<void>) {
      const callbacks = this.listeners.get(type)
      if (!callbacks) {
        return
      }

      if (callback) {
        callbacks.delete(callback)
        if (!callbacks.size) {
          this.listeners.delete(type)
        }
        return
      }

      this.listeners.delete(type)
    }

    send(event: any) {
      this.sent.push(event)
      return true
    }

    close(code?: number, reason?: string) {
      this.options.onClose?.(code, reason)
    }

    emit(type: string, data: any) {
      const event = { type, data }
      for (const callback of this.listeners.get(type) ?? []) {
        void callback(event)
      }
    }

    simulateAuthenticated() {
      this.emit('module:authenticated', { authenticated: true })
    }

    simulateTransientDisconnect() {
      this.options.onClose?.(1005, '')
    }

    simulateClose(code?: number, reason?: string) {
      this.options.onClose?.(code, reason)
    }

    simulateReconnectReady() {
      this.options.onReady?.()
    }

    simulateError(error: unknown) {
      this.options.onError?.(error)
    }

    simulateStateChange(previousStatus: string, status: string) {
      this.options.onStateChange?.({ previousStatus, status })
    }
  }

  return {
    MockClient,
  }
})

vi.mock('@proj-airi/server-sdk', () => ({
  Client: serverSdkMocks.MockClient,
  WebSocketEventSource: {
    StageTamagotchi: 'proj-airi:stage-tamagotchi',
    StageWeb: 'proj-airi:stage-web',
  },
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isStageTamagotchi: () => true,
  isStageWeb: () => false,
}))

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')

  return {
    useLocalStorage: (_key: string, initialValue: string) => ref(initialValue),
  }
})

vi.mock('../../../devtools/websocket-inspector', () => ({
  useWebSocketInspectorStore: () => ({
    add: vi.fn(),
  }),
}))

const { useModsServerChannelStore } = await import('./channel-server')

describe('channel-server store reconnect', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    serverSdkMocks.MockClient.instances.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // Regression coverage for https://github.com/moeru-ai/airi/issues/1545
  it('issue #1545: restores connected state and flushes queued sends when the client reports ready after a reconnect', async () => {
    const store = useModsServerChannelStore()

    store.send({
      type: 'spark:notify',
      data: { message: 'before-init' },
    } as any)

    const initializePromise = store.initialize({ token: 'secret' })
    const client = serverSdkMocks.MockClient.instances[0]

    client.simulateAuthenticated()
    await initializePromise

    expect(store.connected).toBe(true)
    expect(store.pendingSendCount).toBe(0)
    expect(client.sent).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'spark:notify',
        data: { message: 'before-init' },
      }),
    ]))

    client.simulateTransientDisconnect()

    expect(store.connected).toBe(false)

    store.send({
      type: 'spark:notify',
      data: { message: 'queued-during-disconnect' },
    } as any)

    expect(store.pendingSendCount).toBe(1)

    client.simulateReconnectReady()

    expect(store.connected).toBe(true)
    expect(store.pendingSendCount).toBe(0)
    expect(client.sent).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'spark:notify',
        data: { message: 'queued-during-disconnect' },
      }),
    ]))
  })

  it('uses explicit heartbeat settings to avoid client/server timeout mismatch', async () => {
    const store = useModsServerChannelStore()

    const initializePromise = store.initialize({ token: 'secret' })
    const client = serverSdkMocks.MockClient.instances[0]

    client.simulateAuthenticated()
    await initializePromise

    expect(client.options.heartbeat).toEqual({
      readTimeout: 60_000,
      pingInterval: 20_000,
    })
  })

  it('notifies onReconnected callbacks when the websocket becomes ready again', async () => {
    const store = useModsServerChannelStore()
    const onReconnected = vi.fn()
    store.onReconnected(onReconnected)

    const initializePromise = store.initialize({ token: 'secret' })
    const client = serverSdkMocks.MockClient.instances[0]

    client.simulateAuthenticated()
    await initializePromise

    client.simulateTransientDisconnect()
    client.simulateReconnectReady()
    client.simulateReconnectReady()

    expect(onReconnected).toHaveBeenCalledTimes(1)
  })

  it('does not notify onReconnected on first authenticated->ready flow and only on subsequent ready events', async () => {
    const store = useModsServerChannelStore()
    const onReconnected = vi.fn()
    store.onReconnected(onReconnected)

    const initializePromise = store.initialize({ token: 'secret' })
    const client = serverSdkMocks.MockClient.instances[0]

    client.simulateAuthenticated()
    client.simulateReconnectReady()
    expect(onReconnected).toHaveBeenCalledTimes(0)

    client.simulateReconnectReady()
    expect(onReconnected).toHaveBeenCalledTimes(1)

    await initializePromise
  })

  it('continues invoking remaining onReconnected callbacks when one throws', async () => {
    const store = useModsServerChannelStore()
    const successfulCallback = vi.fn()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    store.onReconnected(() => {
      throw new Error('boom')
    })
    store.onReconnected(successfulCallback)

    const initializePromise = store.initialize({ token: 'secret' })
    const client = serverSdkMocks.MockClient.instances[0]

    client.simulateAuthenticated()
    await initializePromise

    client.simulateTransientDisconnect()
    client.simulateReconnectReady()
    client.simulateReconnectReady()

    expect(successfulCallback).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)

    consoleErrorSpy.mockRestore()
  })

  it('allows initialize retry after first handshake close before any successful connection', async () => {
    const store = useModsServerChannelStore()

    const firstInitializePromise = store.initialize({ token: 'invalid-token' })
    const firstClient = serverSdkMocks.MockClient.instances[0]

    firstClient.simulateClose(1008, 'invalid token')

    const secondInitializePromise = store.initialize({ token: 'valid-token' })
    const secondClient = serverSdkMocks.MockClient.instances[1]

    expect(secondInitializePromise).not.toBe(firstInitializePromise)
    expect(secondClient).toBeDefined()

    secondClient.simulateAuthenticated()
    await secondInitializePromise

    expect(store.connected).toBe(true)
  })

  it('allows initialize retry when sdk enters failed after a previous successful connection', async () => {
    const store = useModsServerChannelStore()

    const firstInitializePromise = store.initialize({ token: 'secret' })
    const firstClient = serverSdkMocks.MockClient.instances[0]

    firstClient.simulateAuthenticated()
    await firstInitializePromise

    firstClient.simulateStateChange('reconnecting', 'failed')

    const secondInitializePromise = store.initialize({ token: 'secret-rotated' })
    const secondClient = serverSdkMocks.MockClient.instances[1]

    expect(secondInitializePromise).not.toBe(firstInitializePromise)
    expect(secondClient).toBeDefined()

    secondClient.simulateAuthenticated()
    await secondInitializePromise

    expect(store.connected).toBe(true)
  })

  it('keeps the initialize lock on recoverable onError so auto-reconnect does not spawn a second client', () => {
    const store = useModsServerChannelStore()
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const firstInitializePromise = store.initialize({ token: 'secret' })
    const firstClient = serverSdkMocks.MockClient.instances[0]

    firstClient.simulateError(new Error('temporary websocket glitch'))

    const secondInitializePromise = store.initialize({ token: 'secret' })

    expect(secondInitializePromise).toBeInstanceOf(Promise)
    expect(firstInitializePromise).toBeInstanceOf(Promise)
    expect(serverSdkMocks.MockClient.instances).toHaveLength(1)

    consoleDebugSpy.mockRestore()
  })

  it('does not flush queued events on reconnect authenticated before ready', async () => {
    const store = useModsServerChannelStore()

    const initializePromise = store.initialize({ token: 'secret' })
    const client = serverSdkMocks.MockClient.instances[0]

    client.simulateAuthenticated()
    await initializePromise
    client.simulateReconnectReady()

    client.simulateTransientDisconnect()

    store.send({
      type: 'spark:notify',
      data: { message: 'reconnect-authenticated-queued' },
    } as any)

    expect(store.pendingSendCount).toBe(1)

    client.simulateAuthenticated()

    expect(store.connected).toBe(false)
    expect(store.pendingSendCount).toBe(1)

    client.simulateReconnectReady()

    expect(store.connected).toBe(true)
    expect(store.pendingSendCount).toBe(0)
    expect(client.sent).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'spark:notify',
        data: { message: 'reconnect-authenticated-queued' },
      }),
    ]))
  })

  it('does not reconnect while the url scheme is not valid', async () => {
    const store = useModsServerChannelStore()

    const initializePromise = store.initialize({ token: 'secret' })
    const firstClient = serverSdkMocks.MockClient.instances[0]

    firstClient.simulateAuthenticated()
    await initializePromise

    store.websocketUrl = 'wss:'
    await nextTick()

    expect(serverSdkMocks.MockClient.instances).toHaveLength(1)

    store.websocketUrl = 'wss://192.168.123.112:6121/ws'
    await nextTick()

    expect(serverSdkMocks.MockClient.instances).toHaveLength(2)
  })

  it('uses the persisted websocket auth token when initialize does not receive an explicit token', async () => {
    const store = useModsServerChannelStore()
    store.websocketAuthToken = 'persisted-secret'

    const initializePromise = store.initialize()
    const client = serverSdkMocks.MockClient.instances[0]

    expect(client.options.token).toBe('persisted-secret')

    client.simulateAuthenticated()
    await initializePromise
  })

  it('reconnects when the persisted websocket auth token changes', async () => {
    const store = useModsServerChannelStore()
    store.websocketAuthToken = 'initial-secret'

    const initializePromise = store.initialize()
    const firstClient = serverSdkMocks.MockClient.instances[0]

    firstClient.simulateAuthenticated()
    await initializePromise

    store.websocketAuthToken = 'rotated-secret'
    await nextTick()

    expect(serverSdkMocks.MockClient.instances.length).toBeGreaterThan(1)
    expect(serverSdkMocks.MockClient.instances.at(-1)?.options.token).toBe('rotated-secret')
  })
})
