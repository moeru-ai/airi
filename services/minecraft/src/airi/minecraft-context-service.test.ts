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

describe('minecraftContextService master propagation', () => {
  it('carries the master username to the desktop via status hints and text', () => {
    const { service, captured } = makeService('dssadg')
    service.bindBot(fakeBot())
    const update = captured[0]
    expect(update.lane).toBe('minecraft:status')
    expect(update.hints).toContain('master:dssadg')
    expect(update.text).toContain('Master (your owner) in-game username: dssadg')
    service.destroy()
  })

  it('omits the master hint when no master username is configured', () => {
    const { service, captured } = makeService(undefined)
    service.bindBot(fakeBot())
    const update = captured[0]
    expect(update.hints.some((hint: string) => hint.startsWith('master:'))).toBe(false)
    expect(update.text).not.toContain('Master (your owner)')
    service.destroy()
  })
})
