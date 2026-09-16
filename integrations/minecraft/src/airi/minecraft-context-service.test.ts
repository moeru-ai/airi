import type { ContextUpdate, ModuleAnnouncedEvent } from '@proj-airi/server-sdk'

import { describe, expect, it, vi } from 'vitest'

import { MinecraftContextService } from './minecraft-context-service'

type ContextBot = Parameters<MinecraftContextService['bindBot']>[0]

/** Minimal bot stub exposing only the status fields owned by the context module. */
function fakeBot(): ContextBot {
  return {
    username: 'Airi',
    bot: {
      entity: { position: { x: 1, y: 2, z: 3 } },
      health: 20,
      game: { gameMode: 'survival' },
      players: { Airi: {}, dssadg: {}, Bob: {} },
    },
  }
}

function makeService(masterUsername?: string) {
  const captured: ContextUpdate[] = []
  let moduleAnnouncedListener: ((event: ModuleAnnouncedEvent) => void) | undefined
  const airiBridge = {
    onModuleAnnounced: vi.fn((listener: (event: ModuleAnnouncedEvent) => void) => {
      moduleAnnouncedListener = listener
      return () => {
        moduleAnnouncedListener = undefined
      }
    }),
    sendContextUpdate: vi.fn((update: ContextUpdate) => {
      captured.push(update)
    }),
    setCommandAvailable: vi.fn<(available: boolean) => void>(),
  }
  const service = new MinecraftContextService({
    airiBridge,
    serverHost: '127.0.0.1',
    serverPort: 25565,
    masterUsername,
  })

  return {
    airiBridge,
    captured,
    getModuleAnnouncedListener: () => moduleAnnouncedListener,
    service,
  }
}

/**
 * @example
 * service.bindBot(fakeBot()) publishes relay instructions through `minecraft:status`.
 */
describe('minecraftContextService desktop relay context', () => {
  /**
   * @example
   * expect(update.text).toContain('builtIn_emitSparkCommand')
   */
  it('publishes the generic relay tool contract and configured master while the bot is online', () => {
    const { airiBridge, service, captured } = makeService('dssadg')

    service.bindBot(fakeBot())

    const update = captured[0]
    expect(update.lane).toBe('minecraft:status')
    expect(update.strategy).toBe('replace-self')
    expect(update.text).toContain('Bot online: Airi')
    expect(update.text).toContain('Desktop command relay: available.')
    expect(update.text).toContain('builtIn_emitSparkCommand')
    expect(update.text).toContain('destinations to ["minecraft-bot"]')
    expect(update.text).toContain('Master (your owner) in-game username: dssadg')
    expect(update.hints?.some(hint => hint.startsWith('master:'))).toBe(false)
    expect(airiBridge.setCommandAvailable).toHaveBeenCalledWith(true)

    service.destroy()
  })

  /**
   * @example
   * expect(update.text).toContain('Desktop command relay: unavailable.')
   */
  it('replaces the relay context with an offline capability when the bot unbinds', () => {
    const { airiBridge, service, captured } = makeService()
    service.bindBot(fakeBot())

    service.unbindBot()

    const update = captured[1]
    expect(update.text).toContain('Bot offline: no active Minecraft bot.')
    expect(update.text).toContain('Desktop command relay: unavailable.')
    expect(update.text).toContain('Do not call the builtIn_emitSparkCommand tool')
    expect(update.hints).toEqual(['status', 'offline'])
    expect(airiBridge.setCommandAvailable).toHaveBeenLastCalledWith(false)

    service.destroy()
  })

  /**
   * @example
   * expect(update.destinations).toEqual(['instance:stage-1'])
   */
  it('replays the current relay capability to a newly announced Stage instance', () => {
    const { service, captured, getModuleAnnouncedListener } = makeService()
    service.init()

    getModuleAnnouncedListener()?.({
      name: 'proj-airi:stage-tamagotchi',
      identity: {
        id: 'stage-1',
        kind: 'plugin',
        plugin: { id: 'stage-tamagotchi' },
      },
    })

    const update = captured[0]
    expect(update.text).toContain('Bot offline: no active Minecraft bot.')
    expect(update.destinations).toEqual(['instance:stage-1'])

    service.destroy()
  })
})
