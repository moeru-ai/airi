import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
const onContextUpdate = vi.fn()

vi.mock('../mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    send,
    onContextUpdate,
  }),
}))

describe('useMinecraftStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    send.mockReset()
    onContextUpdate.mockReset()
  })

  it('tracks heartbeat-backed service status and syncs draft config from minecraft:status', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1))

    const { useMinecraftStore } = await import('./gaming-minecraft')
    const store = useMinecraftStore()

    let handler: ((event: any) => void) | undefined
    onContextUpdate.mockImplementation((callback: (event: any) => void) => {
      handler = callback
      return () => {}
    })

    store.initialize()

    handler?.({
      data: {
        lane: 'minecraft:status',
        content: {
          serviceName: 'minecraft-bot',
          botState: 'connected',
          editableConfig: {
            enabled: true,
            host: 'mc.example.com',
            port: 25565,
            username: 'airi-bot',
          },
          updatedAt: 1,
        },
      },
      metadata: {
        source: {
          plugin: { id: 'minecraft-bot' },
          id: 'minecraft-bot-instance',
        },
      },
    })

    expect(store.serviceConnected).toBe(true)
    expect(store.botState).toBe('connected')
    expect(store.serviceName).toBe('minecraft-bot')
    expect(store.enabled).toBe(true)
    expect(store.serverAddress).toBe('mc.example.com')
    expect(store.serverPort).toBe(25565)
    expect(store.username).toBe('airi-bot')
    expect(store.canEdit).toBe(true)

    vi.setSystemTime(new Date(30_000))
    vi.advanceTimersByTime(30_000)

    expect(store.serviceConnected).toBe(false)
    expect(store.canEdit).toBe(false)

    vi.useRealTimers()
  })

  it('sends live config updates to the connected minecraft service and clears applying on matching heartbeat', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1))

    const { useMinecraftStore } = await import('./gaming-minecraft')
    const store = useMinecraftStore()

    let handler: ((event: any) => void) | undefined
    onContextUpdate.mockImplementation((callback: (event: any) => void) => {
      handler = callback
      return () => {}
    })

    store.initialize()

    handler?.({
      data: {
        lane: 'minecraft:status',
        content: {
          serviceName: 'minecraft-bot',
          botState: 'connected',
          editableConfig: {
            enabled: true,
            host: 'mc.example.com',
            port: 25565,
            username: 'airi-bot',
          },
          updatedAt: 1,
        },
      },
      metadata: {
        source: {
          plugin: { id: 'minecraft-bot' },
          id: 'minecraft-bot-instance',
        },
      },
    })

    store.serverAddress = 'saved.example.com'
    store.serverPort = 24444
    store.username = 'saved-bot'

    await store.saveAndApply()

    expect(send).toHaveBeenCalledWith({
      type: 'ui:configure',
      data: {
        moduleName: 'minecraft-bot',
        config: {
          enabled: true,
          host: 'saved.example.com',
          port: 24444,
          username: 'saved-bot',
        },
      },
    })
    expect(store.applying).toBe(true)

    handler?.({
      data: {
        lane: 'minecraft:status',
        content: {
          serviceName: 'minecraft-bot',
          botState: 'connecting',
          editableConfig: {
            enabled: true,
            host: 'saved.example.com',
            port: 24444,
            username: 'saved-bot',
          },
          updatedAt: 1_000,
        },
      },
      metadata: {
        source: {
          plugin: { id: 'minecraft-bot' },
          id: 'minecraft-bot-instance',
        },
      },
    })

    expect(store.applying).toBe(false)
    expect(store.lastError).toBe('')

    vi.useRealTimers()
  })

  it('does not clobber the local draft when a stale heartbeat arrives during apply', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1))

    const { useMinecraftStore } = await import('./gaming-minecraft')
    const store = useMinecraftStore()

    let handler: ((event: any) => void) | undefined
    onContextUpdate.mockImplementation((callback: (event: any) => void) => {
      handler = callback
      return () => {}
    })

    store.initialize()

    handler?.({
      data: {
        lane: 'minecraft:status',
        content: {
          serviceName: 'minecraft-bot',
          botState: 'connected',
          editableConfig: {
            enabled: true,
            host: 'mc.example.com',
            port: 25565,
            username: 'airi-bot',
          },
          updatedAt: 1,
        },
      },
      metadata: {
        source: {
          plugin: { id: 'minecraft-bot' },
          id: 'minecraft-bot-instance',
        },
      },
    })

    store.username = 'saved-bot'
    await store.saveAndApply()

    handler?.({
      data: {
        lane: 'minecraft:status',
        content: {
          serviceName: 'minecraft-bot',
          botState: 'connected',
          editableConfig: {
            enabled: true,
            host: 'mc.example.com',
            port: 25565,
            username: 'airi-bot',
          },
          updatedAt: 2,
        },
      },
      metadata: {
        source: {
          plugin: { id: 'minecraft-bot' },
          id: 'minecraft-bot-instance',
        },
      },
    })

    expect(store.username).toBe('saved-bot')
    expect(store.applying).toBe(true)

    vi.useRealTimers()
  })
})
