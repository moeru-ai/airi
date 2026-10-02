import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import type { AssistantTurn, Conversation } from '../messages/types'
import type { ChatHistoryItem, ContextMessage } from '../types/chat'
import type { StreamOptions } from '../types/llm'
import type { Audience } from './audience'
import type { ChatOrchestratorRuntimeDeps, ChatOrchestratorRuntimeLimits } from './chat-orchestrator-runtime'
import type { AgentRun } from './run-table'

import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { describe, expect, it, vi } from 'vitest'

import { audienceFromBindings, intersectAudiences, OWNER_AUDIENCE, PUBLIC_AUDIENCE } from './audience'
import { createChatOrchestratorRuntime, MAX_DERIVATION_DEPTH, MAX_DERIVED_CHILDREN } from './chat-orchestrator-runtime'
import { LeaseTable } from './lease-table'
import { RunTable } from './run-table'
import { STAY_QUIET_TOOL_NAME } from './stay-quiet'

const provider: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', webSearch: false, config: { model, baseURL: 'https://example.com/' } }),
}

function createRunHarness(options: { sessionAudience?: Audience, runAudience?: Audience, outputs?: string[], pool?: ContextMessage[], onRunChange?: (run: AgentRun) => void, limits?: Partial<ChatOrchestratorRuntimeLimits>, decideIntake?: ChatOrchestratorRuntimeDeps['decideIntake'], decideDirectIntake?: ChatOrchestratorRuntimeDeps['decideDirectIntake'], checkSpendingLimit?: ChatOrchestratorRuntimeDeps['checkSpendingLimit'], getSystemPrompt?: ChatOrchestratorRuntimeDeps['getSystemPrompt'], getHistoryDigest?: ChatOrchestratorRuntimeDeps['getHistoryDigest'], decideBeforeReply?: ChatOrchestratorRuntimeDeps['decideBeforeReply'], personaOf?: (sessionId: string) => string, leases?: LeaseTable, runs?: RunTable } = {}) {
  const messages: ChatHistoryItem[] = []
  const runChanges: AgentRun[] = []
  let sessionAudience = options.sessionAudience ?? OWNER_AUDIENCE
  const correlations: StreamOptions['requestCorrelation'][] = []
  const snapshot = vi.fn((_sessionId: string, _audience: Audience) => ({ pool: options.pool ?? [] }))
  const stream = vi.fn(async (_model: string, _provider: GenerationProvider, _conversation: Conversation, streamOptions?: StreamOptions) => {
    correlations.push(streamOptions?.requestCorrelation)
    await streamOptions?.onGeneratedTurn?.({ type: 'assistant', id: 'turn', status: 'completed', rounds: [] } satisfies AssistantTurn)
    await streamOptions?.onStreamEvent?.({ type: 'text-delta', text: 'reply' })
    await streamOptions?.onStreamEvent?.({ type: 'finish' })
  })
  const runtime = createChatOrchestratorRuntime({
    session: {
      ensureSession: () => {},
      getSessionMessages: () => messages,
      appendSessionMessage: (_sessionId, message) => {
        messages.push(message)
      },
      getSessionGeneration: () => 1,
      getSessionAudience: () => sessionAudience,
      narrowSessionAudience: (_sessionId, audience) => {
        sessionAudience = intersectAudiences(sessionAudience, audience)
      },
      removeSessionMessages: (_sessionId, messageIds) => {
        const kept = messages.filter(message => !message.id || !messageIds.includes(message.id))
        messages.splice(0, messages.length, ...kept)
      },
    },
    getLimits: () => options.limits ?? {},
    context: { ingest: vi.fn(), snapshot },
    foregroundStream: { patch: vi.fn(), reset: vi.fn() },
    llm: { stream },
    getActiveSessionId: () => 'session',
    getActiveProvider: () => 'mock',
    createEnvelope: sessionId => ({ bindings: [], outputs: options.outputs ?? ['chat:owner'], audience: options.runAudience ?? OWNER_AUDIENCE, personaId: options.personaOf?.(sessionId) ?? 'airi' }),
    onRunChange: options.onRunChange ?? (run => runChanges.push(run)),
    decideIntake: options.decideIntake,
    decideDirectIntake: options.decideDirectIntake,
    checkSpendingLimit: options.checkSpendingLimit,
    getSystemPrompt: options.getSystemPrompt,
    getHistoryDigest: options.getHistoryDigest,
    decideBeforeReply: options.decideBeforeReply,
    leases: options.leases,
    runs: options.runs,
  })
  const narrowSession = (audience: Audience) => {
    sessionAudience = intersectAudiences(sessionAudience, audience)
  }
  return { runtime, messages, runChanges, correlations, snapshot, stream, getSessionAudience: () => sessionAudience, narrowSession }
}

