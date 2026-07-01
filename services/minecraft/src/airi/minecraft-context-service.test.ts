import { describe, expect, it, vi } from 'vitest'

import { MinecraftContextService } from './minecraft-context-service'

/** Minimal bot stub exposing only the fields refreshStatusSnapshot reads. */
function fakeBot(): any {
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
  const captured: any[] = []
  const airiBridge = {
    onModuleAnnounced: vi.fn(() => () => {}),
    sendContextUpdate: vi.fn((update: any) => captured.push(update)),
  }
  const service = new MinecraftContextService({
    airiBridge: airiBridge as any,
    serverHost: '127.0.0.1',
    serverPort: 25565,
    masterUsername,
  })
  return { service, captured }
}

describe('minecraftContextService master identity', () => {
  it('surfaces the configured master username in the status text only', () => {
    const { service, captured } = makeService('dssadg')
    service.bindBot(fakeBot())
    const update = captured[0]
    expect(update.lane).toBe('minecraft:status')
    expect(update.text).toContain('Master (your owner) in-game username: dssadg')
    // The owner identity rides only in the human-readable status text (for the bot's own brain). It
    // must NOT leak as a machine-readable `master:` hint — that was a desktop-store coupling point,
    // removed in the services/minecraft neutral restore. Desktop "主人" binding is reintroduced via
    // the Minecraft adapter, not baked into the bot service.
    expect(update.hints.some((hint: string) => hint.startsWith('master:'))).toBe(false)
    service.destroy()
  })

  it('omits the master line when no master username is configured', () => {
    const { service, captured } = makeService(undefined)
    service.bindBot(fakeBot())
    const update = captured[0]
    expect(update.hints.some((hint: string) => hint.startsWith('master:'))).toBe(false)
    expect(update.text).not.toContain('Master (your owner)')
    service.destroy()
  })
})
