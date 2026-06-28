import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { IOSpanNames } from '@proj-airi/stage-shared'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useChatOrchestratorStore } from './chat'
import { usePatternDisruptorStore } from './pattern-disruptor'

vi.hoisted(() => {
  // deepsource:issue=JS-0323
  ;(globalThis as Record<string, unknown>).window = {
    location: {
      origin: 'http://localhost',
    },
  }
})

const ioTracerMocks = vi.hoisted(() => {
  const activeTurnSpan = { value: undefined as unknown }
  const spans: Record<string, unknown>[] = []
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
const ingestContextMessageMock = vi.fn()
const getContextsSnapshotMock = vi.fn()
const createMinecraftContextMock = vi.fn()
const persistSessionMessagesMock = vi.fn()
const forkSessionMock = vi.fn()
const ensureSessionMock = vi.fn()

const activeSessionIdRef = ref('session-1')
const activeCardIdRef = ref('card-1')
const activeCardRef = ref<unknown>(undefined)
const streamingMessageRef = ref<{ role: string; content: string; slices: unknown[]; tool_results: unknown[] }>({
  role: 'assistant',
  content: '',
  slices: [],
  tool_results: [],
})
const sessionMessages: Record<string, unknown[]> = {}
let currentGeneration = 1

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: unknown) => store,
  }
})

vi.mock('../composables', () => ({
  useAnalytics: () => ({
    trackFirstMessage: trackFirstMessageMock,
    trackMessageSendStarted: vi.fn(),
    trackLlmRequestStarted: vi.fn(),
    trackLlmFirstToken: vi.fn(),
    trackAssistantResponseRendered: vi.fn(),
    trackMessageRound: vi.fn(),
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
    appendSessionMessage: (sessionId: string, message: unknown) => {
      sessionMessages[sessionId] ??= []
      sessionMessages[sessionId].push(message)
    },
    getSessionMessages: (sessionId: string) => sessionMessages[sessionId] ?? [],
    persistSessionMessages: persistSessionMessagesMock,
    getSessionGeneration: () => currentGeneration,
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

vi.mock('./llm', () => ({
  useLLM: () => ({
    stream: llmStreamMock,
  }),
}))

vi.mock('./llm-toolset-prompts', () => ({
  useLlmToolsetPromptsStore: () => ({
    activeToolsetPrompt: 'Plugin toolset guidance.',
  }),
}))

vi.mock('./modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: ref('mock-provider'),
  }),
}))

vi.mock('./modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCardId: activeCardIdRef,
    activeCard: activeCardRef.value,
  }),
}))

vi.mock('./modules/artistry-autonomous', () => ({
  useAutonomousArtistryStore: () => ({
    runArtistTask: vi.fn(),
  }),
}))

const provider = {
  chat: () => ({ baseURL: 'https://example.com/' }),
} as unknown as ChatProvider