/** Waits like a provider stream until the run aborts its request. */
function untilAborted(streamOptions?: StreamOptions) {
  return new Promise<void>((_resolve, reject) => {
    const signal = streamOptions?.abortSignal
    if (signal?.aborted)
      reject(signal.reason)
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

describe('orchestrator runs', () => {
  // ROOT CAUSE:
  // AssistantTurn.runId and requestCorrelation.runId existed, but the runtime never filled them.
  it('gives every send a traceable run with its envelope', async () => {
    const harness = createRunHarness()

    await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    const [run] = harness.runtime.getRuns()
    expect(run).toMatchObject({ sessionId: 'session', state: 'done', envelope: { sessionId: 'session', outputs: ['chat:owner'], audience: OWNER_AUDIENCE, personaId: 'airi' } })
    expect(harness.runChanges.map(change => change.state)).toEqual(['queued', 'working', 'done'])
    expect(harness.correlations[0]?.runId).toBe(run.runId)
    expect(harness.snapshot).toHaveBeenCalledWith('session', OWNER_AUDIENCE)
    const assistant = harness.messages.find(message => message.role === 'assistant')
    expect(assistant && 'generationTranscript' in assistant ? assistant.generationTranscript?.runId : undefined).toBe(run.runId)
  })

  it('rejects work whose outputs reach beyond the session audience before a run exists', async () => {
    const harness = createRunHarness({ sessionAudience: OWNER_AUDIENCE, runAudience: audienceFromBindings(['discord:channel:a']) })

    await expect(harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })).rejects.toThrow('Run audience exceeds the session audience')
    // Unauthorized work never becomes a run.
    expect(harness.runtime.getRuns()).toEqual([])
    expect(harness.runChanges).toEqual([])
    expect(harness.messages).toEqual([])
    // The intake trace keeps the failure apart from a choice.
    expect(harness.runtime.getIntakeRecords()).toMatchObject([{ outcome: 'rejected', reason: 'audience', decidedBy: 'rule' }])
    expect(harness.runtime.getIntakeRecords()[0]?.runId).toBeUndefined()
  })

  // ROOT CAUSE:
  // `ingest` admitted a run for every input, so the host could not ignore a stimulus without faking a run.
  it('records an ignored connection input without a run, a provider call, or a message', async () => {
    const decideIntake = vi.fn(() => ({ outcome: 'ignored' as const, reason: 'not-addressed', decidedBy: 'rule' as const }))
    const harness = createRunHarness({ decideIntake })

    const result = await harness.runtime.ingest('chatter', { model: 'test', chatProvider: provider, outputTarget: 'discord-connection' })

    expect(result).toEqual({ stimulusId: expect.any(String), outcome: 'ignored' })
    expect(decideIntake).toHaveBeenCalledWith(expect.objectContaining({ source: 'connection:discord-connection', direct: false, origin: 'external' }))
    expect(harness.runtime.getRuns()).toEqual([])
    expect(harness.stream).not.toHaveBeenCalled()
    expect(harness.messages).toEqual([])
    expect(harness.runtime.getIntakeRecords()).toMatchObject([{ stimulusId: result.stimulusId, outcome: 'ignored', reason: 'not-addressed' }])
  })

  // The supplement requires an intake decision for direct input, without automatic admission or a remote wait.
  it('decides direct owner input with the local policy, never the remote one', async () => {
    const decideIntake = vi.fn(() => ({ outcome: 'admitted' as const, reason: 'remote', decidedBy: 'classifier' as const }))
    const decideDirectIntake = vi.fn(() => ({ outcome: 'ignored' as const, reason: 'busy-persona', decidedBy: 'rule' as const }))
    const harness = createRunHarness({ decideIntake, decideDirectIntake })

    const result = await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    expect(decideIntake).not.toHaveBeenCalled()
    expect(decideDirectIntake).toHaveBeenCalledWith(expect.objectContaining({ direct: true, source: 'owner', text: 'hello' }))
    expect(result.outcome).toBe('ignored')
    expect(harness.runtime.getRuns()).toEqual([])
    expect(harness.stream).not.toHaveBeenCalled()
    expect(harness.runtime.getIntakeRecords()).toMatchObject([{ outcome: 'ignored', reason: 'busy-persona', decidedBy: 'rule' }])
  })

  it('admits direct input by the default local rule and ignores empty input', async () => {
    const harness = createRunHarness()

    const empty = await harness.runtime.ingest('   ', { model: 'test', chatProvider: provider })
    const result = await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    expect(empty.outcome).toBe('ignored')
    expect(result).toMatchObject({ outcome: 'admitted', runId: harness.runtime.getRuns()[0]?.runId })
    expect(harness.runtime.getIntakeRecords()).toMatchObject([
      { outcome: 'ignored', reason: 'empty-input', decidedBy: 'rule' },
      { outcome: 'admitted', reason: 'direct-input', decidedBy: 'rule', runId: result.runId },
    ])
  })

  // ROOT CAUSE:
  // Voice exclusivity lived inside the chat runtime, so notification reactions spoke over a conversation run.
  it('waits for the voice lease that another run owner holds', async () => {
    const leases = new LeaseTable()
    leases.acquire('voice', 'notification-run', { salience: 0.9 })
    const harness = createRunHarness({ leases, outputs: ['chat:owner', 'voice'] })

    const send = harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(harness.stream).not.toHaveBeenCalled()
    expect(harness.runtime.getRuns()[0]?.state).toBe('queued')

    leases.release('voice', 'notification-run')
    await send
    expect(harness.stream).toHaveBeenCalledOnce()
    // The run releases the voice when it ends.
    expect(leases.holder('voice')).toBeUndefined()
  })

  // A5: a reached spending limit stops new runs visibly. It never switches to a cheaper model.
  it('rejects input while the spending limit is reached, and records why', async () => {
    let message: string | undefined = 'Spending limit reached until 10:00'
    const harness = createRunHarness({ checkSpendingLimit: () => message })

    await expect(harness.runtime.ingest('hello', { model: 'strong', chatProvider: provider })).rejects.toThrow('Spending limit reached until 10:00')
    expect(harness.stream).not.toHaveBeenCalled()
    expect(harness.runtime.getRuns()).toEqual([])
    expect(harness.runtime.getIntakeRecords()).toMatchObject([{ outcome: 'rejected', reason: 'spending-limit' }])

    message = undefined
    await harness.runtime.ingest('hello', { model: 'strong', chatProvider: provider })
    expect(harness.stream.mock.calls[0]?.[0]).toBe('strong')
  })

  // P7: identity follows the session's persona at request time. History carries none.
  it('gives each run the identity of its session persona and skips stored system snapshots', async () => {
    const harness = createRunHarness({
      personaOf: sessionId => sessionId === 'cat-session' ? 'cat' : 'airi',
      getSystemPrompt: envelope => envelope.personaId === 'cat' ? 'You are a cat.' : 'You are AIRI.',
    })
    harness.messages.push({ role: 'system', content: 'Stale snapshot of another card.', id: 'snapshot' })

    await harness.runtime.ingest('hi', { model: 'test', chatProvider: provider }, 'cat-session')
    await harness.runtime.ingest('hi', { model: 'test', chatProvider: provider }, 'airi-session')

    const systemTexts = (call: number) => harness.stream.mock.calls[call]![2].turns.filter(turn => turn.type === 'system').map(turn => JSON.stringify(turn.content))
    expect(systemTexts(0)).toEqual([JSON.stringify([{ type: 'text', text: 'You are a cat.' }])])
    expect(systemTexts(1)).toEqual([JSON.stringify([{ type: 'text', text: 'You are AIRI.' }])])
  })

  // P7 acceptance: prompt size stays bounded. Older exchanges give way to the digest when it covers them.
  it('keeps long history within the budget and puts the digest or a count in its place', async () => {
    const old = 'old words '.repeat(200)
    const fill = (harness: ReturnType<typeof createRunHarness>) => harness.messages.push(
      { role: 'user', content: old, id: 'u1' },
      { role: 'assistant', content: old, slices: [], tool_results: [], id: 'a1' },
      { role: 'user', content: 'recent question', id: 'u2' },
      { role: 'assistant', content: 'recent answer', slices: [], tool_results: [], id: 'a2' },
    )
    const withDigest = createRunHarness({ limits: { historyTokenBudget: 300 }, getHistoryDigest: () => ({ text: 'They talked about old things.', upToMessageId: 'a1' }) })
    fill(withDigest)
    const withoutDigest = createRunHarness({ limits: { historyTokenBudget: 300 } })
    fill(withoutDigest)

    await withDigest.runtime.ingest('new', { model: 'test', chatProvider: provider })
    await withoutDigest.runtime.ingest('new', { model: 'test', chatProvider: provider })

    const digestPrompt = JSON.stringify(withDigest.stream.mock.calls[0]![2])
    expect(digestPrompt).not.toContain('old words')
    expect(digestPrompt).toContain('recent answer')
    expect(digestPrompt).toContain('Summary of the earlier conversation in this session: They talked about old things.')
    expect(JSON.stringify(withoutDigest.stream.mock.calls[0]![2])).toContain('2 earlier messages of this session are not shown.')
    // The stored history keeps every message.
    expect(withDigest.messages.map(message => message.id)).toContain('u1')
  })

  // ROOT CAUSE:
  //
  // The session audience was checked only when a send entered the queue. A private write while it waited
  // narrowed the session, and the waiting channel run still read that private history.
  //
  // We fixed this by checking the audience again when the run starts and when it reads history.
  it('blocks a waiting run whose session narrowed below its audience', async () => {
    const channel = audienceFromBindings(['discord:channel:a'])
    const harness = createRunHarness({ sessionAudience: channel, runAudience: channel })
    let releaseFirst!: () => void
    harness.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
    })

    const first = harness.runtime.ingest('first', { model: 'test', chatProvider: provider, outputTarget: 'discord-connection' })
    await vi.waitFor(() => expect(harness.stream).toHaveBeenCalledOnce())
    const second = harness.runtime.ingest('second', { model: 'test', chatProvider: provider, outputTarget: 'discord-connection' })
    // A private write narrows the session while the second send waits.
    harness.narrowSession(OWNER_AUDIENCE)
    harness.messages.push({ role: 'assistant', content: 'owner secret', slices: [], tool_results: [], id: 'private' })
    releaseFirst()
    await first

    await expect(second).rejects.toThrow('The session audience narrowed below the run audience')
    expect(harness.stream).toHaveBeenCalledOnce()
    expect(harness.runtime.getRuns().at(-1)).toMatchObject({ state: 'blocked' })
  })

  // The quick size check used to read only message text, so a large tool result in an old transcript slipped through.
  it('drops an old exchange whose tool results exceed the budget', async () => {
    const harness = createRunHarness({ limits: { historyTokenBudget: 2_000 } })
    const transcript: AssistantTurn = {
      type: 'assistant',
      id: 'old-turn',
      status: 'completed',
      rounds: [{ id: 'round', content: [{ type: 'text', text: 'searched' }], toolInvocations: [{ id: 'call', callId: 'call', name: 'search', arguments: '{}', execution: { status: 'succeeded', output: [{ type: 'text', text: 'huge result '.repeat(5_000) }] } }], projectionIssues: [] }],
    }
    harness.messages.push(
      { role: 'user', content: 'search something', id: 'u1' },
      { role: 'assistant', content: 'searched', slices: [], tool_results: [], id: 'a1', generationTranscript: transcript },
      { role: 'user', content: 'recent question', id: 'u2' },
      { role: 'assistant', content: 'recent answer', slices: [], tool_results: [], id: 'a2' },
    )

    await harness.runtime.ingest('new', { model: 'test', chatProvider: provider })

    const prompt = JSON.stringify(harness.stream.mock.calls[0]![2])
    expect(prompt).not.toContain('huge result')
    expect(prompt).toContain('recent answer')
  })

  // A decision recipe can read a message and stay quiet without a model call. A failed decision never blocks the reply.
  it('ends silently before generation when a decision recipe chooses silence', async () => {
    const quiet = createRunHarness({ decideBeforeReply: async () => ({ silent: { reason: 'nothing to answer' } }) })
    await quiet.runtime.ingest('ok', { model: 'test', chatProvider: provider })

    expect(quiet.stream).not.toHaveBeenCalled()
    expect(quiet.runtime.getRuns()[0]).toMatchObject({ state: 'done', silent: { reason: 'nothing to answer' } })
    expect(quiet.messages.map(message => message.role)).toEqual(['user'])

    const hinted = createRunHarness({ decideBeforeReply: async () => ({ hints: ['The owner seems tired. Keep it short.'], applied: ['Owner mood'] }) })
    await hinted.runtime.ingest('long day', { model: 'test', chatProvider: provider })
    expect(JSON.stringify(hinted.stream.mock.calls[0]![2].turns.at(-1))).toContain('The owner seems tired. Keep it short.')
    // The reply names the recipe that changed it.
    expect(hinted.messages.find(message => message.role === 'assistant')).toMatchObject({ recipes: ['Owner mood'] })

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing = createRunHarness({ decideBeforeReply: async () => {
      throw new Error('classifier down')
    } })
    await failing.runtime.ingest('ok', { model: 'test', chatProvider: provider })
    expect(failing.stream).toHaveBeenCalledOnce()
    consoleWarn.mockRestore()
  })

  // T3: work without the voice output neither waits for the voice nor reserves it.
  it('runs domain work while another run holds the voice', async () => {
    const leases = new LeaseTable()
    leases.acquire('voice', 'conversation-run', { salience: 0.7 })
    const harness = createRunHarness({ leases, outputs: ['connection:minecraft'] })

    await harness.runtime.ingest('chop a tree', { model: 'test', chatProvider: provider, outputTarget: 'minecraft' })

    expect(harness.stream).toHaveBeenCalledOnce()
    expect(leases.holder('voice')?.holder).toBe('conversation-run')
  })

  // The voice stays held while speech plays after its run. Owner input cuts in. Scene input waits for the speech to end.
  it('lets owner input interrupt speech that outlived its run, while connection input waits for it', async () => {
    const leases = new LeaseTable()
    leases.acquire('voice', 'earlier-run', { salience: 0.7 })
    leases.handOver('voice', 'earlier-run', 'playback:turn', { interruptible: true })
    const harness = createRunHarness({ leases, outputs: ['chat:owner', 'voice'] })

    const connection = harness.runtime.ingest('from the scene', { model: 'test', chatProvider: provider, outputTarget: 'discord-connection' }, 'scene-session')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(harness.stream).not.toHaveBeenCalled()

    await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })
    expect(harness.stream).toHaveBeenCalledOnce()

    await connection
    expect(harness.stream).toHaveBeenCalledTimes(2)
  })

  // T20: a limit of one serializes active work across every run owner, with the normal envelope and trace.
  it('waits for a working run of another owner when the limit is one', async () => {
    const runs = new RunTable()
    runs.admit({ runId: 'notification-run', envelope: { sessionId: 'other', bindings: [], outputs: ['voice'], audience: OWNER_AUDIENCE } })
    runs.transition('notification-run', 'working')
    const harness = createRunHarness({ runs, limits: { maxConcurrentRuns: 1 } })

    const send = harness.runtime.ingest('domain work', { model: 'test', chatProvider: provider })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(harness.stream).not.toHaveBeenCalled()

    runs.transition('notification-run', 'done')
    await send
    expect(harness.stream).toHaveBeenCalledOnce()
    expect(runs.snapshot().map(run => run.state)).toEqual(['done', 'done'])
  })

  it('admits connection input when the intake policy fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const harness = createRunHarness({ decideIntake: () => Promise.reject(new Error('classifier down')) })

    const result = await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider, outputTarget: 'discord-connection' })

    expect(result.outcome).toBe('admitted')
    expect(harness.runtime.getIntakeRecords()).toMatchObject([{ outcome: 'admitted', reason: 'policy-failed', decidedBy: 'fallback' }])
    consoleError.mockRestore()
  })

  // ROOT CAUSE:
  // Hook consumers labeled turns with the single active send. Concurrent sessions need each turn to carry its own owner.
  it('gives every hook context its session, run, and envelope outputs', async () => {
    const harness = createRunHarness()
    const contexts: unknown[] = []
    harness.runtime.hooks.onBeforeSend(async (_message, context) => {
      contexts.push(context)
    })

    await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    expect(contexts[0]).toMatchObject({ sessionId: 'session', runId: harness.runtime.getRuns()[0]?.runId, outputs: ['chat:owner'] })
  })

  // ROOT CAUSE:
  // A throwing run observer escaped into the send queue, and the send never settled.
  it('completes a send when a run observer throws', async () => {
    const harness = createRunHarness({ onRunChange: () => {
      throw new Error('observer failed')
    } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    expect(harness.runtime.getRuns()[0]?.state).toBe('done')
    consoleError.mockRestore()
  })

  // ROOT CAUSE:
  // A stalled or endless provider kept its session slot forever, and its caller never learned that it failed.
  it('expires a stalled run and reports a failure', async () => {
    const harness = createRunHarness({ limits: { stallTimeoutMs: 30 } })
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => untilAborted(streamOptions))

    await expect(harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })).rejects.toThrow('Run stalled without stream activity')
    expect(harness.runtime.getRuns()[0]).toMatchObject({ state: 'expired', error: 'Run stalled without stream activity' })
    expect(harness.runtime.getRunningSessionIds()).toEqual([])
  })

  it('expires an active run at its deadline', async () => {
    const harness = createRunHarness({ limits: { stallTimeoutMs: 1_000, runDeadlineMs: 60 } })
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      const ticker = setInterval(() => void streamOptions?.onStreamEvent?.({ type: 'text-delta', text: '.' }), 10)
      try {
        await untilAborted(streamOptions)
      }
      finally {
        clearInterval(ticker)
      }
    })

    await expect(harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })).rejects.toThrow('Run exceeded its deadline')
    expect(harness.runtime.getRuns()[0]?.state).toBe('expired')
  })

  // T2: an admitted run can complete silently, as a success with no assistant message.
  it('records a chosen silence as a successful run without an assistant message', async () => {
    const harness = createRunHarness()
    const replies: unknown[] = []
    harness.runtime.hooks.onAssistantMessage(async (message) => {
      replies.push(message)
    })
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      await streamOptions?.onStreamEvent?.({ type: 'tool-call', toolCallId: 'quiet', toolCallType: 'function', toolName: STAY_QUIET_TOOL_NAME, args: '{"reason":"They are talking to each other"}' })
      await streamOptions?.onGeneratedTurn?.({ type: 'assistant', id: 'turn', status: 'completed', rounds: [] } satisfies AssistantTurn)
      await streamOptions?.onStreamEvent?.({ type: 'finish' })
    })

    await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    expect(harness.runtime.getRuns()[0]).toMatchObject({ state: 'done', silent: { reason: 'They are talking to each other' } })
    expect(harness.messages.map(message => message.role)).toEqual(['user'])
    expect(replies).toEqual([])
  })

  it('keeps a reply that follows the silence tool, because spoken text wins', async () => {
    const harness = createRunHarness()
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      await streamOptions?.onStreamEvent?.({ type: 'tool-call', toolCallId: 'quiet', toolCallType: 'function', toolName: STAY_QUIET_TOOL_NAME, args: '{}' })
      await streamOptions?.onStreamEvent?.({ type: 'text-delta', text: 'Actually, one thing.' })
      await streamOptions?.onStreamEvent?.({ type: 'finish' })
    })

    await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    expect(harness.runtime.getRuns()[0]?.silent).toBeUndefined()
    expect(harness.messages.map(message => message.role)).toEqual(['user', 'assistant'])
  })

  // T8: a failure or an empty reply without the explicit choice never counts as silence.
  it('never records silence for a failed provider or an empty reply', async () => {
    const harness = createRunHarness()
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      await streamOptions?.onStreamEvent?.({ type: 'finish' })
    })
    harness.stream.mockImplementationOnce(async () => {
      throw new Error('provider down')
    })

    await harness.runtime.ingest('first', { model: 'test', chatProvider: provider })
    await expect(harness.runtime.ingest('second', { model: 'test', chatProvider: provider })).rejects.toThrow('provider down')

    expect(harness.runtime.getRuns().map(run => [run.state, run.silent])).toEqual([['done', undefined], ['blocked', undefined]])
  })

  // T6: the next turn reads the speech that the listener heard, not the full generated reply.
  it('gives the next prompt only the delivered part of an interrupted voice reply', async () => {
    const harness = createRunHarness()
    const generated: AssistantTurn = {
      type: 'assistant',
      id: 'previous',
      status: 'completed',
      rounds: [{ id: 'round', content: [{ type: 'text', text: 'First sentence. Second sentence nobody heard.' }], toolInvocations: [], projectionIssues: [] }],
    }
    harness.messages.push(
      { role: 'user', content: 'tell me', id: 'user-1' },
      { role: 'assistant', content: 'First sentence. Second sentence nobody heard.', slices: [], tool_results: [], id: 'assistant-1', generationTranscript: generated, deliveredSpeech: 'First sentence.' },
      { role: 'assistant', content: 'Plain reply that was cut.', slices: [], tool_results: [], id: 'assistant-2', deliveredSpeech: 'Plain' },
    )

    await harness.runtime.ingest('go on', { model: 'test', chatProvider: provider })

    const conversation = harness.stream.mock.calls[0]?.[2]
    const text = JSON.stringify(conversation)
    expect(text).toContain('First sentence.…')
    expect(text).not.toContain('Second sentence nobody heard')
    expect(text).toContain('Plain…')
    expect(text).not.toContain('Plain reply that was cut')
    // The stored history keeps the generated text for the chat.
    expect(harness.messages[1]).toMatchObject({ content: 'First sentence. Second sentence nobody heard.' })
  })

  // T11: the next owner turn resumes the session with the proactive reply in place, and no user turn appears for it.
  it('gives the next prompt a proactive reply as the character turn, without a fabricated user turn', async () => {
    const harness = createRunHarness()
    harness.messages.push(
      { role: 'user', content: 'let us play', id: 'user-1' },
      { role: 'assistant', content: 'Sure.', slices: [], tool_results: [], id: 'assistant-1' },
      { role: 'assistant', content: 'A creeper is behind you!', slices: [{ type: 'text', text: 'A creeper is behind you!' }], tool_results: [], id: 'reaction-1', proactive: { runId: 'notification-run', source: 'minecraft' } },
    )

    await harness.runtime.ingest('where?', { model: 'test', chatProvider: provider })

    const turns = harness.stream.mock.calls[0]?.[2].turns ?? []
    const nonSystem = turns.filter(turn => turn.type !== 'system')
    expect(nonSystem.map(turn => turn.type)).toEqual(['user', 'assistant', 'assistant', 'user'])
    expect(JSON.stringify(nonSystem[2])).toContain('A creeper is behind you!')
  })

  // A loop first gets a correction as the tool result. Only a model that repeats the call after it ends the run.
  it('corrects a repeated identical tool call, then stops a run that keeps repeating it', async () => {
    const search = vi.fn<Tool['execute']>(async () => 'same result')
    const tools: Tool[] = [{ type: 'function', function: { name: 'search', parameters: {} }, execute: search }]
    const results: unknown[] = []
    const harness = createRunHarness()
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      const [guarded] = (streamOptions?.tools ?? []) as Tool[]
      for (let index = 0; index < 4; index++)
        results.push(await guarded!.execute({ q: 'same' }, { messages: [], toolCallId: `call-${index}` }))
      await untilAborted(streamOptions)
    })

    await expect(harness.runtime.ingest('hello', { model: 'test', chatProvider: provider, tools })).rejects.toThrow('Run repeated an identical tool call')
    expect(search).toHaveBeenCalledTimes(2)
    expect(results[2]).toContain('same arguments 3 times in a row')
    expect(harness.runtime.getRuns()[0]?.state).toBe('blocked')

    // The correction alone keeps the run alive, so a model that changes course still replies.
    const corrected = createRunHarness()
    corrected.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      const [guarded] = (streamOptions?.tools ?? []) as Tool[]
      for (let index = 0; index < 3; index++)
        await guarded!.execute({ q: 'same' }, { messages: [], toolCallId: `call-${index}` })
      await guarded!.execute({ q: 'other' }, { messages: [], toolCallId: 'call-3' })
    })
    await corrected.runtime.ingest('hello', { model: 'test', chatProvider: provider, tools })
    expect(corrected.runtime.getRuns()[0]?.state).toBe('done')
  })

  // ROOT CAUSE:
  // The user turn was written before the model call and stayed after cancellation, so a requeued input appeared twice.
  it('rolls back a cancelled run so a requeued input appears once', async () => {
    const harness = createRunHarness()
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      await streamOptions?.onStreamEvent?.({ type: 'text-delta', text: 'partial' })
      await untilAborted(streamOptions)
    })

    const first = harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })
    // Cancel after the provider streams output, so the run has written its user turn and a partial reply.
    await vi.waitFor(() => expect(harness.stream).toHaveBeenCalledTimes(1))
    expect(harness.messages.some(message => message.role === 'user')).toBe(true)
    expect(harness.runtime.cancelRun(harness.runtime.getRuns()[0]!.runId, { rollback: true })).toBe(true)
    await first

    expect(harness.runtime.getRuns()[0]?.state).toBe('dropped')
    expect(harness.messages).toEqual([])
    await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })
    expect(harness.messages.filter(message => message.role === 'user')).toHaveLength(1)
  })

  it('cancels a waiting run before it starts', async () => {
    const harness = createRunHarness()
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => untilAborted(streamOptions))

    const first = harness.runtime.ingest('first', { model: 'test', chatProvider: provider })
    await vi.waitFor(() => expect(harness.runtime.getRuns()[0]?.state).toBe('working'))
    const second = harness.runtime.ingest('second', { model: 'test', chatProvider: provider })
    const waiting = harness.runtime.getRuns()[1]!

    expect(harness.runtime.cancelRun(waiting.runId)).toBe(true)
    await expect(second).rejects.toThrow('Run was cancelled before it started')
    expect(harness.runtime.getRun(waiting.runId)?.state).toBe('dropped')
    harness.runtime.cancelRun(harness.runtime.getRuns()[0]!.runId)
    await first
    expect(harness.stream).toHaveBeenCalledTimes(1)
  })

  // A provider failure is a failed run, never a quiet success.
  it('records a provider failure as a blocked run with its error', async () => {
    const harness = createRunHarness()
    harness.stream.mockRejectedValueOnce(new Error('provider unavailable'))

    await expect(harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })).rejects.toThrow('provider unavailable')
    expect(harness.runtime.getRuns()[0]).toMatchObject({ state: 'blocked', error: 'provider unavailable' })
  })

  it('narrows the session audience to the labels that the run read before writing', async () => {
    const channel = audienceFromBindings(['discord:channel:a'])
    const harness = createRunHarness({
      sessionAudience: channel,
      pool: [{ id: 'private', contextId: 'private', strategy: ContextUpdateStrategy.ReplaceSelf, text: 'owner only', createdAt: 1, audience: OWNER_AUDIENCE }],
    })

    await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    expect(harness.getSessionAudience()).toEqual(OWNER_AUDIENCE)
  })

  // P10: only the scheduler derives runs. A derived run has no voice, reads within its parent, and follows its parent's cancellation.
  describe('derived runs', () => {
    function workingRun(runs: RunTable, runId: string, parentRunId?: string, audience = OWNER_AUDIENCE) {
      runs.admit({ runId, parentRunId, salience: 0.5, envelope: { sessionId: 'session', bindings: [], outputs: ['chat:owner', 'voice'], audience } })
      runs.transition(runId, 'working')
    }

    it('runs derived work without voice or owner output, within its parent audience', async () => {
      const runs = new RunTable()
      workingRun(runs, 'parent')
      const harness = createRunHarness({ runs, runAudience: PUBLIC_AUDIENCE, sessionAudience: OWNER_AUDIENCE })

      await harness.runtime.ingest('Look at the owner screen.', { model: 'test', chatProvider: provider, derivation: { parentRunId: 'parent', source: 'recipe:look' } }, 'recipe-session')

      const child = runs.snapshot().find(run => run.runId !== 'parent')
      expect(child).toMatchObject({ parentRunId: 'parent', sessionId: 'recipe-session', state: 'done', envelope: { outputs: [], audience: OWNER_AUDIENCE } })
      expect(harness.runtime.getIntakeRecords()).toMatchObject([{ origin: 'internal', source: 'recipe:look', event: 'derived', outcome: 'admitted', reason: 'derived', runId: child?.runId }])
    })

    it('rejects derivation beyond the depth limit, over the fan-out limit, or from an ended parent', async () => {
      const runs = new RunTable()
      const chain = Array.from({ length: MAX_DERIVATION_DEPTH + 1 }, (_value, index) => `run-${index}`)
      chain.forEach((runId, index) => workingRun(runs, runId, index ? chain[index - 1] : undefined))
      workingRun(runs, 'busy-parent')
      for (let index = 0; index < MAX_DERIVED_CHILDREN; index++)
        workingRun(runs, `child-${index}`, 'busy-parent')
      runs.admit({ runId: 'ended', salience: 0.5, envelope: { sessionId: 'session', bindings: [], outputs: [], audience: OWNER_AUDIENCE } })
      runs.transition('ended', 'done')
      const harness = createRunHarness({ runs })
      const derive = (parentRunId: string) => harness.runtime.ingest('task', { model: 'test', chatProvider: provider, derivation: { parentRunId, source: 'recipe:x' } }, 'recipe-session')

      await expect(derive(chain.at(-1)!)).rejects.toThrow('Derived work exceeds the depth limit')
      await expect(derive('busy-parent')).rejects.toThrow('The parent run has too many derived runs')
      await expect(derive('ended')).rejects.toThrow('The parent run is no longer active')
      expect(harness.stream).not.toHaveBeenCalled()
    })

    it('cancels derived work when its parent is cancelled', async () => {
      const harness = createRunHarness()
      let child: Promise<unknown> | undefined
      harness.stream.mockImplementation(async (_model, _provider, _conversation, streamOptions) => {
        const runId = streamOptions?.requestCorrelation?.runId
        if (!child && runId)
          child = harness.runtime.ingest('task', { model: 'test', chatProvider: provider, derivation: { parentRunId: runId, source: 'recipe:x' } }, 'recipe-session').catch(error => error)
        await untilAborted(streamOptions)
      })

      const parent = harness.runtime.ingest('hello', { model: 'test', chatProvider: provider }).catch(error => error)
      await vi.waitFor(() => expect(harness.runtime.getRuns().filter(run => run.state === 'working')).toHaveLength(2))
      const parentRun = harness.runtime.getRuns().find(run => !run.parentRunId)!
      harness.runtime.cancelRun(parentRun.runId)
      await parent
      await child

      expect(harness.runtime.getRuns().map(run => run.state)).toEqual(['dropped', 'dropped'])
    })
  })
})
