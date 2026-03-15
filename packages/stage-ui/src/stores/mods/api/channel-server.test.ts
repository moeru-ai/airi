import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createdClients: FakeClient[] = []

class FakeClient {
  private listeners = new Map<string, Set<(event: any) => void>>()

  constructor(public readonly options: Record<string, any>) {
    createdClients.push(this)
  }

  onEvent(event: string, callback: (event: any) => void) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(callback)
    this.listeners.set(event, listeners)
  }

  offEvent(event: string, callback?: (event: any) => void) {
    if (!callback) {
      this.listeners.delete(event)
      return
    }

    const listeners = this.listeners.get(event)
    listeners?.delete(callback)
    if (listeners?.size === 0)
      this.listeners.delete(event)
  }

  send = vi.fn()

  close() {
    this.options.onClose?.()
  }

  emit(event: string, payload: any) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload)
    }
  }
}

vi.mock('@proj-airi/server-sdk', () => ({
  Client: FakeClient,
  WebSocketEventSource: {
    StageWeb: 'stage-web',
    StageTamagotchi: 'stage-tamagotchi',
  },
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isStageWeb: () => true,
  isStageTamagotchi: () => false,
}))

vi.mock('../../devtools/websocket-inspector', () => ({
  useWebSocketInspectorStore: () => ({
    add: vi.fn(),
  }),
}))

describe('useModsServerChannelStore', () => {
  beforeEach(() => {
    createdClients.length = 0
    setActivePinia(createPinia())
    vi.resetModules()
  })

  it('delivers listeners that were registered before the websocket client authenticated', async () => {
    const { useModsServerChannelStore } = await import('./channel-server')
    const store = useModsServerChannelStore()
    const handler = vi.fn()

    store.onEvent('registry:modules:sync', handler as any)

    const client = createdClients.at(-1)
    expect(client).toBeDefined()

    client!.emit('module:authenticated', {
      data: { authenticated: true },
    })

    client!.emit('registry:modules:sync', {
      data: {
        modules: [{
          name: 'minecraft-bot',
          identity: { kind: 'plugin', plugin: { id: 'minecraft-bot' } },
        }],
      },
      metadata: {
        source: { kind: 'server' },
      },
    })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('rebinds stored listeners after reconnect', async () => {
    const { useModsServerChannelStore } = await import('./channel-server')
    const store = useModsServerChannelStore()
    const handler = vi.fn()

    store.onEvent('registry:modules:sync', handler as any)

    const firstClient = createdClients.at(-1)
    expect(firstClient).toBeDefined()

    firstClient!.emit('module:authenticated', {
      data: { authenticated: true },
    })
    firstClient!.emit('registry:modules:sync', {
      data: { modules: [] },
      metadata: { source: { kind: 'server' } },
    })

    firstClient!.close()

    const reconnectPromise = store.initialize()
    const secondClient = createdClients.at(-1)
    expect(secondClient).not.toBe(firstClient)

    secondClient!.emit('module:authenticated', {
      data: { authenticated: true },
    })
    await reconnectPromise

    secondClient!.emit('registry:modules:sync', {
      data: { modules: [] },
      metadata: { source: { kind: 'server' } },
    })

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('does not bind disposed listeners on a later connection', async () => {
    const { useModsServerChannelStore } = await import('./channel-server')
    const store = useModsServerChannelStore()
    const handler = vi.fn()

    const dispose = store.onEvent('registry:modules:sync', handler as any)
    dispose()

    const client = createdClients.at(-1)
    expect(client).toBeDefined()

    client!.emit('module:authenticated', {
      data: { authenticated: true },
    })
    client!.emit('registry:modules:sync', {
      data: { modules: [] },
      metadata: { source: { kind: 'server' } },
    })

    expect(handler).not.toHaveBeenCalled()
  })
})
