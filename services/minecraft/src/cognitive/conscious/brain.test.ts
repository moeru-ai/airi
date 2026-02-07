import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ActionError } from '../../utils/errors'
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

function createAsyncControlAction(name: string = 'goToPlayer') {
  return {
    name,
    description: `${name} action`,
    execution: 'async',
    schema: z.object({
      player_name: z.string(),
      closeness: z.number(),
    }),
    perform: () => async () => 'ok',
  } as any
}

function createReadonlyAction(name: string = 'querySnapshot') {
  return {
    name,
    description: `${name} action`,
    execution: 'sync',
    readonly: true,
    schema: z.object({}),
    perform: () => () => 'ok',
  } as any
}

function createGiveUpAction() {
  return {
    name: 'giveUp',
    description: 'Give up action',
    execution: 'sync',
    schema: z.object({
      reason: z.string(),
      cooldown_seconds: z.number(),
    }),
    perform: () => () => 'gave up',
  } as any
}

function createChatAction() {
  return {
    name: 'chat',
    description: 'Chat action',
    execution: 'sync',
    schema: z.object({
      message: z.string(),
      feedback: z.boolean().optional(),
    }),
    perform: () => () => 'chat sent',
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

  it('returns trailing expression values from single-line statements', async () => {
    const brain: any = new Brain(createDeps('await skip()'))

    const result = await brain.executeDebugRepl('const nearestLog = [{ name: "oak_log" }]; nearestLog')

    expect(result.error).toBeUndefined()
    expect(result.returnValue).toContain('oak_log')
  })

  it('queues budgeted synthetic follow-up on no-action result', async () => {
    const brain: any = new Brain(createDeps('1 + 1'))
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    const queuedEvent = (enqueueSpy.mock.calls[0] as any[])?.[1]
    expect(queuedEvent).toMatchObject({
      type: 'system_alert',
      source: { type: 'system', id: 'brain:no_action_followup' },
      payload: {
        reason: 'no_actions',
        returnValue: '2',
        noActionBudget: { remaining: 2, default: 3, max: 8 },
      },
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

  it('allows chained follow-up from follow-up event source while budget remains', async () => {
    const brain: any = new Brain(createDeps('1 + 1'))
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy

    await brain.processEvent({} as any, {
      type: 'system_alert',
      payload: { reason: 'seed' },
      source: { type: 'system', id: 'brain:no_action_followup' },
      timestamp: Date.now(),
    })

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    const queuedEvent = (enqueueSpy.mock.calls[0] as any[])?.[1]
    expect(queuedEvent?.source?.id).toBe('brain:no_action_followup')
  })

  it('blocks no-action follow-up when budget is exhausted and emits budget alert', async () => {
    const brain: any = new Brain(createDeps('1 + 1'))
    brain.setNoActionFollowupBudget(0)
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy
    const bot = { bot: { chat: vi.fn() } }

    await brain.processEvent(bot as any, {
      type: 'system_alert',
      payload: { source: 'budget-test' },
      source: { type: 'system', id: 'budget-test' },
      timestamp: Date.now(),
    })

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    const queuedEvent = (enqueueSpy.mock.calls[0] as any[])?.[1]
    expect(queuedEvent).toMatchObject({
      type: 'system_alert',
      source: { type: 'system', id: 'brain:no_action_budget' },
      payload: { reason: 'no_action_budget_exhausted' },
    })
    expect(bot.bot.chat).toHaveBeenCalledTimes(1)
  })

  it('resets no-action budget when player chat arrives', async () => {
    const brain: any = new Brain(createDeps('await skip()'))
    brain.setNoActionFollowupBudget(0)

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(brain.getNoActionBudgetState()).toEqual({
      remaining: 3,
      default: 3,
      max: 8,
    })
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

  it('activates error-burst guard and enqueues guard alert after repeated errors', async () => {
    const brain: any = new Brain(createDeps('const broken = ;'))
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy

    await brain.processEvent({} as any, createPerceptionEvent())
    await brain.processEvent({} as any, createPerceptionEvent())
    await brain.processEvent({} as any, createPerceptionEvent())

    const guardEvent = enqueueSpy.mock.calls
      .map((call: any[]) => call[1])
      .find((event: any) => event?.source?.id === 'brain:error_burst_guard')

    expect(guardEvent).toMatchObject({
      type: 'system_alert',
      source: { type: 'system', id: 'brain:error_burst_guard' },
      payload: {
        reason: 'error_burst_guard',
        threshold: 3,
        windowTurns: 5,
      },
    })
    expect(brain.errorBurstGuardState?.errorTurnCount).toBeGreaterThanOrEqual(3)
  })

  it('includes mandatory give-up and chat instructions when error-burst guard is active', () => {
    const brain: any = new Brain(createDeps('await skip()'))
    brain.errorBurstGuardState = {
      threshold: 3,
      windowTurns: 5,
      errorTurnCount: 3,
      recentTurnIds: [7, 6, 5, 4, 3],
      recentErrorSummary: ['turn=7 repl_error: parse failed'],
      suggestedCooldownSeconds: 45,
      triggeredAtTurnId: 8,
    }

    const message = brain.buildUserMessage(
      createPerceptionEvent(),
      '[PERCEPTION] Self: healthy\nEnvironment: clear',
    )

    expect(message).toContain('[ERROR_BURST_GUARD] active')
    expect(message).toContain('await giveUp({ reason: "..."')
    expect(message).toContain('await chat({ message: "..."')
  })

  it('clears error-burst guard when giveUp and chat both succeed in one turn', async () => {
    const deps: any = createDeps('await giveUp({ reason: "stuck", cooldown_seconds: 45 }); await chat("I got stuck after repeated errors.")')
    deps.taskExecutor.getAvailableActions = vi.fn(() => [createGiveUpAction(), createChatAction()])
    deps.taskExecutor.executeActionWithResult = vi.fn(async (action: any) => action.tool === 'giveUp' ? 'gave up' : 'chat sent')

    const brain: any = new Brain(deps)
    brain.errorBurstGuardState = {
      threshold: 3,
      windowTurns: 5,
      errorTurnCount: 3,
      recentTurnIds: [7, 6, 5, 4, 3],
      recentErrorSummary: ['turn=7 repl_error: parse failed'],
      suggestedCooldownSeconds: 45,
      triggeredAtTurnId: 8,
    }

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(brain.errorBurstGuardState).toBeNull()
    const clearedEntry = brain.getLlmLogs().find((entry: any) =>
      entry.sourceId === 'brain:error_burst_guard'
      && entry.tags.includes('guard_cleared'),
    )
    expect(clearedEntry).toBeTruthy()
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

describe('brain control action queue', () => {
  it('does not block turn completion while control action executes in worker', async () => {
    const deps: any = createDeps('await goToPlayer({ player_name: "Alex", closeness: 2 })')
    const deferred = new Promise<unknown>(() => {})
    deps.taskExecutor.getAvailableActions = vi.fn(() => [createAsyncControlAction('goToPlayer')])
    deps.taskExecutor.executeActionWithResult = vi.fn(async (action: any) => {
      if (action.tool === 'goToPlayer')
        return deferred
      return 'ok'
    })

    const brain: any = new Brain(deps)
    const outcome = await Promise.race([
      brain.processEvent({} as any, createPerceptionEvent()).then(() => 'done'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 80)),
    ])

    expect(outcome).toBe('done')
    const snapshot = brain.getDebugSnapshot()
    expect(snapshot.actionQueue.counts.total).toBe(1)
    expect(snapshot.actionQueue.executing?.tool ?? snapshot.actionQueue.pending[0]?.tool).toBe('goToPlayer')
  })

  it('executes readonly tools immediately without consuming control queue', async () => {
    const deps: any = createDeps('await querySnapshot()')
    deps.taskExecutor.getAvailableActions = vi.fn(() => [createReadonlyAction('querySnapshot')])
    deps.taskExecutor.executeActionWithResult = vi.fn(async () => 'snapshot-ok')

    const brain: any = new Brain(deps)
    await brain.processEvent({} as any, createPerceptionEvent())

    const snapshot = brain.getDebugSnapshot()
    expect(snapshot.actionQueue.counts.total).toBe(0)
    expect(deps.taskExecutor.executeActionWithResult).toHaveBeenCalledWith({
      tool: 'querySnapshot',
      params: {},
    })
  })

  it('cancels active control action on stop without emitting failure feedback', async () => {
    const deps: any = createDeps('await skip()')
    deps.taskExecutor.getAvailableActions = vi.fn(() => [createAsyncControlAction('goToPlayer')])
    deps.taskExecutor.executeActionWithResult = vi.fn((action: any, cancellationToken?: any) => {
      if (action.tool === 'goToPlayer') {
        return new Promise((_resolve, reject) => {
          cancellationToken?.onCancelled(() => {
            reject(new ActionError('INTERRUPTED', 'cancelled by stop'))
          })
        })
      }
      if (action.tool === 'stop')
        return Promise.resolve('all actions stopped')
      return Promise.resolve('ok')
    })

    const brain: any = new Brain(deps)
    const enqueueSpy = vi.fn(async () => undefined)
    brain.enqueueEvent = enqueueSpy

    const bot = {
      interrupt: vi.fn(),
    }

    await brain.enqueueControlAction(bot, {
      tool: 'goToPlayer',
      params: { player_name: 'Alex', closeness: 2 },
    }, 1)

    await new Promise(resolve => setTimeout(resolve, 20))

    await brain.executeStopAction(bot, 2)
    await new Promise(resolve => setTimeout(resolve, 20))

    const snapshot = brain.getDebugSnapshot()
    const cancelledEntry = snapshot.actionQueue.recent.find((entry: any) => entry.tool === 'goToPlayer')
    expect(cancelledEntry?.state).toBe('cancelled')
    expect(snapshot.actionQueue.counts.total).toBe(0)
    expect(bot.interrupt).toHaveBeenCalled()

    const goToPlayerFailure = enqueueSpy.mock.calls.find((call: any[]) => {
      const event = call[1]
      return event?.type === 'feedback'
        && event?.payload?.status === 'failure'
        && event?.payload?.action?.tool === 'goToPlayer'
    })
    expect(goToPlayerFailure).toBeUndefined()
  })
})
