import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { Conversation } from '../messages/types'
import type { ChatHistoryItem, ChatStreamEventContext } from '../types/chat'
import type { StreamOptions } from '../types/llm'
import type { ChatOrchestratorRuntimeDeps } from './chat-orchestrator-runtime'

import { describe, expect, it, vi } from 'vitest'

import { createChatOrchestratorRuntime } from './chat-orchestrator-runtime'

const provider: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
}

type Stream = (model: string, chatProvider: GenerationProvider, conversation: Conversation, options?: StreamOptions) => Promise<void>

function createHarness(options: Partial<Pick<ChatOrchestratorRuntimeDeps, 'getSystemPrompt'>> = {}) {
  const messages: Record<string, ChatHistoryItem[]> = {}
  const stream = vi.fn<Stream>(async (_model, _provider, _conversation, streamOptions) => {
    await streamOptions?.onStreamEvent?.({ type: 'text-delta', text: 'reply' })
    await streamOptions?.onStreamEvent?.({ type: 'finish' })
  })
  const runtime = createChatOrchestratorRuntime({
    session: {
      ensureSession: (sessionId) => {
        messages[sessionId] ??= []
      },
      getSessionMessages: sessionId => messages[sessionId] ?? [],
      appendSessionMessage: (sessionId, message) => {
        (messages[sessionId] ??= []).push(message)
      },
      commitUserMessage: async (sessionId, message) => {
        (messages[sessionId] ??= []).push(message)
        return { status: 'inserted', messageId: message.id }
      },
      getSessionGeneration: () => 1,
    },
    context: { ingest: vi.fn(), snapshot: () => ({}) },
    foregroundStream: { patch: vi.fn(), reset: vi.fn() },
    llm: { stream },
    getActiveSessionId: () => 'session-1',
    getActiveProvider: () => 'mock-provider',
    ...options,
  })
  const prompt = (call = 0) => JSON.stringify(stream.mock.calls[call]?.[2])
  return { runtime, messages, stream, prompt }
}

describe('chat orchestrator host options', () => {
  // A notice tells the conversation about earlier work. History keeps it marked as a notice, never as owner speech.
  it('stores a notice with its source, marks it in every prompt, and marks the reply as proactive', async () => {
    const harness = createHarness()

    await harness.runtime.ingest('The task finished.', { model: 'test', chatProvider: provider, notice: { source: 'recipe:Research' } })
    await harness.runtime.ingest('what did it find?', { model: 'test', chatProvider: provider })

    expect(harness.messages['session-1']?.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(harness.messages['session-1']?.[0]).toMatchObject({ content: 'The task finished.', notice: { source: 'recipe:Research' } })
    expect(harness.messages['session-1']?.[1]).toMatchObject({ proactive: { source: 'recipe:Research' } })
    expect(harness.prompt(0)).toContain('[Notice from recipe:Research, not a message from the owner.]')
    expect(harness.prompt(0)).toContain('Speak about this notice only if it fits now')
    // A later turn still knows the result, and only the request that delivered the notice offers silence.
    expect(harness.prompt(1)).toContain('[Notice from recipe:Research, not a message from the owner.]')
    expect(harness.prompt(1)).not.toContain('Speak about this notice only if it fits now')
  })

  it('leaves stored system messages out of the prompt, and reads identity per session', async () => {
    const harness = createHarness({ getSystemPrompt: sessionId => `identity of ${sessionId}` })
    harness.messages['session-1'] = [
      { role: 'system', content: 'stored identity', id: 'system' },
    ]

    await harness.runtime.ingest('main question', { model: 'test', chatProvider: provider })

    expect(harness.prompt()).toContain('identity of session-1')
    expect(harness.prompt()).not.toContain('stored identity')
    expect(harness.prompt()).toContain('main question')
  })

  // Like a slash command, an invoked skill joins the owner's message and stays there for later requests.
  it('stores invoked skills with the user message and keeps their steps in later prompts', async () => {
    const harness = createHarness()

    await harness.runtime.ingest('/focus plan my day', { model: 'test', chatProvider: provider, skills: [{ name: 'Focus', instructions: 'Give one next step.' }] })
    await harness.runtime.ingest('and then?', { model: 'test', chatProvider: provider })

    expect(harness.messages['session-1']?.[0]).toMatchObject({ role: 'user', content: '/focus plan my day', skills: [{ name: 'Focus', instructions: 'Give one next step.' }] })
    expect(harness.prompt(0)).toContain('Give one next step.')
    expect(harness.prompt(1)).toContain('[The owner used the skill \\"Focus\\".')
  })

  it('stores no reply for an empty answer, but keeps a reply that only called a tool', async () => {
    const harness = createHarness()
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      await streamOptions?.onStreamEvent?.({ type: 'finish' })
    })
    harness.stream.mockImplementationOnce(async (_model, _provider, _conversation, streamOptions) => {
      await streamOptions?.onStreamEvent?.({ type: 'tool-call', toolCallId: 'look', toolCallType: 'function', toolName: 'look', args: '{}' })
      await streamOptions?.onStreamEvent?.({ type: 'finish' })
    })

    await harness.runtime.ingest('first', { model: 'test', chatProvider: provider })
    await harness.runtime.ingest('second', { model: 'test', chatProvider: provider })

    expect(harness.messages['session-1']?.map(message => message.role)).toEqual(['user', 'user', 'assistant'])
  })

  // The owner hears local replies. A scene reply returns as text, and background work stays silent.
  it('speaks only the replies to the owner', async () => {
    const harness = createHarness()
    const speaks: ChatStreamEventContext['speaks'][] = []
    harness.runtime.hooks.onBeforeSend(async (_message, context) => {
      speaks.push(context.speaks)
    })

    await harness.runtime.ingest('local', { model: 'test', chatProvider: provider })
    await harness.runtime.ingest('scene', { model: 'test', chatProvider: provider, scene: true }, 'scene-session')
    await harness.runtime.ingest('task', { model: 'test', chatProvider: provider, background: true }, 'recipe-session')

    expect(speaks).toEqual([true, false, false])
  })
})
