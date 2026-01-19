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
      heldItem: null,
      time: { isDay: true },
      isRaining: false,
      players: {},
    },
    interrupt: vi.fn(),
  }

  return bot as any
}

describe('reflexManager', () => {
  it('handles signals without crashing', () => {
    // Mock EventBus
    const eventBus = {
      subscribe: vi.fn(),
      emit: vi.fn(),
      emitChild: vi.fn(),
    } as any

    const taskExecutor = {
      on: vi.fn(),
      off: vi.fn(),
      removeListener: vi.fn(),
    } as any

    const logger = makeLogger()
    const perception = {
      getPlayers: vi.fn(() => []),
      getEntity: vi.fn(() => null),
      entitiesWithBelief: vi.fn(() => []),
      updateEntity: vi.fn(),
      updateSelfPosition: vi.fn(),
    } as any
    const reflex = new ReflexManager({ eventBus, perception, taskExecutor, logger })

    const bot = makeBot()
    reflex.init(bot)

    // Verify subscription
    expect(eventBus.subscribe).toHaveBeenCalledWith('signal:*', expect.any(Function))

    // Manually trigger handler to test logic
    const handler = eventBus.subscribe.mock.calls[0][1]
    const signalEvent = {
      type: 'signal:social',
      payload: {
        type: 'social_gesture',
        description: 'someone teabagged',
        timestamp: Date.now(),
        metadata: { gesture: 'teabag' },
      },
      source: { component: 'ruleEngine', id: 'test' },
      timestamp: Date.now(),
      // ... other traced event props ...
    }

    handler(signalEvent)

    // Should forward to conscious by default for higher-level signals
    expect(eventBus.emitChild).toHaveBeenCalledWith(signalEvent, expect.objectContaining({
      type: 'conscious:signal:social_gesture',
    }))

    // TODO: Ideally we assert that tick() was called.
    // Since tick is internal/called via runtime, we might need to inspect side effects or spy on runtime.
    // For now, ensure it doesn't crash.

    reflex.destroy()
  })

  it('updates social context from chat_message and enters social mode', () => {
    const eventBus = {
      subscribe: vi.fn(),
      emit: vi.fn(),
      emitChild: vi.fn(),
    } as any

    const taskExecutor = {
      on: vi.fn(),
      off: vi.fn(),
      removeListener: vi.fn(),
    } as any

    const logger = makeLogger()
    const perception = {
      getPlayers: vi.fn(() => []),
      getEntity: vi.fn(() => null),
      entitiesWithBelief: vi.fn(() => []),
      updateEntity: vi.fn(),
      updateSelfPosition: vi.fn(),
    } as any

    const reflex = new ReflexManager({ eventBus, perception, taskExecutor, logger })

    const bot = makeBot()
    bot.bot.players = {
      alice: { entity: { position: { x: 1, y: 0, z: 1 }, username: 'alice' } },
    }
    reflex.init(bot)

    const handler = eventBus.subscribe.mock.calls[0][1]
    const chatEvent = {
      type: 'signal:chat_message',
      payload: {
        type: 'chat_message',
        description: 'Chat from alice: "hi"',
        sourceId: 'alice',
        timestamp: Date.now(),
        metadata: { username: 'alice', message: 'hi' },
      },
      source: { component: 'ruleEngine', id: 'test' },
      timestamp: Date.now(),
    }

    handler(chatEvent)

    const snap = reflex.getContextSnapshot()
    expect(snap.social.lastSpeaker).toBe('alice')
    expect(snap.social.lastMessage).toBe('hi')
    expect(reflex.getMode()).toBe('social')

    // Should forward chat to conscious
    expect(eventBus.emitChild).toHaveBeenCalledWith(chatEvent, expect.objectContaining({
      type: 'conscious:signal:chat_message',
    }))

    reflex.destroy()
  })

  it('leaving social interrupts follow cleanup', () => {
    const eventBus = {
      subscribe: vi.fn(),
      emit: vi.fn(),
      emitChild: vi.fn(),
    } as any

    const taskExecutor = {
      on: vi.fn(),
      off: vi.fn(),
      removeListener: vi.fn(),
    } as any

    const logger = makeLogger()
    const perception = {
      getPlayers: vi.fn(() => []),
      getEntity: vi.fn(() => null),
      entitiesWithBelief: vi.fn(() => []),
      updateEntity: vi.fn(),
      updateSelfPosition: vi.fn(),
    } as any

    const reflex = new ReflexManager({ eventBus, perception, taskExecutor, logger })

    const bot = makeBot()
    bot.bot.players = {
      alice: { entity: { position: { x: 1, y: 0, z: 1 }, username: 'alice' } },
    }
    reflex.init(bot)

    const handler = eventBus.subscribe.mock.calls[0][1]
    handler({
      type: 'signal:chat_message',
      payload: {
        type: 'chat_message',
        description: 'Chat from alice: "hi"',
        sourceId: 'alice',
        timestamp: Date.now(),
        metadata: { username: 'alice', message: 'hi' },
      },
      source: { component: 'ruleEngine', id: 'test' },
      timestamp: Date.now(),
    })

    expect(reflex.getMode()).toBe('social')

    // Force social timeout by moving time forward and triggering another signal.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_000)
    handler({
      type: 'signal:social_gesture',
      payload: {
        type: 'social_gesture',
        description: 'noop',
        timestamp: Date.now(),
        metadata: { gesture: 'wave' },
      },
      source: { component: 'ruleEngine', id: 'test' },
      timestamp: Date.now(),
    })

    expect(reflex.getMode()).toBe('idle')
    expect(bot.interrupt).toHaveBeenCalledWith('reflex:social_exit')
  })
})
