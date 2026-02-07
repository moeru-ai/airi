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
  it('forgets conversation only', () => {
    const brain: any = new Brain(createDeps('await skip()'))
    brain.conversationHistory = [{ role: 'user', content: 'old' }]
    brain.lastLlmInputSnapshot = {
      systemPrompt: 'sys',
      userMessage: 'msg',
      messages: [],
      conversationHistory: [],
      updatedAt: Date.now(),
      attempt: 1,
    }
    brain.llmLogEntries = [{ id: 1, turnId: 1, kind: 'turn_input', timestamp: Date.now(), eventType: 'x', sourceType: 'x', sourceId: 'x', tags: [], text: 'x' }]

    const result = brain.forgetConversation()

    expect(result.ok).toBe(true)
    expect(result.cleared).toEqual(['conversationHistory', 'lastLlmInputSnapshot'])
    expect(brain.conversationHistory).toEqual([])
    expect(brain.lastLlmInputSnapshot).toBeNull()
    expect(brain.llmLogEntries).toHaveLength(1)
  })

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

  it('suppresses llm turns while paused', async () => {
    const deps: any = createDeps('await chat("hi")')
    const brain: any = new Brain(deps)
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy
    brain.setPaused(true)

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(deps.llmAgent.callLLM).not.toHaveBeenCalled()
    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('refreshes reflex context before debug perception injection', async () => {
    const deps: any = createDeps('await skip()')
    deps.reflexManager.refreshFromBotState = vi.fn()
    const brain: any = new Brain(deps)
    brain.runtimeMineflayer = {} as any
    brain.enqueueEvent = vi.fn(async () => undefined)

    await brain.injectDebugEvent(createPerceptionEvent())

    expect(deps.reflexManager.refreshFromBotState).toHaveBeenCalledTimes(1)
    expect(brain.enqueueEvent).toHaveBeenCalledTimes(1)
  })
})

function createFeedbackEvent() {
  return {
    type: 'feedback',
    payload: { status: 'success', action: { tool: 'goToCoordinate', params: {} }, result: 'ok' },
    source: { type: 'system', id: 'executor' },
    timestamp: Date.now(),
  } as any
}

function createNoActionFollowupEvent() {
  return {
    type: 'system_alert',
    payload: { reason: 'no_actions', returnValue: '0', logs: [] },
    source: { type: 'system', id: 'brain:no_action_followup' },
    timestamp: Date.now(),
  } as any
}

describe('brain queue coalescing', () => {
  it('promotes player chat ahead of stale feedback events', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    // Simulate a queue with feedback events followed by a player chat
    const resolved: string[] = []
    brain.queue = [
      { event: createFeedbackEvent(), resolve: () => resolved.push('fb1'), reject: vi.fn() },
      { event: createFeedbackEvent(), resolve: () => resolved.push('fb2'), reject: vi.fn() },
      { event: createPerceptionEvent(), resolve: () => resolved.push('chat'), reject: vi.fn() },
    ]

    brain.coalesceQueue()

    // Player chat (priority 0) should be first in queue
    expect(brain.queue[0].event.type).toBe('perception')
    expect((brain.queue[0].event.payload as any).type).toBe('chat_message')
  })

  it('drops no-action follow-ups when player chat is waiting', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    const resolved: string[] = []
    brain.queue = [
      { event: createNoActionFollowupEvent(), resolve: () => resolved.push('followup1'), reject: vi.fn() },
      { event: createNoActionFollowupEvent(), resolve: () => resolved.push('followup2'), reject: vi.fn() },
      { event: createFeedbackEvent(), resolve: () => resolved.push('fb'), reject: vi.fn() },
      { event: createPerceptionEvent(), resolve: () => resolved.push('chat'), reject: vi.fn() },
    ]

    brain.coalesceQueue()

    // Both no-action follow-ups should be dropped and resolved
    expect(resolved).toEqual(['followup1', 'followup2'])
    // Remaining queue: chat (promoted) + feedback
    expect(brain.queue).toHaveLength(2)
    expect(brain.queue[0].event.type).toBe('perception')
    expect(brain.queue[1].event.type).toBe('feedback')
  })

  it('does not coalesce when queue has only one item', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    brain.queue = [
      { event: createNoActionFollowupEvent(), resolve: vi.fn(), reject: vi.fn() },
    ]

    brain.coalesceQueue()

    expect(brain.queue).toHaveLength(1)
  })

  it('does not coalesce when no high-priority events exist', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    brain.queue = [
      { event: createFeedbackEvent(), resolve: vi.fn(), reject: vi.fn() },
      { event: createNoActionFollowupEvent(), resolve: vi.fn(), reject: vi.fn() },
    ]

    brain.coalesceQueue()

    // No changes — no perception/chat events to promote
    expect(brain.queue).toHaveLength(2)
    expect(brain.queue[0].event.type).toBe('feedback')
  })

  it('preserves relative order among same-priority events', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    const chat1 = { ...createPerceptionEvent(), payload: { ...createPerceptionEvent().payload, description: 'Chat from Alex: "first"' } }
    const chat2 = { ...createPerceptionEvent(), payload: { ...createPerceptionEvent().payload, description: 'Chat from Alex: "second"' } }

    brain.queue = [
      { event: createFeedbackEvent(), resolve: vi.fn(), reject: vi.fn() },
      { event: chat1, resolve: vi.fn(), reject: vi.fn() },
      { event: chat2, resolve: vi.fn(), reject: vi.fn() },
    ]

    brain.coalesceQueue()

    // Both chats should come before feedback, and maintain their relative order
    expect(brain.queue[0].event.payload.description).toContain('first')
    expect(brain.queue[1].event.payload.description).toContain('second')
    expect(brain.queue[2].event.type).toBe('feedback')
  })
})
