import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { config } from '../../composables/config'
import { ActionError } from '../../utils/errors'
import { Brain } from './brain'

function createAiriCommandEvent() {
  return {
    payload: {
      confidence: 1,
      description: 'Directive from AIRI: "continue"',
      metadata: { message: 'continue', sparkCommandId: 'spark-1', sparkIntent: 'action' },
      sourceId: 'airi',
      timestamp: Date.now(),
      type: 'airi_command',
    },
    source: { id: 'airi', type: 'airi' },
    timestamp: Date.now(),
    type: 'perception',
  } as any
}

function createAsyncControlAction(name: string = 'goToPlayer') {
  return {
    description: `${name} action`,
    execution: 'async',
    name,
    perform: () => async () => 'ok',
    schema: z.object({
      closeness: z.number(),
      player_name: z.string(),
    }),
  } as any
}

function createChatAction() {
  return {
    description: 'Chat action',
    execution: 'sync',
    name: 'chat',
    perform: () => () => 'chat sent',
    schema: z.object({
      feedback: z.boolean().optional(),
      message: z.string(),
    }),
  } as any
}

function createDeps(llmText: string) {
  config.openai = {
    apiKey: 'test-api-key',
    baseUrl: 'https://example.com/v1',
    model: 'test-model',
    reasoningModel: 'test-reasoning-model',
  }

  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    withError: vi.fn(),
  } as any
  logger.withError.mockReturnValue(logger)

  return {
    eventBus: { subscribe: vi.fn() },
    llmAgent: {
      callLLM: vi.fn(async () => ({ reasoning: '', text: llmText, usage: {} })),
    },
    logger,
    reflexManager: {
      clearFollowTarget: vi.fn(),
      getContextSnapshot: vi.fn(() => createReflexSnapshot()),
    },
    taskExecutor: {
      executeActionWithResult: vi.fn(async () => 'ok'),
      getAvailableActions: vi.fn(() => []),
      on: vi.fn(),
    },
  } as any
}

function createGiveUpAction() {
  return {
    description: 'Give up action',
    execution: 'sync',
    name: 'giveUp',
    perform: () => () => 'gave up',
    schema: z.object({
      reason: z.string(),
    }),
  } as any
}

function createNonResumingPerceptionEvent() {
  return {
    payload: {
      confidence: 1,
      description: 'Distant noise',
      metadata: { action: 'noise' },
      sourceId: 'world',
      timestamp: Date.now(),
      type: 'saliency_high',
    },
    source: { id: 'world', type: 'minecraft' },
    timestamp: Date.now(),
    type: 'perception',
  } as any
}

function createPerceptionEvent() {
  return {
    payload: {
      confidence: 1,
      description: 'Chat from Alex: "hi"',
      metadata: { message: 'hi', username: 'Alex' },
      sourceId: 'Alex',
      timestamp: Date.now(),
      type: 'chat_message',
    },
    source: { id: 'Alex', type: 'minecraft' },
    timestamp: Date.now(),
    type: 'perception',
  } as any
}

function createReadonlyAction(name: string = 'querySnapshot') {
  return {
    description: `${name} action`,
    execution: 'sync',
    name,
    perform: () => () => 'ok',
    readonly: true,
    schema: z.object({}),
  } as any
}

function createReflexSnapshot() {
  return {
    attention: {},
    autonomy: {
      followActive: false,
      followPlayer: null,
    },
    environment: {
      lightLevel: 15,
      nearbyEntities: [],
      nearbyPlayers: [],
      time: 'day',
      weather: 'clear',
    },
    self: {
      food: 20,
      health: 20,
      holding: null,
      location: { x: 0, y: 64, z: 0 },
    },
    social: {},
    threat: {},
  }
}

