import { describe, expect, it, vi } from 'vitest'

import { EventManager } from '../perception/event-manager'
import { ReflexManager } from './reflex-manager'

function makeLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withFields: vi.fn(() => makeLogger()),
    withError: vi.fn(() => makeLogger()),
  } as any
}

function makeBot() {
  const bot = {
    bot: {
      username: 'bot',
      chat: vi.fn(),
      entity: {
        position: { x: 0, y: 0, z: 0 },
      },
      health: 20,
      food: 20,
      oxygenLevel: 20,
      heldItem: null,
      time: { isDay: true },
      isRaining: false,
      players: {},
    },
  }

  return bot as any
}

describe('reflexManager', () => {
  it('handles greeting via reflex and marks stimulus event handled', () => {
    const eventManager = new EventManager()
    const logger = makeLogger()
    const reflex = new ReflexManager({ eventManager, logger })

    const bot = makeBot()
    reflex.init(bot)

    const stimulus: any = {
      type: 'stimulus',
      payload: { content: 'hello' },
      source: { type: 'minecraft', id: 'alice' },
      timestamp: Date.now(),
    }

    eventManager.emit(stimulus)

    expect(stimulus.handled).toBe(true)
    expect(bot.bot.chat).toHaveBeenCalled()

    reflex.destroy()
  })
})
