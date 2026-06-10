import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMinecraftStore } from './gaming-minecraft'

const channelListeners = vi.hoisted(() => {
  return new Map<string, Array<(event: unknown) => void | Promise<void>>>()
})

function registerChannelListener(type: string, callback: (event: unknown) => void | Promise<void>) {
  const listeners = channelListeners.get(type) ?? []
  listeners.push(callback)
  channelListeners.set(type, listeners)

  return () => {
    const nextListeners = channelListeners.get(type)?.filter(listener => listener !== callback) ?? []
    channelListeners.set(type, nextListeners)
  }
}

vi.mock('../mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    onContextUpdate: (callback: (event: unknown) => void | Promise<void>) => registerChannelListener('context:update', callback),
    onEvent: (type: string, callback: (event: unknown) => void | Promise<void>) => registerChannelListener(type, callback),
  }),
}))

function emitServerEvent<E extends keyof WebSocketEvents>(type: E, data: WebSocketEvents[E]) {
  const event: WebSocketBaseEvent<E, WebSocketEvents[E]> = {
    type,
    data,
    metadata: {
      source: {
        kind: 'plugin',
        plugin: { id: 'server' },
        id: 'server',
      },
      event: {
        id: `${String(type)}-1`,
      },
    },
  }

  for (const listener of channelListeners.get(type as string) ?? []) {
    void listener(event)
  }
}

/**
 * @example
 * describe('minecraft store', () => {})
 */
describe('minecraft store', () => {
  let minecraftStore: ReturnType<typeof useMinecraftStore> | undefined

  beforeEach(() => {
    channelListeners.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    minecraftStore?.dispose()
    minecraftStore = undefined
  })

  /**
   * @example
   * it('keeps the Minecraft service offline when registry sync only confirms module presence', () => {})
   */
  it('keeps the Minecraft service offline when registry sync only confirms module presence', () => {
    minecraftStore = useMinecraftStore()
    minecraftStore.initialize()

    // ROOT CAUSE:
    //
    // A registry sync lists known module registrations, but it is not an online/healthy signal.
    // The previous local behavior promoted first-seen module presence to service health, so a
    // late sync replay could make the Minecraft relay look available before any health event.
    //
    // We fixed this by letting registry sync update presence only; explicit registry health
    // events remain the only path that marks the service healthy.
    emitServerEvent('registry:modules:sync', {
      modules: [
        {
          name: 'minecraft-bot',
          identity: {
            kind: 'plugin',
            plugin: { id: 'minecraft-bot' },
            id: 'minecraft-bot',
          },
        },
      ],
    })

    // @example
    expect(minecraftStore.configured).toBe(true)
    // @example
    expect(minecraftStore.serviceConnected).toBe(false)
  })

  /**
   * @example
   * it('updates Minecraft service connectivity from authoritative health events', () => {})
   */
  it('updates Minecraft service connectivity from authoritative health events', () => {
    minecraftStore = useMinecraftStore()
    minecraftStore.initialize()

    emitServerEvent('registry:modules:sync', {
      modules: [
        {
          name: 'minecraft-bot',
          identity: {
            kind: 'plugin',
            plugin: { id: 'minecraft-bot' },
            id: 'minecraft-bot',
          },
        },
      ],
    })

    emitServerEvent('registry:modules:health:healthy', {
      name: 'minecraft-bot',
      identity: {
        kind: 'plugin',
        plugin: { id: 'minecraft-bot' },
        id: 'minecraft-bot',
      },
    })

    // @example
    expect(minecraftStore.serviceConnected).toBe(true)
  })

  /**
   * @example
   * it('does not reconnect the Minecraft service from registry sync after it becomes unhealthy', () => {})
   */
  it('does not reconnect the Minecraft service from registry sync after it becomes unhealthy', () => {
    minecraftStore = useMinecraftStore()
    minecraftStore.initialize()

    emitServerEvent('registry:modules:health:healthy', {
      name: 'minecraft-bot',
      identity: {
        kind: 'plugin',
        plugin: { id: 'minecraft-bot' },
        id: 'minecraft-bot',
      },
    })

    emitServerEvent('registry:modules:health:unhealthy', {
      name: 'minecraft-bot',
      reason: 'heartbeat late',
      identity: {
        kind: 'plugin',
        plugin: { id: 'minecraft-bot' },
        id: 'minecraft-bot',
      },
    })

    emitServerEvent('registry:modules:sync', {
      modules: [
        {
          name: 'minecraft-bot',
          identity: {
            kind: 'plugin',
            plugin: { id: 'minecraft-bot' },
            id: 'minecraft-bot',
          },
        },
      ],
    })

    // @example
    expect(minecraftStore.configured).toBe(true)
    // @example
    expect(minecraftStore.serviceConnected).toBe(false)
  })
})
