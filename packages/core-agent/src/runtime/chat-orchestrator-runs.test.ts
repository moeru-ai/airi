import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { AssistantTurn, Conversation } from '../messages/types'
import type { ChatHistoryItem, ContextMessage } from '../types/chat'
import type { StreamOptions } from '../types/llm'
import type { Audience } from './audience'
import type { ChatOrchestratorRuntimeDeps, ChatOrchestratorRuntimeLimits } from './chat-orchestrator-runtime'
import type { AgentRun } from './run-table'

import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { describe, expect, it, vi } from 'vitest'

import { audienceFromBindings, intersectAudiences, OWNER_AUDIENCE } from './audience'
import { createChatOrchestratorRuntime } from './chat-orchestrator-runtime'

const provider: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', webSearch: false, config: { model, baseURL: 'https://example.com/' } }),
}

function createRunHarness(options: { sessionAudience?: Audience, runAudience?: Audience, pool?: ContextMessage[], onRunChange?: (run: AgentRun) => void, limits?: Partial<ChatOrchestratorRuntimeLimits>, decideIntake?: ChatOrchestratorRuntimeDeps['decideIntake'] } = {}) {
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
    createEnvelope: () => ({ bindings: [], outputs: ['chat:owner'], audience: options.runAudience ?? OWNER_AUDIENCE, personaId: 'airi' }),
    onRunChange: options.onRunChange ?? (run => runChanges.push(run)),
    decideIntake: options.decideIntake,
  })
  return { runtime, messages, runChanges, correlations, snapshot, stream, getSessionAudience: () => sessionAudience }
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

  it('admits direct owner input without waiting for the intake policy', async () => {
    const decideIntake = vi.fn(() => ({ outcome: 'ignored' as const, reason: 'never', decidedBy: 'rule' as const }))
    const harness = createRunHarness({ decideIntake })

    const result = await harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })

    expect(decideIntake).not.toHaveBeenCalled()
    expect(result).toMatchObject({ outcome: 'admitted', runId: harness.runtime.getRuns()[0]?.runId })
    expect(harness.runtime.getIntakeRecords()).toMatchObject([{ outcome: 'admitted', reason: 'direct-input', decidedBy: 'rule', runId: result.runId }])
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

  it('stops a run that repeats an identical tool call', async () => {
    const harness = createRunHarness()
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      for (let index = 0; index < 3; index++)
        await streamOptions?.onStreamEvent?.({ type: 'tool-call', toolCallId: `call-${index}`, toolCallType: 'function', toolName: 'search', args: '{"q":"same"}' })
      await untilAborted(streamOptions)
    })

    await expect(harness.runtime.ingest('hello', { model: 'test', chatProvider: provider })).rejects.toThrow('Run repeated an identical tool call')
    expect(harness.runtime.getRuns()[0]?.state).toBe('blocked')
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
})