describe('chat orchestrator contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    llmStreamMock.mockReset()
    trackFirstMessageMock.mockReset()
    ingestContextMessageMock.mockReset()
    getContextsSnapshotMock.mockReset()
    getContextsSnapshotMock.mockReturnValue({})
    createMinecraftContextMock.mockReset()
    createMinecraftContextMock.mockReturnValue(undefined)
    persistSessionMessagesMock.mockReset()
    forkSessionMock.mockReset()
    ensureSessionMock.mockReset()
    ioTracerMocks.activeTurnSpan.value = undefined
    ioTracerMocks.spans.length = 0
    ioTracerMocks.startSpanMock.mockClear()
    activeSessionIdRef.value = 'session-1'
    activeCardIdRef.value = 'card-1'
    activeCardRef.value = undefined
    streamingMessageRef.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
    currentGeneration = 1

    for (const key of Object.keys(sessionMessages)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete sessionMessages[key]
    }

    sessionMessages['session-1'] = [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
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
    llmStreamMock.mockImplementation(
      async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: Record<string, unknown>) => {
        composedMessages = messages
        expect(options.waitForTools).toBe(true)
        expect(options.captureToolErrors).toBe(true)

        await (options.onStreamEvent as (event: unknown) => Promise<void>)({ type: 'text-delta', text: 'hello' })
        await (options.onStreamEvent as (event: unknown) => Promise<void>)({ type: 'finish', finishReason: 'stop' })
      },
    )

    const store = useChatOrchestratorStore()
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
    expect(trackFirstMessageMock).toHaveBeenCalledTimes(1)
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

    // System message stays untouched: keeping it 100% static is what makes
    // the prefix permanently KV-cache friendly across turns and across day
    // boundaries (the date now lives inside per-message timestamp prefixes
    // instead of a system anchor).
    const systemContent = (composedMessages[0] as Message & { content: unknown }).content
    const systemText =
      typeof systemContent === 'string'
        ? systemContent
        : (systemContent as { text: string }[]).map((p) => p.text).join('')
    expect(systemText).toContain('system prompt')
    expect(systemText).toContain('Plugin toolset guidance.')

    // The user turn is prefixed with [YYYY-MM-DD HH:MM]. Both historic and
    // current turns share the same shape so prefix-cache stays valid when a
    // "current" turn becomes "historic" on the next send. Side-channel context
    // (weather) is appended as a separate text part so providers don't see
    // consecutive same-role messages.
    const userMessageContent = (composedMessages[1] as Message & { content: { text: string }[] }).content
    expect(userMessageContent[0].text).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] hello from user$/)

    const syntheticContextText = userMessageContent[1].text
    expect(syntheticContextText).not.toContain('<context>')
    expect(syntheticContextText).not.toContain('<module ')
    expect(syntheticContextText).toContain('[Context]')
    expect(syntheticContextText).toContain('- system:weather: sunny')
  })

  it('appends pattern disruptor guidance when the active card enables it', async () => {
    activeCardRef.value = {
      extensions: {
        airi: {
          modules: {
            patternDisruptor: {
              enabled: true,
              randomWords: {
                enabled: true,
                wordCount: 1,
                customPrompt: 'Pattern words: {{words}}',
              },
              synonyms: {
                enabled: false,
              },
            },
          },
        },
      },
    }

    let composedMessages: Message[] = []
    llmStreamMock.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options.onStreamEvent({ type: 'text-delta', text: 'hello' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()
    await store.ingest('the garden feels quiet tonight', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    const systemContent = (composedMessages[0] as Message & { content: unknown }).content
    const systemText =
      typeof systemContent === 'string'
        ? systemContent
        : (systemContent as { text: string }[]).map((p) => p.text).join('')
    expect(systemText).toContain('Plugin toolset guidance.')
    expect(systemText).toContain('Pattern words:')
  })

  it('resets pattern disruptor state when the active session or card changes', async () => {
    useChatOrchestratorStore()
    const patternDisruptorStore = usePatternDisruptorStore()
    const prepareTurn = () => {
      patternDisruptorStore.prepareForUserTurn({
        settings: {
          enabled: true,
          randomWords: {
            enabled: true,
            wordCount: 1,
            customPrompt: 'Pattern words: {{ words }}',
          },
          synonyms: { enabled: false },
        },
        messageText: 'the garden feels quiet tonight',
        sessionMessages: [],
      })
    }

    prepareTurn()
    expect(patternDisruptorStore.activePromptSupplement).toContain('Pattern words:')
    expect(patternDisruptorStore.wordHistory).toHaveLength(1)

    activeSessionIdRef.value = 'session-2'
    await nextTick()

    expect(patternDisruptorStore.activePromptSupplement).toBe('')
    expect(patternDisruptorStore.wordHistory).toEqual([])

    prepareTurn()
    expect(patternDisruptorStore.activePromptSupplement).toContain('Pattern words:')
    expect(patternDisruptorStore.wordHistory).toHaveLength(1)

    activeCardIdRef.value = 'card-2'
    await nextTick()

    expect(patternDisruptorStore.activePromptSupplement).toBe('')
    expect(patternDisruptorStore.wordHistory).toEqual([])
  })

  it('emits special tokens for speech timeline handling during chat streaming', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    llmStreamMock.mockImplementationOnce(async (_model, _provider, _messages, options) => {
      await options.onStreamEvent({ type: 'text-delta', text: '<|CALL ["plugin.action"]|>' })
    })

    const store = useChatOrchestratorStore()
    const specialHook = vi.fn()
    store.onTokenSpecial(specialHook)

    await store.ingest('trigger special', {
      chatProvider: provider,
      model: 'mock-model',
    })

    expect(specialHook).toHaveBeenCalledWith(
      '<|CALL ["plugin.action"]|>',
      expect.objectContaining({
        contexts: {},
      }),
    )
  })

  /**
   * @example
   * store.sending = true
   * await nextTick()
   * expect(store.sending).toBe(true)
   */
  it('keeps sending writable for context bridge and chat sync consumers', async () => {
    const store = useChatOrchestratorStore()

    expect(store.sending).toBe(false)

    store.sending = true
    await nextTick()
    expect(store.sending).toBe(true)

    store.sending = false
    await nextTick()
    expect(store.sending).toBe(false)
  })

  /**
   * @example
   * store.sending = false while a local runtime send is still streaming.
   */
  it('does not end the owned IO turn span when external sending mirror is cleared mid-send', async () => {
    let releaseStream: (() => void) | undefined
    llmStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseStream = resolve
      })
    })

    const store = useChatOrchestratorStore()
    const send = store.ingest('hold stream', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(store.sending).toBe(true)
    })
    await vi.waitFor(() => {
      expect(ioTracerMocks.spans.some((span) => span.name === IOSpanNames.InteractionTurn)).toBe(true)
    })

    const turnSpan = ioTracerMocks.spans.find((span) => span.name === IOSpanNames.InteractionTurn)
    if (!turnSpan) throw new Error('Expected the chat facade to create an interaction turn span')

    store.sending = false
    await nextTick()

    expect(turnSpan.end).not.toHaveBeenCalled()

    releaseStream?.()
    await send

    expect(turnSpan.end).toHaveBeenCalledTimes(1)
    expect(ioTracerMocks.activeTurnSpan.value).toBeUndefined()
  })

  /**
   * @example
   * createMinecraftContext() returns a runtime context update.
   * The facade passes it into the core runtime before prompt snapshots are read.
   */
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
    llmStreamMock.mockImplementation(
      async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: Record<string, unknown>) => {
        composedMessages = messages
        await (options.onStreamEvent as (event: unknown) => Promise<void>)({
          type: 'text-delta',
          text: 'minecraft reply',
        })
        await (options.onStreamEvent as (event: unknown) => Promise<void>)({ type: 'finish', finishReason: 'stop' })
      },
    )

    const store = useChatOrchestratorStore()

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

    const store = useChatOrchestratorStore()
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

  /**
   * @example
   * store.getPendingQueuedSendSnapshot()
   * // => [{ sessionId, generation, cancelled, messagePreview, hasAttachments, inputType }]
   */
  it('mirrors pending queued send snapshots from the core runtime', async () => {
    let releaseFirstSend: (() => void) | undefined
    llmStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const queuedMessage = 'queued-message-'.repeat(12)
    const store = useChatOrchestratorStore()
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

    const store = useChatOrchestratorStore()
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

  it('uses forked session id in ingestOnFork and keeps public store contract keys', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    forkSessionMock.mockResolvedValue('session-forked')
    llmStreamMock.mockImplementation(
      async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: Record<string, unknown>) => {
        await (options.onStreamEvent as (event: unknown) => Promise<void>)({ type: 'text-delta', text: 'fork-reply' })
        await (options.onStreamEvent as (event: unknown) => Promise<void>)({ type: 'finish', finishReason: 'stop' })
      },
    )

    const store = useChatOrchestratorStore()

    expect(store.$id).toBe('chat-orchestrator')
    expect(typeof store.ingest).toBe('function')
    expect(typeof store.ingestOnFork).toBe('function')
    expect(typeof store.cancelPendingSends).toBe('function')
    expect(typeof store.onBeforeSend).toBe('function')
    expect(typeof store.emitBeforeSendHooks).toBe('function')

    await store.ingestOnFork(
      'fork me',
      {
        model: 'gpt-test',
        chatProvider: provider,
      },
      {
        fromSessionId: 'session-1',
        atIndex: 3,
        reason: 'retry',
        hidden: true,
      },
    )

    expect(forkSessionMock).toHaveBeenCalledWith({
      fromSessionId: 'session-1',
      atIndex: 3,
      reason: 'retry',
      hidden: true,
    })
    expect(ensureSessionMock).toHaveBeenCalledWith('session-forked')
  })
})
