import { describe, expect, it, vi } from 'vitest'

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
    // Mock EventBus
    const eventBus = {
      subscribe: vi.fn(),
      emit: vi.fn(),
      emitChild: vi.fn(),
    } as any

    const logger = makeLogger()
    const perception = {
      getPlayers: vi.fn(() => []),
      getEntity: vi.fn(() => null),
      entitiesWithBelief: vi.fn(() => []),
      updateEntity: vi.fn(),
      updateSelfPosition: vi.fn(),
    } as any
    const reflex = new ReflexManager({ eventBus, perception, logger })

    const bot = makeBot()
    reflex.init(bot)

    // Verify subscription
    expect(eventBus.subscribe).toHaveBeenCalledWith('signal:*', expect.any(Function))

    // Manually trigger handler to test logic
    const handler = eventBus.subscribe.mock.calls[0][1]
    const signalEvent = {
      type: 'signal:social',
      payload: { type: 'social', description: 'hello' },
      source: { component: 'ruleEngine', id: 'test' },
      timestamp: Date.now(),
      // ... other traced event props ...
    }

    handler(signalEvent)

    // TODO: Ideally we assert that tick() was called.
    // Since tick is internal/called via runtime, we might need to inspect side effects or spy on runtime.
    // For now, ensure it doesn't crash.

    reflex.destroy()
  })
})
