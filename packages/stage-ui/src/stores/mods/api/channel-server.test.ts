import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

    close() {
      this.options.onClose?.()
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
      this.options.onClose?.()
    }

    simulateReconnectReady() {
      this.options.onReady?.()
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
})
