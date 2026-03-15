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

  it('uses registry events for service liveness and does not infer liveness from context updates', async () => {
    const { useMinecraftStore } = await import('./gaming-minecraft')
    const store = useMinecraftStore()

    let contextHandler: ((event: any) => void) | undefined
    const eventHandlers = new Map<string, (event: any) => void>()
    onContextUpdate.mockImplementation((callback: (event: any) => void) => {
      contextHandler = callback
      return () => {}
    })
    onEvent.mockImplementation((type: string, callback: (event: any) => void) => {
      eventHandlers.set(type, callback)
      return () => {}
    })

    store.initialize()
    store.integrationEnabled = true

    contextHandler?.({
      data: {
        lane: 'game',
        text: 'Bot online: airi-bot\nServer: mc.example.com:25565',
        hints: ['startup', 'airi-bot'],
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
    expect(store.serviceConnected).toBe(false)
    expect(store.latestRuntimeContextText).toContain('Bot online: airi-bot')
    expect(send).not.toHaveBeenCalled()

    eventHandlers.get('registry:modules:sync')?.({
      data: {
        modules: [{
          name: 'minecraft-bot',
          identity: {
            kind: 'plugin',
            plugin: { id: 'minecraft-bot' },
          },
        }],
      },
      metadata: {
        source: { kind: 'server' },
      },
    })

    expect(store.serviceConnected).toBe(true)

    eventHandlers.get('registry:modules:health:unhealthy')?.({
      data: {
        name: 'minecraft-bot',
        identity: {
          kind: 'plugin',
          plugin: { id: 'minecraft-bot' },
        },
        reason: 'heartbeat late',
      },
      metadata: {
        source: { kind: 'server' },
      },
    })

    expect(store.serviceConnected).toBe(false)
  })

  it('captures only bot-originated runtime context and minecraft-directed traffic for debug view', async () => {
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
        lane: 'game',
        text: 'Started task: gather wood',
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
        lane: 'minecraft:status',
        text: 'Bot error',
        content: {
          botState: 'error',
          lastError: 'bad config',
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

    expect(store.latestRuntimeContextText).toContain('Started task: gather wood')
    expect(store.trafficEntries).toHaveLength(2)
    expect(store.trafficEntries.map(entry => entry.type)).toEqual([
      'context:update',
      'spark:command',
    ])
    expect(store.trafficEntries[0]?.summary).toContain('game')
    expect(store.trafficEntries[1]?.summary).toContain('action')
  })
})
