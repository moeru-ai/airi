import type { ContextTokenCounter } from '@proj-airi/core-agent'
import type { ContextUpdate, ModuleAnnouncedEvent } from '@proj-airi/server-sdk'

import { createContextRegistry, loadContextTokenCounter } from '@proj-airi/core-agent'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

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

function makeService(masterUsername?: string, refreshIntervalMs?: number) {
  const captured: ContextUpdate[] = []
  let moduleAnnouncedListener: ((event: ModuleAnnouncedEvent) => void) | undefined
  let readSource: ((sourceRef: { refType: string, targetId: string }) => string | undefined) | undefined
  const airiBridge = {
    onContextSourceRequest: vi.fn((read: (sourceRef: { refType: string, targetId: string }) => string | undefined) => {
      readSource = read
      return () => {
        readSource = undefined
      }
    }),
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
    refreshIntervalMs,
  })

  return {
    airiBridge,
    captured,
    getModuleAnnouncedListener: () => moduleAnnouncedListener,
    readSource: (sourceRef: { refType: string, targetId: string }) => readSource?.(sourceRef),
    service,
  }
}

let countTokens: ContextTokenCounter

beforeAll(async () => {
  countTokens = await loadContextTokenCounter()
})

afterEach(() => vi.useRealTimers())

describe('minecraftContextService desktop relay context', () => {
  it('retains world details in the module while an oversized status becomes a reference', async () => {
    const { service, captured } = makeService('owner'.repeat(100))
    try {
      const bot = fakeBot()
      bot.bot.players = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`player-${index}`, {}]))
      service.bindBot(bot)
      await vi.waitFor(() => expect(captured).toHaveLength(1))
      const registry = createContextRegistry({ countTokens })
      const update = captured[0]!

      expect(update.text).toBe('Source details: minecraft:status/minecraft:status')
      expect(update.sourceRef).toEqual({ refType: 'minecraft:status', targetId: 'minecraft:status' })
      expect(registry.ingest({ ...update, metadata: undefined, createdAt: Date.now() })?.mutation).toBe('replace')
      expect(service.getStatusSnapshot()?.otherPlayers).toHaveLength(1000)
      expect(service.getStatusSnapshot()?.masterUsername).toBe('owner'.repeat(100))
    }
    finally {
      service.destroy()
    }
  })

  // ROOT CAUSE:
  // The budgeted status dropped player names and the server address, and no read path returned them.
  it('answers a status read with the facts that the observation omits', () => {
    const { service, readSource } = makeService('dssadg')
    service.init()
    try {
      const statusRef = { refType: 'minecraft:status', targetId: 'minecraft:status' }
      expect(readSource(statusRef)).toContain('Configured server: 127.0.0.1:25565')
      service.bindBot(fakeBot())

      const details = readSource(statusRef)
      expect(details).toContain('Server: 127.0.0.1:25565')
      expect(details).toContain('Other players: Bob, dssadg')
      expect(readSource({ refType: 'minecraft:status', targetId: 'other' })).toBeUndefined()
    }
    finally {
      service.destroy()
    }
    expect(readSource({ refType: 'minecraft:status', targetId: 'minecraft:status' })).toBeUndefined()
  })

  it('sizes status expiry for the configured refresh cadence', async () => {
    const { service, captured } = makeService(undefined, 10_000)
    try {
      service.bindBot(fakeBot())
      await vi.waitFor(() => expect(captured[0]?.ttlMs).toBe(30_000))
    }
    finally {
      service.destroy()
    }
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects an invalid refresh interval: %s', (interval) => {
    expect(() => makeService(undefined, interval)).toThrow(RangeError)
  })

  // ROOT CAUSE:
  // Long relay instructions and player lists exceeded the receiving pool's 80-token entry limit.
  // Unchanged status also stopped refreshing, so a live bot disappeared when its observation expired.
  it('admits the live status through the default observation budget', async () => {
    const { service, captured } = makeService('dssadg')
    try {
      service.bindBot(fakeBot())
      await vi.waitFor(() => expect(captured).toHaveLength(1))
      const registry = createContextRegistry({ countTokens })
      expect(registry.ingest({ ...captured[0]!, metadata: undefined, createdAt: Date.now() })?.mutation).toBe('replace')
    }
    finally {
      service.destroy()
    }
  })

  it('refreshes unchanged status before its observation expires', async () => {
    vi.useFakeTimers()
    const { service, captured, airiBridge } = makeService()
    try {
      // Isolate expiry from text admission. The preceding regression checks the default token budget.
      const registry = createContextRegistry({ countTokens: () => 1 })
      airiBridge.sendContextUpdate.mockImplementation((update) => {
        captured.push(update)
        registry.ingest({ ...update, metadata: undefined, createdAt: Date.now() })
      })
      service.bindBot(fakeBot())
      await vi.advanceTimersByTimeAsync(65_000)
      expect(registry.snapshot().unknown).toHaveLength(1)
      expect(captured.length).toBeGreaterThan(1)
      expect(captured.at(-1)?.ttlMs).toBe(15_000)
      service.unbindBot()
      await vi.advanceTimersByTimeAsync(0)
      airiBridge.sendContextUpdate.mockClear()
      await vi.advanceTimersByTimeAsync(20_000)
      expect(airiBridge.sendContextUpdate).not.toHaveBeenCalled()
      expect(registry.snapshot()).toEqual({})
    }
    finally {
      service.destroy()
    }
  })
  it('publishes relay availability and configured master as status facts', async () => {
    const { airiBridge, service, captured } = makeService('dssadg')

    service.bindBot(fakeBot())
    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const update = captured[0]
    expect(update.lane).toBe('minecraft:status')
    expect(update.strategy).toBe('replace-self')
    expect(update.text).toContain('Bot online: Airi')
    expect(update.text).toContain('Desktop command relay: available.')
    expect(update.text).toContain('builtIn_emitSparkCommand')
    expect(update.text).toContain('Destination: minecraft-bot.')
    expect(update.text).not.toContain('When the user asks')
    expect(update.sourceRef).toEqual({ refType: 'minecraft:status', targetId: 'minecraft:status' })
    expect(update.text).toContain('Owner: dssadg')
    expect(update.hints?.some(hint => hint.startsWith('master:'))).toBe(false)
    expect(airiBridge.setCommandAvailable).toHaveBeenCalledWith(true)

    service.destroy()
  })

  it('replaces the relay context with an offline capability when the bot unbinds', async () => {
    const { airiBridge, service, captured } = makeService()
    service.bindBot(fakeBot())

    service.unbindBot()
    await vi.waitFor(() => expect(captured).toHaveLength(2))

    const update = captured[1]
    expect(update.text).toContain('Bot offline: no active Minecraft bot.')
    expect(update.text).toContain('Desktop command relay: unavailable.')
    expect(update.text).not.toContain('Do not call')
    expect(update.hints).toEqual(['status', 'offline'])
    expect(airiBridge.setCommandAvailable).toHaveBeenLastCalledWith(false)

    service.destroy()
  })

  it('replays the current relay capability to a newly announced Stage instance', async () => {
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
    await vi.waitFor(() => expect(captured).toHaveLength(1))

    const update = captured[0]
    expect(update.text).toContain('Bot offline: no active Minecraft bot.')
    expect(update.destinations).toEqual(['instance:stage-1'])

    service.destroy()
  })
})
