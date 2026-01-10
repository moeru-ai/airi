import type { MineflayerWithAgents } from '../types'

import { EventEmitter } from 'node:events'

import { Vec3 } from 'vec3'
import { describe, expect, it, vi } from 'vitest'

import { EventManager } from './event-manager'
import { createPerceptionFrameFromChat } from './frame'
import { PerceptionPipeline } from './pipeline'

function makeLogger() {
  const logger: any = {
    withFields: () => logger,
    withError: () => logger,
    log: () => { },
    warn: () => { },
    error: () => { },
  }
  return logger
}

function makeBotWithAgents() {
  const emitter = new EventEmitter()

  const bot: any = emitter

  bot.entity = {
    position: new Vec3(0, 0, 0),
    height: 1.8,
  }

  bot.health = 20
  bot.food = 20
  bot.time = { isDay: true }
  bot.isRaining = false
  bot.players = {}

  const mineflayerWithAgents = {
    bot,
    username: 'test-bot',
    action: {} as any,
    chat: {} as any,
    planning: {} as any,
  } satisfies Partial<MineflayerWithAgents>

  return mineflayerWithAgents as MineflayerWithAgents
}

describe('perceptionPipeline (e2e)', () => {
  it('mineflayer events flow: collector -> normalizer -> attention -> router -> EventManager', () => {
    const logger = makeLogger()
    const eventManager = new EventManager()
    const emitSpy = vi.spyOn(eventManager, 'emit')

    const pipeline = new PerceptionPipeline({ eventManager, logger })
    const botWithAgents = makeBotWithAgents()

    pipeline.init(botWithAgents)

    const entity: any = {
      type: 'player',
      id: 1,
      username: 'alice',
      position: new Vec3(1, 0, 1),
      metadata: [],
    }

    // 3 swings => punch attention
    botWithAgents.bot.emit('entitySwingArm', entity)
    botWithAgents.bot.emit('entitySwingArm', entity)
    botWithAgents.bot.emit('entitySwingArm', entity)

    pipeline.tick(0)

    const perceptionEvents = emitSpy.mock.calls
      .map(c => c[0])
      .filter(e => e.type === 'perception')

    expect(perceptionEvents.length).toBeGreaterThanOrEqual(1)
    expect((perceptionEvents[0] as any).payload).toMatchObject({
      kind: 'player',
      playerAction: 'punch',
      playerName: 'alice',
    })

    pipeline.destroy()
  })

  it('router emits stimulus for chat frames ingested into pipeline', () => {
    const logger = makeLogger()
    const eventManager = new EventManager()
    const emitSpy = vi.spyOn(eventManager, 'emit')

    const pipeline = new PerceptionPipeline({ eventManager, logger })
    const botWithAgents = makeBotWithAgents()

    pipeline.init(botWithAgents)

    pipeline.ingest(createPerceptionFrameFromChat('alice', 'hi'))
    pipeline.tick(0)

    const stimulusEvents = emitSpy.mock.calls
      .map(c => c[0])
      .filter(e => e.type === 'stimulus')

    expect(stimulusEvents.length).toBe(1)
    expect((stimulusEvents[0] as any).payload).toMatchObject({
      content: 'hi',
      metadata: { displayName: 'alice' },
    })

    pipeline.destroy()
  })

  it('normalizer drops throttled entity_moved events (e2e)', () => {
    vi.useFakeTimers()
    try {
      const logger = makeLogger()
      const eventManager = new EventManager()
      const emitSpy = vi.spyOn(eventManager, 'emit')

      const pipeline = new PerceptionPipeline({ eventManager, logger })
      const botWithAgents = makeBotWithAgents()
      pipeline.init(botWithAgents)

      const entity: any = {
        type: 'player',
        id: 1,
        username: 'alice',
        position: new Vec3(1, 0, 1),
        // 0th metadata is flags in collector, keep stable
        metadata: [0],
      }

      // movement attention requires sustained movement; we only assert no errors and that
      // throttling doesn't allow duplicates through attention detector.
      vi.setSystemTime(new Date(0))
      botWithAgents.bot.emit('entityMoved', entity)

      vi.setSystemTime(new Date(50))
      botWithAgents.bot.emit('entityMoved', entity)

      vi.setSystemTime(new Date(200))
      botWithAgents.bot.emit('entityMoved', entity)

      pipeline.tick(0)

      // At most 2 move raws should make it past normalizer (t=0 and t=200)
      // We can't observe raw frames directly here, so we at least ensure we didn't emit
      // an absurd number of perception events.
      const perceptionEvents = emitSpy.mock.calls
        .map(c => c[0])
        .filter(e => e.type === 'perception')

      expect(perceptionEvents.length).toBeLessThanOrEqual(2)

      pipeline.destroy()
    }
    finally {
      vi.useRealTimers()
    }
  })
})
