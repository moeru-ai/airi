import type { ModuleAnnouncedEvent } from '@proj-airi/server-sdk'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { describe, expect, it, vi } from 'vitest'

import { MinecraftContextService } from './minecraft-context-service'

function createBot() {
  return {
    username: 'AIRI',
    bot: {
      entity: {
        position: {
          x: 12.34,
          y: 64,
          z: -8.76,
        },
      },
      health: 18,
      game: {
        gameMode: 'survival',
      },
      players: {
        AIRI: {},
        Alex: {},
        Sam: {},
      },
    },
  } as any
}

describe('minecraftContextService', () => {
  it('publishes replace-self status snapshots', () => {
    const sendContextUpdate = vi.fn()
    const service = new MinecraftContextService({
      airiBridge: {
        sendContextUpdate,
        onModuleAnnounced: () => () => {},
      },
      serverHost: 'localhost',
      serverPort: 25565,
      refreshIntervalMs: 60_000,
    })

    service.bindBot(createBot())

    expect(sendContextUpdate).toHaveBeenCalledWith({
      contextId: 'minecraft:status',
      lane: 'minecraft:status',
      text: [
        'Bot online: AIRI',
        'Server: localhost:25565',
        'Position: x: 12.3, y: 64.0, z: -8.8',
        'Health: 18/20, Mode: survival',
        'Other players online: Alex, Sam',
      ].join('\n'),
      hints: ['status', 'AIRI'],
      strategy: ContextUpdateStrategy.ReplaceSelf,
    })

    service.destroy()
  })

  it('republishes the latest status to newly announced frontend instances', () => {
    const sendContextUpdate = vi.fn()
    let moduleAnnouncedListener: ((event: ModuleAnnouncedEvent) => void) | null = null

    const service = new MinecraftContextService({
      airiBridge: {
        sendContextUpdate,
        onModuleAnnounced: (listener) => {
          moduleAnnouncedListener = listener
          return () => {
            moduleAnnouncedListener = null
          }
        },
      },
      serverHost: 'localhost',
      serverPort: 25565,
      refreshIntervalMs: 60_000,
    })

    service.init()
    service.bindBot(createBot())
    sendContextUpdate.mockClear()

    expect(moduleAnnouncedListener).toBeTypeOf('function')
    moduleAnnouncedListener!({
      name: 'stage-web',
      identity: {
        plugin: { id: 'stage-web' },
        kind: 'plugin',
        id: 'stage-web-1',
      },
    })

    expect(sendContextUpdate).toHaveBeenCalledWith(expect.objectContaining({
      contextId: 'minecraft:status',
      lane: 'minecraft:status',
      strategy: ContextUpdateStrategy.ReplaceSelf,
      destinations: ['instance:stage-web-1'],
    }))

    service.destroy()
  })
})
