import type { StreamOptions } from '@proj-airi/core-agent'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import { errorMessageFrom } from '@moeru/std'
import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import {
  AIRI_CHAT_APP_SURFACE_HEADER,
  AIRI_CHAT_ROUND_ID_HEADER,
  AIRI_CHAT_SESSION_ID_HEADER,
} from '../libs/analytics-headers'
import { useChatStore } from './chat'
import { useConsciousnessSettingsStore } from './modules/consciousness-settings'

vi.hoisted(() => {
  ;(globalThis as any).window = {
    location: {
      origin: 'http://localhost',
    },
  }
})

const ioTracerMocks = vi.hoisted(() => {
  const activeTurnSpan = { value: undefined as any }
  const spans: any[] = []
  const startSpanMock = vi.fn((name: string) => {
    const span = {
      name,
      addEvent: vi.fn(),
      end: vi.fn(),
      setAttribute: vi.fn(),
    }
    spans.push(span)
    return span
  })

  return {
    activeTurnSpan,
    spans,
    startSpanMock,
  }
})

const llmStreamMock = vi.fn()
const trackFirstMessageMock = vi.fn()
const chatAnalyticsMocks = vi.hoisted(() => ({
  trackAiGeneration: vi.fn(),
  trackMessageRound: vi.fn(),
  trackMessageRoundFailed: vi.fn(),
  trackMessageSent: vi.fn(),
}))
const redundantChatAnalyticsMocks = vi.hoisted(() => ({
  trackAssistantResponseCompleted: vi.fn(),
  trackChatFailed: vi.fn(),
  trackChatStarted: vi.fn(),
  trackFeatureUsed: vi.fn(),
}))
const ingestContextMessageMock = vi.fn()
const getContextsSnapshotMock = vi.fn()
const createMinecraftContextMock = vi.fn()
const persistSessionMessagesMock = vi.fn()
const forkSessionMock = vi.fn()
const ensureSessionMock = vi.fn()
const loadSessionMock = vi.fn()
const deleteSessionMock = vi.fn()
const getChatProviderInstanceMock = vi.fn()
const getToolsByNamesMock = vi.fn<(names: string[]) => Tool[]>()

const activeSessionIdRef = ref('session-1')
const activeProviderRef = ref('mock-provider')
const activeModelRef = ref('gpt-test')
const streamingMessageRef = ref<any>({ role: 'assistant', content: '', slices: [], tool_results: [] })
const sessionMessages: Record<string, any[]> = {}
let currentGeneration = 1

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: any) => store,
  }
})

vi.mock('../composables', () => ({
  getConversationAnalyticsSurface: () => 'web',
}))

vi.mock('../libs/analytics', () => ({
  getAnalytics: () => ({
    emit: (event: { name: string }, properties: unknown) => {
      switch (event.name) {
        case '$ai_generation':
          chatAnalyticsMocks.trackAiGeneration(properties)
          break
        case 'message_round':
          chatAnalyticsMocks.trackMessageRound(properties)
          break
        case 'message_round_failed':
          chatAnalyticsMocks.trackMessageRoundFailed(properties)
          break
        case 'message_sent':
          chatAnalyticsMocks.trackMessageSent(properties)
          break
        default:
          return false
      }

      return true
    },
    recordFirstMessage: trackFirstMessageMock,
  }),
}))

vi.mock('../composables/use-io-tracer', () => ({
  activeTurnSpan: ioTracerMocks.activeTurnSpan,
  startSpan: ioTracerMocks.startSpanMock,
}))

vi.mock('./chat/context-providers', () => ({
  createMinecraftContext: () => createMinecraftContextMock(),
}))

vi.mock('./chat/context-store', () => ({
  useChatContextStore: () => ({
    ingestContextMessage: ingestContextMessageMock,
    getContextsSnapshot: getContextsSnapshotMock,
  }),
}))

