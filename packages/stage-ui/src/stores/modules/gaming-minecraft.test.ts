import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const onContextUpdate = vi.fn()
const onEvent = vi.fn()
const send = vi.fn()

vi.mock('../mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    onContextUpdate,
    onEvent,
    send,
  }),
}))

describe('useMinecraftStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    onContextUpdate.mockReset()
    onEvent.mockReset()
    send.mockReset()
  })

  it('uses a local integration toggle and passive minecraft status heartbeats', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1))

    const { useMinecraftStore } = await import('./gaming-minecraft')
    const store = useMinecraftStore()

    let contextHandler: ((event: any) => void) | undefined
    onContextUpdate.mockImplementation((callback: (event: any) => void) => {
      contextHandler = callback
      return () => {}
    })
    onEvent.mockImplementation(() => () => {})

    store.initialize()
    store.integrationEnabled = true

    contextHandler?.({
      data: {
        lane: 'minecraft:status',
        text: 'Bot connected',
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

    expect(store.integrationEnabled).toBe(true)
    expect(store.configured).toBe(true)
    expect(store.serviceConnected).toBe(true)
    expect(store.botState).toBe('connected')
    expect(store.statusSnapshot?.editableConfig?.username).toBe('airi-bot')
    expect(send).not.toHaveBeenCalled()

    vi.setSystemTime(new Date(30_000))
    vi.advanceTimersByTime(30_000)

    expect(store.serviceConnected).toBe(false)

    vi.useRealTimers()
  })

  it('captures minecraft-only traffic for the debug view', async () => {
    const { useMinecraftStore } = await import('./gaming-minecraft')
    const store = useMinecraftStore()

    let contextHandler: ((event: any) => void) | undefined
    let sparkCommandHandler: ((event: any) => void) | undefined
    onContextUpdate.mockImplementation((callback: (event: any) => void) => {
      contextHandler = callback
      return () => {}
    })
    onEvent.mockImplementation((type: string, callback: (event: any) => void) => {
      if (type === 'spark:command')
        sparkCommandHandler = callback
      return () => {}
    })

    store.initialize()

    contextHandler?.({
      data: {
        lane: 'minecraft:status',
        text: 'Bot connected',
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

    contextHandler?.({
      data: {
        lane: 'game',
        text: 'Bot online in world',
      },
      metadata: {
        source: {
          plugin: { id: 'minecraft-bot' },
          id: 'minecraft-bot-instance',
        },
      },
    })

    contextHandler?.({
      data: {
        lane: 'general',
        text: 'Discord update',
      },
      metadata: {
        source: {
          plugin: { id: 'discord' },
          id: 'discord-instance',
        },
      },
    })

    sparkCommandHandler?.({
      data: {
        commandId: 'cmd-1',
        intent: 'action',
        interrupt: false,
        priority: 'normal',
        destinations: ['minecraft-bot'],
      },
      metadata: {
        source: {
          plugin: { id: 'stage-web' },
          id: 'stage-web-instance',
        },
      },
    })

    sparkCommandHandler?.({
      data: {
        commandId: 'cmd-2',
        intent: 'action',
        interrupt: false,
        priority: 'normal',
        destinations: ['discord'],
      },
      metadata: {
        source: {
          plugin: { id: 'stage-web' },
          id: 'stage-web-instance',
        },
      },
    })

    expect(store.trafficEntries).toHaveLength(3)
    expect(store.trafficEntries.map(entry => entry.type)).toEqual([
      'context:update',
      'context:update',
      'spark:command',
    ])
    expect(store.trafficEntries[0]?.summary).toContain('minecraft:status')
    expect(store.trafficEntries[1]?.summary).toContain('game')
    expect(store.trafficEntries[2]?.summary).toContain('action')
  })
})