describe('brain no-action follow-up', () => {
  it('forgets conversation only', () => {
    const brain: any = new Brain(createDeps('await skip()'))
    brain.conversationHistory = [{ content: 'old', role: 'user' }]
    brain.lastLlmInputSnapshot = {
      attempt: 1,
      conversationHistory: [],
      messages: [],
      systemPrompt: 'sys',
      updatedAt: Date.now(),
      userMessage: 'msg',
    }
    brain.llmLogEntries = [{ eventType: 'x', id: 1, kind: 'turn_input', sourceId: 'x', sourceType: 'x', tags: [], text: 'x', timestamp: Date.now(), turnId: 1 }]

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
      payload: {
        noActionBudget: { default: 3, max: 8, remaining: 2 },
        reason: 'no_actions',
        returnValue: '2',
      },
      source: { id: 'brain:no_action_followup', type: 'system' },
      type: 'system_alert',
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
      payload: { reason: 'seed' },
      source: { id: 'brain:no_action_followup', type: 'system' },
      timestamp: Date.now(),
      type: 'system_alert',
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
      payload: { source: 'budget-test' },
      source: { id: 'budget-test', type: 'system' },
      timestamp: Date.now(),
      type: 'system_alert',
    })

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    const queuedEvent = (enqueueSpy.mock.calls[0] as any[])?.[1]
    expect(queuedEvent).toMatchObject({
      payload: { reason: 'no_action_budget_exhausted' },
      source: { id: 'brain:no_action_budget', type: 'system' },
      type: 'system_alert',
    })
    expect(bot.bot.chat).toHaveBeenCalledTimes(1)
  })

  it('resets no-action budget when player chat arrives', async () => {
    const brain: any = new Brain(createDeps('await skip()'))
    brain.setNoActionFollowupBudget(0)

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(brain.getNoActionBudgetState()).toEqual({
      default: 3,
      max: 8,
      remaining: 3,
    })
  })

  it('clears giveUp and proceeds when player chat arrives', async () => {
    const deps: any = createDeps('await skip()')
    const brain: any = new Brain(deps)
    brain.givenUp = true
    brain.giveUpReason = 'stuck'

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(brain.givenUp).toBe(false)
    expect(brain.giveUpReason).toBeUndefined()
    expect(deps.llmAgent.callLLM).toHaveBeenCalledTimes(1)
  })

  it('clears giveUp and proceeds when an AIRI command arrives', async () => {
    const deps: any = createDeps('await skip()')
    const brain: any = new Brain(deps)
    brain.givenUp = true
    brain.giveUpReason = 'stuck'
    brain.setNoActionFollowupBudget(0)

    await brain.processEvent({} as any, createAiriCommandEvent())

    expect(brain.givenUp).toBe(false)
    expect(brain.giveUpReason).toBeUndefined()
    expect(brain.getNoActionBudgetState()).toEqual({
      default: 3,
      max: 8,
      remaining: 3,
    })
    expect(deps.llmAgent.callLLM).toHaveBeenCalledTimes(1)
  })

  it('keeps suppressing non-chat and non-AIRI perceptions while giveUp is active', async () => {
    const deps: any = createDeps('await skip()')
    const brain: any = new Brain(deps)
    brain.givenUp = true
    brain.giveUpReason = 'stuck'

    await brain.processEvent({} as any, createNonResumingPerceptionEvent())

    expect(brain.givenUp).toBe(true)
    expect(brain.giveUpReason).toBe('stuck')
    expect(deps.llmAgent.callLLM).not.toHaveBeenCalled()
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

  it('does not pass a timeout to llmAgent calls', async () => {
    const deps: any = createDeps('await chat("hi")')
    deps.llmAgent.callLLM = vi.fn(async () => ({
      text: 'await chat("hi")',
      usage: {},
    }))
    const brain: any = new Brain(deps)

    await brain.processEvent({} as any, createPerceptionEvent())

    expect(deps.llmAgent.callLLM).toHaveBeenCalledTimes(1)
    const llmCallOptions = deps.llmAgent.callLLM.mock.calls[0]?.[0]
    expect(llmCallOptions?.timeoutMs).toBeUndefined()
    expect(llmCallOptions?.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('aborts in-flight llm call when paused', async () => {
    const deps: any = createDeps('await chat("hi")')
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    deps.llmAgent.callLLM = vi.fn(async (options: any) => {
      resolveStarted()
      return await new Promise((_resolve, reject) => {
        options.abortSignal?.addEventListener('abort', () => {
          reject(options.abortSignal.reason ?? Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        }, { once: true })
      })
    })
    const brain: any = new Brain(deps)

    const processing = brain.processEvent({} as any, createPerceptionEvent()).then(() => 'done')
    await started
    brain.setPaused(true)

    const outcome = await Promise.race([
      processing,
      new Promise(resolve => setTimeout(resolve, 500, 'timeout')),
    ])

    expect(outcome).toBe('done')
    const llmCallOptions = deps.llmAgent.callLLM.mock.calls[0]?.[0]
    expect(llmCallOptions?.abortSignal?.aborted).toBe(true)
    expect(brain.getLlmLogs().some((entry: any) => entry.kind === 'repl_error')).toBe(false)
    expect(brain.getLlmLogs().some((entry: any) => entry.text === 'No LLM response after retries')).toBe(false)
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
      payload: {
        reason: 'error_burst_guard',
        threshold: 3,
        windowTurns: 5,
      },
      source: { id: 'brain:error_burst_guard', type: 'system' },
      type: 'system_alert',
    })
    expect(brain.errorBurstGuardState?.errorTurnCount).toBeGreaterThanOrEqual(3)
  })

  it('includes mandatory give-up and chat instructions when error-burst guard is active', () => {
    const brain: any = new Brain(createDeps('await skip()'))
    brain.errorBurstGuardState = {
      errorTurnCount: 3,
      recentErrorSummary: ['turn=7 repl_error: parse failed'],
      recentTurnIds: [7, 6, 5, 4, 3],
      threshold: 3,
      triggeredAtTurnId: 8,
      windowTurns: 5,
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
    const deps: any = createDeps('await giveUp({ reason: "stuck" }); await chat("I got stuck after repeated errors.")')
    deps.taskExecutor.getAvailableActions = vi.fn(() => [createGiveUpAction(), createChatAction()])
    deps.taskExecutor.executeActionWithResult = vi.fn(async (action: any) => action.tool === 'giveUp' ? 'gave up' : 'chat sent')

    const brain: any = new Brain(deps)
    brain.errorBurstGuardState = {
      errorTurnCount: 3,
      recentErrorSummary: ['turn=7 repl_error: parse failed'],
      recentTurnIds: [7, 6, 5, 4, 3],
      threshold: 3,
      triggeredAtTurnId: 8,
      windowTurns: 5,
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
    payload: { action: { params: {}, tool: 'goToCoordinate' }, result: 'ok', status: 'success' },
    source: { id: 'executor', type: 'system' },
    timestamp: Date.now(),
    type: 'feedback',
  } as any
}

function createNoActionFollowupEvent() {
  return {
    payload: { logs: [], reason: 'no_actions', returnValue: '0' },
    source: { id: 'brain:no_action_followup', type: 'system' },
    timestamp: Date.now(),
    type: 'system_alert',
  } as any
}

describe('brain queue coalescing', () => {
  it('promotes player chat ahead of stale feedback events', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    // Simulate a queue with feedback events followed by a player chat
    const resolved: string[] = []
    brain.queue = [
      { event: createFeedbackEvent(), reject: vi.fn(), resolve: () => resolved.push('fb1') },
      { event: createFeedbackEvent(), reject: vi.fn(), resolve: () => resolved.push('fb2') },
      { event: createPerceptionEvent(), reject: vi.fn(), resolve: () => resolved.push('chat') },
    ]

    brain.coalesceQueue()

    // Player chat (priority 0) should be first in queue
    expect(brain.queue[0].event.type).toBe('perception')
    expect((brain.queue[0].event.payload as any).type).toBe('chat_message')
  })

  it('promotes AIRI commands ahead of queued ordinary perceptions', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    brain.queue = [
      { event: createNonResumingPerceptionEvent(), reject: vi.fn(), resolve: vi.fn() },
      { event: createFeedbackEvent(), reject: vi.fn(), resolve: vi.fn() },
      { event: createAiriCommandEvent(), reject: vi.fn(), resolve: vi.fn() },
    ]

    brain.coalesceQueue()

    expect(brain.queue[0].event.type).toBe('perception')
    expect((brain.queue[0].event.payload as any).type).toBe('airi_command')
    expect((brain.queue[1].event.payload as any).type).toBe('saliency_high')
    expect(brain.queue[2].event.type).toBe('feedback')
  })

  it('drops no-action follow-ups when player chat is waiting', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    const resolved: string[] = []
    brain.queue = [
      { event: createNoActionFollowupEvent(), reject: vi.fn(), resolve: () => resolved.push('followup1') },
      { event: createNoActionFollowupEvent(), reject: vi.fn(), resolve: () => resolved.push('followup2') },
      { event: createFeedbackEvent(), reject: vi.fn(), resolve: () => resolved.push('fb') },
      { event: createPerceptionEvent(), reject: vi.fn(), resolve: () => resolved.push('chat') },
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
      { event: createNoActionFollowupEvent(), reject: vi.fn(), resolve: vi.fn() },
    ]

    brain.coalesceQueue()

    expect(brain.queue).toHaveLength(1)
  })

  it('does not coalesce when no high-priority events exist', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    brain.queue = [
      { event: createFeedbackEvent(), reject: vi.fn(), resolve: vi.fn() },
      { event: createNoActionFollowupEvent(), reject: vi.fn(), resolve: vi.fn() },
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
      { event: createFeedbackEvent(), reject: vi.fn(), resolve: vi.fn() },
      { event: chat1, reject: vi.fn(), resolve: vi.fn() },
      { event: chat2, reject: vi.fn(), resolve: vi.fn() },
    ]

    brain.coalesceQueue()

    // Both chats should come before feedback, and maintain their relative order
    expect(brain.queue[0].event.payload.description).toContain('first')
    expect(brain.queue[1].event.payload.description).toContain('second')
    expect(brain.queue[2].event.type).toBe('feedback')
  })

  it('drops lowest-priority events when queue exceeds hard limit', () => {
    const brain: any = new Brain(createDeps('await skip()'))

    const droppedResolver = vi.fn()
    brain.queue = [
      ...Array.from({ length: 256 }).fill({
        event: createPerceptionEvent(),
        reject: vi.fn(),
        resolve: vi.fn(),
      }),
      {
        event: createNoActionFollowupEvent(),
        reject: vi.fn(),
        resolve: droppedResolver,
      },
    ]

    brain.trimEventQueueOverflow()

    expect(brain.queue).toHaveLength(256)
    expect(droppedResolver).toHaveBeenCalledTimes(1)
    expect(brain.queue.every((item: any) => item.event.source?.id !== 'brain:no_action_followup')).toBe(true)
  })

  it('preserves feedback event during overflow by dropping non-feedback first', () => {
    const brain: any = new Brain(createDeps('await skip()'))
    const feedbackResolver = vi.fn()

    brain.queue = [
      ...Array.from({ length: 256 }).fill({
        event: createPerceptionEvent(),
        reject: vi.fn(),
        resolve: vi.fn(),
      }),
      {
        event: createFeedbackEvent(),
        reject: vi.fn(),
        resolve: feedbackResolver,
      },
    ]

    brain.trimEventQueueOverflow()

    expect(brain.queue).toHaveLength(256)
    expect(feedbackResolver).not.toHaveBeenCalled()
    expect(brain.queue.some((item: any) => item.event.type === 'feedback')).toBe(true)
    expect(brain.queue.filter((item: any) => item.event.type === 'perception')).toHaveLength(255)
  })

  it('forces a low-priority dispatch after long high-priority streak', () => {
    const brain: any = new Brain(createDeps('await skip()'))
    brain.consecutiveHighPriorityTurns = 8
    const feedbackEvent = {
      ...createFeedbackEvent(),
      timestamp: Date.now() - 2000,
    }

    brain.queue = [
      { event: createPerceptionEvent(), reject: vi.fn(), resolve: vi.fn() },
      { event: feedbackEvent, reject: vi.fn(), resolve: vi.fn() },
    ]

    brain.coalesceQueue()
    const item = brain.dequeueNextQueuedEvent()

    expect(item.event.type).toBe('feedback')
    expect(brain.consecutiveHighPriorityTurns).toBe(0)
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
      new Promise(resolve => setTimeout(resolve, 250, 'timeout')),
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
      params: {},
      tool: 'querySnapshot',
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
      params: { closeness: 2, player_name: 'Alex' },
      tool: 'goToPlayer',
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
