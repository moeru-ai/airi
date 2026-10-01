import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { AssistantTurn, Conversation } from '../messages/types'
import type { ChatHistoryItem, ContextMessage } from '../types/chat'
import type { StreamOptions } from '../types/llm'
import type { Audience } from './audience'
import type { AgentRun } from './run-table'

import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { describe, expect, it, vi } from 'vitest'

import { audienceFromBindings, intersectAudiences, OWNER_AUDIENCE } from './audience'
import { createChatOrchestratorRuntime } from './chat-orchestrator-runtime'

const provider: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', webSearch: false, config: { model, baseURL: 'https://example.com/' } }),
}

function createRunHarness(options: { sessionAudience?: Audience, runAudience?: Audience, pool?: ContextMessage[], onRunChange?: (run: AgentRun) => void } = {}) {
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
    },
    context: { ingest: vi.fn(), snapshot },
    foregroundStream: { patch: vi.fn(), reset: vi.fn() },
    llm: { stream },
    getActiveSessionId: () => 'session',
    getActiveProvider: () => 'mock',
    createEnvelope: () => ({ bindings: [], outputs: ['chat:owner'], audience: options.runAudience ?? OWNER_AUDIENCE, personaId: 'airi' }),
    onRunChange: options.onRunChange ?? (run => runChanges.push(run)),
  })
  return { runtime, messages, runChanges, correlations, snapshot, stream, getSessionAudience: () => sessionAudience }
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