vi.mock('./chat/session-store', () => ({
  useChatSessionStore: () => ({
    activeSessionId: activeSessionIdRef,
    sessionMessages,
    ensureSession: (sessionId: string) => {
      ensureSessionMock(sessionId)
      sessionMessages[sessionId] ??= [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
    },
    appendSessionMessage: (sessionId: string, message: any) => {
      sessionMessages[sessionId] ??= []
      sessionMessages[sessionId].push(message)
    },
    cleanupMessages: (sessionId: string) => {
      sessionMessages[sessionId] = []
    },
    getSessionMessages: (sessionId: string) => sessionMessages[sessionId] ?? [],
    getSessionMessagesIfLoaded: (sessionId: string) => sessionMessages[sessionId],
    loadSession: loadSessionMock,
    deleteSession: deleteSessionMock,
    persistSessionMessages: persistSessionMessagesMock,
    getSessionGeneration: () => currentGeneration,
    setSessionMessages: (sessionId: string, messages: any[]) => {
      sessionMessages[sessionId] = messages
    },
    forkSession: forkSessionMock,
    // Cloud sync surface used by `chat.ts performSend`. Mocked as a no-op so
    // the orchestrator contract tests do not need a real WS / cloud mapper.
    pushMessageToCloud: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('./chat/stream-store', () => ({
  useChatStreamStore: () => ({
    streamingMessage: streamingMessageRef,
  }),
}))

vi.mock('./ai/chat-llm/llm', () => ({
  useLLM: () => ({
    stream: llmStreamMock,
  }),
}))

vi.mock('./ai/chat-llm/tools', () => ({
  useLlmToolsStore: () => ({
    getToolsByNames: (...names: string[]) => getToolsByNamesMock(names),
  }),
}))

vi.mock('./providers/provider', () => ({
  useProviderStore: () => ({
    getChatProviderInstance: getChatProviderInstanceMock,
  }),
}))

vi.mock('./ai/chat-llm/toolset-prompts', () => ({
  useLlmToolsetPromptsStore: () => ({
    activeToolsetPrompt: 'Plugin toolset guidance.',
  }),
}))

vi.mock('./modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeModel: activeModelRef,
    activeProvider: activeProviderRef,
  }),
}))

vi.mock('./modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCard: undefined,
  }),
}))

vi.mock('./modules/artistry-autonomous', () => ({
  useAutonomousArtistryStore: () => ({
    runArtistTask: vi.fn(),
  }),
}))

// The chat orchestrator instantiates the web-search store for its side effect
// (registering the web-search toolset prompt); stub it so the contract test does
// not pull in the real store's toolset-prompt watcher.
vi.mock('./modules/web-search', () => ({
  useWebSearchStore: () => ({}),
}))

const provider = {
  chat: () => ({ baseURL: 'https://example.com/' }),
} as unknown as ChatProvider

