import { describe, expect, it, vi } from 'vitest'

import { Brain } from './brain'

function createReflexSnapshot() {
  return {
    self: {
      health: 20,
      food: 20,
      holding: null,
      location: { x: 0, y: 64, z: 0 },
    },
    environment: {
      time: 'day',
      weather: 'clear',
      nearbyPlayers: [],
      nearbyEntities: [],
      lightLevel: 15,
      nearbyPlayersGaze: [],
    },
    social: {},
    threat: {},
    attention: {},
    autonomy: {
      followPlayer: null,
      followActive: false,
    },
  }
}

function createDeps(llmText: string) {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withError: vi.fn(),
  } as any
  logger.withError.mockReturnValue(logger)

  return {
    eventBus: { subscribe: vi.fn() },
    llmAgent: {
      callLLM: vi.fn(async () => ({ text: llmText, reasoning: '', usage: {} })),
    },
    logger,
    taskExecutor: {
      getAvailableActions: vi.fn(() => []),
      executeActionWithResult: vi.fn(async () => 'ok'),
      on: vi.fn(),
    },
    reflexManager: {
      getContextSnapshot: vi.fn(() => createReflexSnapshot()),
      clearFollowTarget: vi.fn(),
    },
  } as any
}

function createPerceptionEvent() {
  return {
    type: 'perception',
    payload: {
      type: 'chat_message',
      description: 'Chat from Alex: "hi"',
      sourceId: 'Alex',
      confidence: 1,
      timestamp: Date.now(),
      metadata: { username: 'Alex', message: 'hi' },
    },
    source: { type: 'minecraft', id: 'Alex' },
    timestamp: Date.now(),
  } as any
}

describe('brain no-action follow-up', () => {
  it('returns trailing expression values in debug repl scripts', async () => {
    const brain: any = new Brain(createDeps('await skip()'))

    const result = await brain.executeDebugRepl(`
const inv = [{ name: 'oak_sapling', count: 1 }]
inv;
`)

    expect(result.error).toBeUndefined()
    expect(result.returnValue).toContain('oak_sapling')
  })

  it('queues exactly one synthetic follow-up on no-action result', async () => {
    const brain: any = new Brain(createDeps('1 + 1'))
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    const queuedEvent = (enqueueSpy.mock.calls[0] as any[])?.[1]
    expect(queuedEvent).toMatchObject({
      type: 'system_alert',
      source: { type: 'system', id: 'brain:no_action_followup' },
      payload: { reason: 'no_actions', returnValue: '2' },
    })
  })

  it('captures trailing expression return for llm multi-line scripts', async () => {
    const brain: any = new Brain(createDeps(`
const inv = [{ name: 'oak_sapling', count: 1 }]
inv;
`))
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    const queuedEvent = (enqueueSpy.mock.calls[0] as any[])?.[1]
    expect(queuedEvent?.payload?.returnValue).toContain('oak_sapling')
  })

  it('does not chain follow-up from follow-up event source', async () => {
    const brain: any = new Brain(createDeps('1 + 1'))
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy

    await brain.processEvent({} as any, {
      type: 'system_alert',
      payload: { reason: 'seed' },
      source: { type: 'system', id: 'brain:no_action_followup' },
      timestamp: Date.now(),
    })

    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('does not queue follow-up when script uses skip()', async () => {
    const brain: any = new Brain(createDeps('await skip()'))
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(enqueueSpy).not.toHaveBeenCalled()
  })
})