describe('chat store contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    llmStreamMock.mockReset()
    trackFirstMessageMock.mockReset()
    for (const analyticsMock of Object.values(chatAnalyticsMocks))
      analyticsMock.mockReset()
    redundantChatAnalyticsMocks.trackAssistantResponseCompleted.mockReset()
    redundantChatAnalyticsMocks.trackChatFailed.mockReset()
    redundantChatAnalyticsMocks.trackChatStarted.mockReset()
    redundantChatAnalyticsMocks.trackFeatureUsed.mockReset()
    ingestContextMessageMock.mockReset()
    getContextsSnapshotMock.mockReset()
    getContextsSnapshotMock.mockReturnValue({})
    createMinecraftContextMock.mockReset()
    createMinecraftContextMock.mockReturnValue(undefined)
    persistSessionMessagesMock.mockReset()
    forkSessionMock.mockReset()
    ensureSessionMock.mockReset()
    loadSessionMock.mockReset().mockResolvedValue(true)
    deleteSessionMock.mockReset().mockResolvedValue(undefined)
    getChatProviderInstanceMock.mockReset().mockResolvedValue(provider)
    getToolsByNamesMock.mockReset().mockImplementation(names => names.map(name => ({
      type: 'function',
      function: {
        name,
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    })))
    ioTracerMocks.activeTurnSpan.value = undefined
    ioTracerMocks.spans.length = 0
    ioTracerMocks.startSpanMock.mockClear()
    activeSessionIdRef.value = 'session-1'
    activeProviderRef.value = 'mock-provider'
    streamingMessageRef.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
    currentGeneration = 1

    for (const key of Object.keys(sessionMessages)) {
      delete sessionMessages[key]
    }

    sessionMessages['session-1'] = [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
  })

  it('resolves the provider and rebuilds prior tools inside the serializable send action', async () => {
    const resolvedToolNames: string[][] = []
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      const tools = typeof options.tools === 'function' ? await options.tools() : options.tools
      resolvedToolNames.push(tools.map((tool: Tool) => tool.function.name))
      await options.onStreamEvent({ type: 'text-delta', text: 'ok' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()
    const result = await store.send({
      sessionId: 'session-1',
      text: 'show a widget',
      tools: [{ name: 'stage_widgets' }],
    })
    await store.send({
      sessionId: 'session-1',
      text: 'continue',
    })

    expect(getChatProviderInstanceMock).toHaveBeenCalledTimes(2)
    expect(getChatProviderInstanceMock).toHaveBeenCalledWith('mock-provider', { disableThinking: true })
    expect(() => structuredClone(result)).not.toThrow()
    expect(resolvedToolNames).toEqual([
      ['stage_widgets'],
      ['stage_widgets'],
    ])
  })

  it('passes the current consciousness thinking policy to the chat provider', async () => {
    const settings = useConsciousnessSettingsStore()
    settings.disableThinking = false
    llmStreamMock.mockImplementationOnce(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: StreamOptions) => {
      await options.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()
    await store.send({ sessionId: 'session-1', text: 'reply without changing provider defaults' })

    expect(getChatProviderInstanceMock).toHaveBeenCalledWith('mock-provider', { disableThinking: false })
    settings.disableThinking = true
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('hydrates the target session before sending for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // A synchronized follower could target a session known only by metadata.
    // Reading through getSessionMessages before hydration created a fresh
    // system-only history that could overwrite the persisted conversation.
    delete sessionMessages['session-2']
    loadSessionMock.mockImplementationOnce(async () => {
      sessionMessages['session-2'] = [
        { role: 'system', content: 'persisted system prompt', createdAt: 1, id: 'system-2' },
      ]
      return true
    })
    llmStreamMock.mockImplementationOnce(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()
    await store.send({ sessionId: 'session-2', text: 'continue persisted chat' })

    expect(loadSessionMock).toHaveBeenCalledWith('session-2')
    expect(loadSessionMock.mock.invocationCallOrder[0]).toBeLessThan(ensureSessionMock.mock.invocationCallOrder[0])
    expect(sessionMessages['session-2']?.[0]).toMatchObject({
      content: 'persisted system prompt',
      id: 'system-2',
    })
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('does not create fallback history when target hydration fails for Issue #2085', async () => {
    delete sessionMessages['session-2']
    loadSessionMock.mockResolvedValueOnce(false)

    const store = useChatStore()
    await expect(
      store.send({ sessionId: 'session-2', text: 'do not overwrite history' }),
    )
      .rejects
      .toThrow('Failed to load the target chat session')

    expect(ensureSessionMock).not.toHaveBeenCalledWith('session-2')
    expect(sessionMessages['session-2']).toBeUndefined()
  })

  it('forwards one correlation identity across the action and result events', async () => {
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'ok' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()
    await store.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    const messageProperties = chatAnalyticsMocks.trackMessageSent.mock.calls[0]?.[0]
    expect(messageProperties).toMatchObject({
      conversation_id: 'session-1',
      round_id: messageProperties.message_id,
      turn_index: 1,
    })

    const correlation = {
      conversation_id: 'session-1',
      round_id: messageProperties.round_id,
      turn_index: 1,
    }
    expect(chatAnalyticsMocks.trackMessageRound).toHaveBeenCalledWith(expect.objectContaining(correlation))
  })

  it('captures custom-provider usage once and leaves official generation capture to the server', async () => {
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'ok' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
      await options.onUsage({
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        source: 'reported',
      })
    })

    const store = useChatStore()
    await store.ingest('custom turn', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(chatAnalyticsMocks.trackAiGeneration).toHaveBeenCalledWith({
      conversation_id: 'session-1',
      round_id: expect.any(String),
      provider_type: 'custom',
      provider_id: 'mock-provider',
      model_id: 'gpt-test',
      usage_source: 'reported',
      input_tokens: 12,
      output_tokens: 8,
      total_tokens: 20,
    })

    chatAnalyticsMocks.trackAiGeneration.mockClear()
    activeProviderRef.value = 'official-provider'
    await store.ingest('official turn', {
      model: 'chat-auto',
      chatProvider: provider,
    })

    expect(chatAnalyticsMocks.trackAiGeneration).not.toHaveBeenCalled()
    expect(llmStreamMock.mock.calls[1]?.[3]?.headers).toEqual({
      [AIRI_CHAT_APP_SURFACE_HEADER]: 'web',
      [AIRI_CHAT_SESSION_ID_HEADER]: 'session-1',
      [AIRI_CHAT_ROUND_ID_HEADER]: expect.any(String),
    })
  })

  it('uses turn_index on message_sent instead of a second-turn alias', async () => {
    activeProviderRef.value = 'official-provider'
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'ok' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()

    await store.ingest('first turn', {
      model: 'chat-auto',
      chatProvider: provider,
    })
    await store.ingest('second turn', {
      model: 'chat-auto',
      chatProvider: provider,
    })

    expect(chatAnalyticsMocks.trackMessageSent).toHaveBeenLastCalledWith(expect.objectContaining({
      conversation_id: 'session-1',
      round_id: expect.any(String),
      turn_index: 2,
      trigger_method: 'text_input',
      trigger_type: 'user_action',
    }))
  })

  // ROOT CAUSE:
  //
  // One successful send emitted both the canonical message/latency events
  // and four generic aliases, multiplying PostHog volume without adding a
  // distinct product decision.
  it('does not emit redundant generic chat aliases for a successful send', async () => {
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'ok' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()
    await store.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(redundantChatAnalyticsMocks.trackChatStarted).not.toHaveBeenCalled()
    expect(redundantChatAnalyticsMocks.trackAssistantResponseCompleted).not.toHaveBeenCalled()
    expect(redundantChatAnalyticsMocks.trackChatFailed).not.toHaveBeenCalled()
    expect(redundantChatAnalyticsMocks.trackFeatureUsed).not.toHaveBeenCalled()
  })

  it('forwards later-turn failures to the canonical round failure event', async () => {
    llmStreamMock.mockImplementationOnce(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'ok' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })
    llmStreamMock.mockRejectedValueOnce(new Error('later turn rejected'))

    const store = useChatStore()
    await store.ingest('first turn', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    await expect(store.ingest('second turn', {
      model: 'gpt-test',
      chatProvider: provider,
    })).rejects.toThrow('later turn rejected')

    expect(chatAnalyticsMocks.trackMessageRoundFailed).toHaveBeenCalledWith({
      conversation_id: 'session-1',
      error_code: 'llm_response_failed',
      failure_stage: 'llm_response',
      model_id: 'gpt-test',
      provider_id: 'mock-provider',
      round_id: expect.any(String),
      source: 'text',
      turn_index: 2,
      trigger_method: 'text_input',
      trigger_type: 'user_flow_result',
    })
  })

  it('keeps hook order and composes context prompt after system message', async () => {
    const contextsSnapshot = {
      'system:weather': [
        {
          id: 'weather',
          contextId: 'system:weather',
          source: 'ReplaceSelf',
          text: 'sunny',
          createdAt: 456,
        },
      ],
    }

    getContextsSnapshotMock.mockReturnValue(contextsSnapshot)

    let composedMessages: Message[] = []
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      composedMessages = messages
      expect(options.waitForTools).toBe(true)
      expect(options.captureToolErrors).toBeUndefined()

      await options.onStreamEvent({ type: 'text-delta', text: 'hello' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()
    const hookOrder: string[] = []

    store.onBeforeMessageComposed(async () => {
      hookOrder.push('before-compose')
    })
    store.onAfterMessageComposed(async () => {
      hookOrder.push('after-compose')
    })
    store.onBeforeSend(async () => {
      hookOrder.push('before-send')
    })
    store.onTokenLiteral(async () => {
      hookOrder.push('token-literal')
    })
    store.onStreamEnd(async () => {
      hookOrder.push('stream-end')
    })
    store.onAssistantResponseEnd(async () => {
      hookOrder.push('assistant-end')
    })
    store.onAfterSend(async () => {
      hookOrder.push('after-send')
    })
    store.onAssistantMessage(async () => {
      hookOrder.push('assistant-message')
    })
    store.onChatTurnComplete(async () => {
      hookOrder.push('turn-complete')
    })

    await store.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(store.sending).toBe(false)
    expect(trackFirstMessageMock).toHaveBeenCalledOnce()
    // Datetime is no longer pushed through ingestContextMessage; it is now
    // applied at message-assembly time as a system-prompt anchor + per-message
    // [HH:MM] prefix. ingestContextMessage should still be called for other
    // context providers (e.g. minecraft) when they are configured, but not
    // for datetime in this test (minecraft is mocked to return undefined).
    expect(ingestContextMessageMock).not.toHaveBeenCalled()
    expect(persistSessionMessagesMock).not.toHaveBeenCalled()
    expect(hookOrder).toEqual([
      'before-compose',
      'after-compose',
      'before-send',
      'token-literal',
      'stream-end',
      'assistant-end',
      'after-send',
      'assistant-message',
      'turn-complete',
    ])

    expect(composedMessages).toHaveLength(2)
    expect(composedMessages[0]).toMatchObject({ role: 'system' })
    expect(composedMessages[1]).toMatchObject({ role: 'user' })
    expect(ioTracerMocks.startSpanMock).toHaveBeenCalledWith(
      IOSpanNames.LLMInference,
      expect.anything(),
      expect.objectContaining({
        [IOAttributes.LLMInputMessageCount]: 2,
        [IOAttributes.LLMInputUserMessageCount]: 1,
        [IOAttributes.TurnId]: expect.any(String),
      }),
    )
    const llmSpan = ioTracerMocks.spans.find(span => span.name === IOSpanNames.LLMInference)
    expect(llmSpan.setAttribute).toHaveBeenCalledWith(IOAttributes.LLMInputMessageRoles, ['system', 'user'])
    expect(llmSpan.setAttribute).toHaveBeenCalledWith(IOAttributes.LLMOutputChunkCount, 1)
    expect(llmSpan.setAttribute).toHaveBeenCalledWith(IOAttributes.LLMOutputChunkLengths, [5])
    expect(llmSpan.setAttribute).toHaveBeenCalledWith(IOAttributes.LLMTextLength, 5)

    // System message stays untouched: keeping it 100% static is what makes
    // the prefix permanently KV-cache friendly across turns and across day
    // boundaries (the date now lives inside per-message timestamp prefixes
    // instead of a system anchor).
    const systemContent = (composedMessages[0] as any).content
    const systemText = typeof systemContent === 'string' ? systemContent : systemContent.map((p: any) => p.text).join('')
    expect(systemText).toContain('system prompt')
    expect(systemText).toContain('Plugin toolset guidance.')

    // The user turn is prefixed with [YYYY-MM-DD HH:MM]. Both historic and
    // current turns share the same shape so prefix-cache stays valid when a
    // "current" turn becomes "historic" on the next send. Side-channel context
    // (weather) is appended as a separate text part so providers don't see
    // consecutive same-role messages.
    const userMessageContent = (composedMessages[1] as any).content
    expect(userMessageContent[0].text).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] hello from user$/)

    const syntheticContextText = userMessageContent[1].text
    expect(syntheticContextText).not.toContain('<context>')
    expect(syntheticContextText).not.toContain('<module ')
    expect(syntheticContextText).toContain('[Context]')
    expect(syntheticContextText).toContain('- system:weather: sunny')
  })

  // ROOT CAUSE:
  //
  // Muted speech dispatches special tokens without opening a TTS session.
  // Without a turn id in the hook context, an unhandled plugin CALL cannot be
  // correlated and relayed to a handler in another Electron renderer.
  it('emits special tokens with a stable turn id for cross-renderer routing', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    llmStreamMock.mockImplementationOnce(async (_model, _provider, _messages, options) => {
      await options.onStreamEvent({ type: 'text-delta', text: '<|CALL ["plugin.action"]|>' })
    })

    const store = useChatStore()
    const specialHook = vi.fn()
    store.onTokenSpecial(specialHook)

    await store.ingest('trigger special', {
      chatProvider: provider,
      model: 'mock-model',
    })

    expect(specialHook).toHaveBeenCalledWith('<|CALL ["plugin.action"]|>', expect.objectContaining({
      contexts: {},
      turnId: expect.any(String),
    }))
    expect(specialHook.mock.calls[0]?.[1].turnId.length).toBeGreaterThan(0)
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743261505
  it('preserves a synchronized sending snapshot without replaying it through the follower runtime for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Applying `sending: true` invoked the follower's idle runtime, whose
    // derived state cleared the synchronized stream payload and could target
    // that follower's unrelated local selection.
    const store = useChatStore()
    store.$patch({
      sending: true,
      activeSendSessionId: 'session-b',
      activeStreamingMessage: {
        role: 'assistant',
        content: 'authority stream',
        slices: [],
        tool_results: [],
      },
    })
    await nextTick()

    expect(store.sending).toBe(true)
    expect(store.activeSendSessionId).toBe('session-b')
    expect(store.activeStreamingMessage?.content).toBe('authority stream')
  })

  it('does not end the owned IO turn span when external sending mirror is cleared mid-send', async () => {
    let releaseStream: (() => void) | undefined
    llmStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseStream = resolve
      })
    })

    const store = useChatStore()
    const send = store.ingest('hold stream', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(store.sending).toBe(true)
    })
    await vi.waitFor(() => {
      expect(ioTracerMocks.spans.some(span => span.name === IOSpanNames.InteractionTurn)).toBe(true)
    })

    const turnSpan = ioTracerMocks.spans.find(span => span.name === IOSpanNames.InteractionTurn)
    if (!turnSpan)
      throw new Error('Expected the chat facade to create an interaction turn span')

    store.sending = false
    await nextTick()

    expect(turnSpan.end).not.toHaveBeenCalled()

    releaseStream?.()
    await send

    expect(turnSpan.end).toHaveBeenCalledTimes(1)
    expect(ioTracerMocks.activeTurnSpan.value).toBeUndefined()
  })

  it('ingests runtime context providers before composing prompt snapshots', async () => {
    const minecraftContext = {
      id: 'minecraft-context',
      contextId: 'system:minecraft',
      strategy: 'replace-self',
      source: 'minecraft',
      text: 'player is near spawn',
      createdAt: 123,
    }
    let composedMessages: Message[] = []

    createMinecraftContextMock.mockReturnValue(minecraftContext)
    getContextsSnapshotMock.mockReturnValue({
      'system:minecraft': [minecraftContext],
    })
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      composedMessages = messages
      await options.onStreamEvent({ type: 'text-delta', text: 'minecraft reply' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()

    await store.ingest('where am I?', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(ingestContextMessageMock).toHaveBeenCalledTimes(1)
    expect(ingestContextMessageMock).toHaveBeenCalledWith(minecraftContext)
    expect(ingestContextMessageMock.mock.invocationCallOrder[0]).toBeLessThan(
      getContextsSnapshotMock.mock.invocationCallOrder[0],
    )
    const minecraftMessageContent = composedMessages[1]?.content
    if (!Array.isArray(minecraftMessageContent))
      throw new TypeError('Expected composed user message content to be an array')
    expect(minecraftMessageContent[1]).toMatchObject({
      text: expect.stringContaining('- system:minecraft: player is near spawn'),
    })
  })

  it('rejects cancelled queued sends before they start', async () => {
    let releaseFirstSend: (() => void) | undefined
    llmStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const store = useChatStore()
    const firstSend = store.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = store.ingest('cancel me', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(llmStreamMock).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(store.pendingQueuedSendCount).toBe(1)
    })
    store.cancelPendingSends('session-1')
    releaseFirstSend?.()

    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    await firstSend
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3742939573
  it('does not recreate a deleted session when queued work is cancelled for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Cancelling queued work rejects the public send action. Its generic error
    // handler used to recreate a system-plus-error history after deletion,
    // leaving a ghost conversation that no longer had session metadata.
    let releaseFirstSend: (() => void) | undefined
    llmStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })
    deleteSessionMock.mockImplementationOnce(async () => {
      currentGeneration += 1
      delete sessionMessages['session-1']
    })

    const store = useChatStore()
    const firstSend = store.send({
      sessionId: 'session-1',
      text: 'active turn',
    })
    const activeOutcome = firstSend.then(
      () => 'resolved',
      error => errorMessageFrom(error) ?? 'unknown error',
    )
    const queuedSend = store.send({
      sessionId: 'session-1',
      text: 'must be cancelled',
    })
    const queuedOutcome = queuedSend.then(
      () => 'resolved',
      error => errorMessageFrom(error) ?? 'unknown error',
    )

    await vi.waitFor(() => {
      expect(llmStreamMock).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(store.pendingQueuedSendCount).toBe(1)
    })
    await store.deleteSession('session-1')

    expect(deleteSessionMock).toHaveBeenCalledWith('session-1')
    expect(await queuedOutcome).toBe('Chat session was reset before send could start')
    expect(sessionMessages['session-1']).toBeUndefined()

    releaseFirstSend?.()
    expect(await activeOutcome).toBe('Chat session was removed before send completed')
    expect(llmStreamMock).toHaveBeenCalledTimes(1)
    expect(sessionMessages['session-1']).toBeUndefined()
  })

  it('mirrors pending queued send snapshots from the core runtime', async () => {
    let releaseFirstSend: (() => void) | undefined
    llmStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const queuedMessage = 'queued-message-'.repeat(12)
    const store = useChatStore()
    const firstSend = store.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = store.ingest(queuedMessage, {
      model: 'gpt-test',
      chatProvider: provider,
      attachments: [
        {
          type: 'image',
          data: 'aW1hZ2U=',
          mimeType: 'image/png',
        },
      ],
      input: {
        type: 'input:text',
        data: {
          text: 'queued input',
        },
      },
    })

    await vi.waitFor(() => {
      expect(llmStreamMock).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(store.pendingQueuedSendCount).toBe(1)
    })

    expect(store.getPendingQueuedSendSnapshot()).toEqual([
      {
        sessionId: 'session-1',
        generation: 1,
        cancelled: false,
        messagePreview: queuedMessage.slice(0, 120),
        hasAttachments: true,
        inputType: 'input:text',
      },
    ])

    store.cancelPendingSends('session-1')
    releaseFirstSend?.()

    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    await firstSend
  })

  it('rejects stale generation sends before performSend starts', async () => {
    let releaseFirstSend: (() => void) | undefined
    llmStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const store = useChatStore()
    const firstSend = store.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = store.ingest('stale request', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(llmStreamMock).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(store.pendingQueuedSendCount).toBe(1)
    })
    currentGeneration = 2
    releaseFirstSend?.()

    await firstSend
    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    expect(llmStreamMock).toHaveBeenCalledTimes(1)
  })

  it('uses the forked session id and keeps the chat store contract keys', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    forkSessionMock.mockResolvedValue('session-forked')
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'fork-reply' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatStore()

    expect(store.$id).toBe('chat')
    expect(typeof store.send).toBe('function')
    expect(typeof store.ingest).toBe('function')
    expect(typeof store.ingestOnFork).toBe('function')
    expect(typeof store.cancelPendingSends).toBe('function')
    expect(typeof store.onBeforeSend).toBe('function')
    expect(typeof store.emitBeforeSendHooks).toBe('function')

    await store.ingestOnFork('fork me', {
      model: 'gpt-test',
      chatProvider: provider,
    }, {
      fromSessionId: 'session-1',
      atIndex: 3,
      reason: 'retry',
      hidden: true,
    })

    expect(forkSessionMock).toHaveBeenCalledWith({
      fromSessionId: 'session-1',
      atIndex: 3,
      reason: 'retry',
      hidden: true,
    })
    expect(ensureSessionMock).toHaveBeenCalledWith('session-forked')
  })
})
