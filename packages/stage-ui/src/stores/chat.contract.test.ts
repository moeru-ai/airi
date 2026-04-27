import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatOrchestratorStore } from './chat'

const llmStreamMock = vi.fn()
const trackFirstMessageMock = vi.fn()
const ingestContextMessageMock = vi.fn()
const getContextsSnapshotMock = vi.fn()
const createMinecraftContextMock = vi.fn()
const persistSessionMessagesMock = vi.fn()
const forkSessionMock = vi.fn()
const ensureSessionMock = vi.fn()
const parserConsumeMock = vi.fn()
const parserEndMock = vi.fn()
const readPromptContextMock = vi.fn()
const appendTurnMock = vi.fn()
const createMemoryGatewayMock = vi.hoisted(() => vi.fn())

const activeSessionIdRef = ref('session-1')
const activeCardIdRef = ref('character-1')
const userIdRef = ref('user-1')
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

vi.mock('@proj-airi/stream-kit', () => ({
  createQueue: ({ handlers }: { handlers: Array<(ctx: { data: any }) => Promise<void> | void> }) => {
    const enqueueListeners: Array<(data: any) => void> = []
    const dequeueListeners: Array<(data: any) => void> = []

    return {
      enqueue(data: any) {
        for (const listener of enqueueListeners)
          listener(data)

        queueMicrotask(async () => {
          try {
            for (const handler of handlers) {
              await handler({ data })
            }
          }
          finally {
            for (const listener of dequeueListeners)
              listener(data)
          }
        })
      },
      on(event: 'enqueue' | 'dequeue', listener: (data: any) => void) {
        if (event === 'enqueue') {
          enqueueListeners.push(listener)
          return
        }

        dequeueListeners.push(listener)
      },
    }
  },
}))

vi.mock('../composables', () => ({
  useAnalytics: () => ({
    trackFirstMessage: trackFirstMessageMock,
  }),
}))

vi.mock('../services/memory/gateway', () => ({
  createMemoryGateway: createMemoryGatewayMock,
}))

vi.mock('../composables/llm-marker-parser', () => ({
  useLlmmarkerParser: (options: { onLiteral?: (literal: string) => Promise<void>, onEnd?: (fullText: string) => Promise<void> }) => {
    let fullText = ''
    return {
      consume: async (textPart: string) => {
        parserConsumeMock(textPart)
        fullText += textPart
        await options.onLiteral?.(textPart)
      },
      end: async () => {
        parserEndMock()
        await options.onEnd?.(fullText)
      },
    }
  },
}))

vi.mock('../composables/response-categoriser', () => ({
  createStreamingCategorizer: () => ({
    consume: vi.fn(),
    filterToSpeech: (literal: string) => literal,
  }),
  categorizeResponse: (fullText: string) => ({
    speech: fullText,
    reasoning: '',
  }),
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
    getSessionMessages: (sessionId: string) => sessionMessages[sessionId] ?? [],
    persistSessionMessages: persistSessionMessagesMock,
    getSessionGeneration: () => currentGeneration,
    forkSession: forkSessionMock,
  }),
}))

vi.mock('./chat/hooks', () => ({
  createChatHooks: () => {
    const beforeMessageComposed: Array<(message: string, context: any) => Promise<void> | void> = []
    const afterMessageComposed: Array<(message: string, context: any) => Promise<void> | void> = []
    const beforeSend: Array<(message: string, context: any) => Promise<void> | void> = []
    const afterSend: Array<(message: string, context: any) => Promise<void> | void> = []
    const tokenLiteral: Array<(literal: string, context: any) => Promise<void> | void> = []
    const tokenSpecial: Array<(special: string, context: any) => Promise<void> | void> = []
    const streamEnd: Array<(context: any) => Promise<void> | void> = []
    const assistantResponseEnd: Array<(fullText: string, context: any) => Promise<void> | void> = []
    const assistantMessage: Array<(message: any, fullText: string, context: any) => Promise<void> | void> = []
    const chatTurnComplete: Array<(turn: any, context: any) => Promise<void> | void> = []

    return {
      clearHooks: vi.fn(),
      emitBeforeMessageComposedHooks: async (message: string, context: any) => { for (const hook of beforeMessageComposed) await hook(message, context) },
      emitAfterMessageComposedHooks: async (message: string, context: any) => { for (const hook of afterMessageComposed) await hook(message, context) },
      emitBeforeSendHooks: async (message: string, context: any) => { for (const hook of beforeSend) await hook(message, context) },
      emitAfterSendHooks: async (message: string, context: any) => { for (const hook of afterSend) await hook(message, context) },
      emitTokenLiteralHooks: async (literal: string, context: any) => { for (const hook of tokenLiteral) await hook(literal, context) },
      emitTokenSpecialHooks: async (special: string, context: any) => { for (const hook of tokenSpecial) await hook(special, context) },
      emitStreamEndHooks: async (context: any) => { for (const hook of streamEnd) await hook(context) },
      emitAssistantResponseEndHooks: async (fullText: string, context: any) => { for (const hook of assistantResponseEnd) await hook(fullText, context) },
      emitAssistantMessageHooks: async (message: any, fullText: string, context: any) => { for (const hook of assistantMessage) await hook(message, fullText, context) },
      emitChatTurnCompleteHooks: async (turn: any, context: any) => { for (const hook of chatTurnComplete) await hook(turn, context) },
      onBeforeMessageComposed: (hook: any) => beforeMessageComposed.push(hook),
      onAfterMessageComposed: (hook: any) => afterMessageComposed.push(hook),
      onBeforeSend: (hook: any) => beforeSend.push(hook),
      onAfterSend: (hook: any) => afterSend.push(hook),
      onTokenLiteral: (hook: any) => tokenLiteral.push(hook),
      onTokenSpecial: (hook: any) => tokenSpecial.push(hook),
      onStreamEnd: (hook: any) => streamEnd.push(hook),
      onAssistantResponseEnd: (hook: any) => assistantResponseEnd.push(hook),
      onAssistantMessage: (hook: any) => assistantMessage.push(hook),
      onChatTurnComplete: (hook: any) => chatTurnComplete.push(hook),
    }
  },
}))

vi.mock('./chat/stream-store', () => ({
  useChatStreamStore: () => ({
    streamingMessage: streamingMessageRef,
  }),
}))

vi.mock('./modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCard: undefined,
    activeCardId: activeCardIdRef,
  }),
}))

vi.mock('./modules/artistry-autonomous', () => ({
  useAutonomousArtistryStore: () => ({
    runArtistTask: vi.fn(),
  }),
}))

vi.mock('./auth', () => ({
  useAuthStore: () => ({
    userId: userIdRef,
  }),
}))

vi.mock('./llm', () => ({
  useLLM: () => ({
    stream: llmStreamMock,
  }),
}))

vi.mock('./modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: ref('mock-provider'),
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
    createMinecraftContextMock.mockReset()
    createMinecraftContextMock.mockReturnValue(undefined)
    persistSessionMessagesMock.mockReset()
    forkSessionMock.mockReset()
    ensureSessionMock.mockReset()
    parserConsumeMock.mockReset()
    parserEndMock.mockReset()
    readPromptContextMock.mockReset()
    appendTurnMock.mockReset()
    createMemoryGatewayMock.mockReset()
    activeSessionIdRef.value = 'session-1'
    activeCardIdRef.value = 'character-1'
    userIdRef.value = 'user-1'
    streamingMessageRef.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
    currentGeneration = 1

    for (const key of Object.keys(sessionMessages)) {
      delete sessionMessages[key]
    }

    sessionMessages['session-1'] = [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
    createMemoryGatewayMock.mockReturnValue({
      appendTurn: appendTurnMock,
      getSyncState: vi.fn(),
      readPromptContext: readPromptContextMock,
    })
    appendTurnMock.mockResolvedValue({
      schemaVersion: 1,
      storedTurnId: 'ignored',
      syncCheckpoint: 0,
    })
    readPromptContextMock.mockResolvedValue({
      memoryCards: [],
      profileSummary: null,
      recentTurns: [],
      schemaVersion: 0,
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      stableFacts: [],
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
    readPromptContextMock.mockResolvedValue({
      memoryCards: [],
      profileSummary: 'AIRI knows the user prefers concise replies.',
      recentTurns: [
        {
          createdAt: 10,
          role: 'user',
          text: 'Earlier question',
          turnId: 'turn-earlier-user',
        },
        {
          createdAt: 11,
          role: 'assistant',
          text: 'Earlier answer',
          turnId: 'turn-earlier-assistant',
        },
      ],
      schemaVersion: 1,
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      stableFacts: [
        {
          confidence: 0.9,
          id: 'fact-1',
          key: 'preference',
          value: 'concise',
        },
      ],
    })

    let composedMessages: Message[] = []
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      composedMessages = messages
      expect(readPromptContextMock).toHaveBeenCalledWith({
        scope: {
          characterId: 'character-1',
          sessionId: 'session-1',
          userId: 'user-1',
        },
      })
      expect(appendTurnMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
        role: 'user',
        scope: {
          characterId: 'character-1',
          sessionId: 'session-1',
          userId: 'user-1',
        },
        text: 'hello from user',
      }))
      expect(options.waitForTools).toBe(true)

      await options.onStreamEvent({ type: 'text-delta', text: 'hello' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

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
    expect(parserConsumeMock).toHaveBeenCalledWith('hello')
    expect(parserEndMock).toHaveBeenCalledTimes(1)
    expect(appendTurnMock).toHaveBeenCalledTimes(2)
    expect(appendTurnMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: 'assistant',
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      text: 'hello',
    }))
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
    const systemContent = (composedMessages[0] as any).content
    const systemText = typeof systemContent === 'string' ? systemContent : systemContent.map((p: any) => p.text).join('')
    expect(systemText).toBe('system prompt')

    // The user turn is prefixed with [YYYY-MM-DD HH:MM]. Both historic and
    // current turns share the same shape so prefix-cache stays valid when a
    // "current" turn becomes "historic" on the next send. Side-channel context
    // (weather) is appended as a separate text part so providers don't see
    // consecutive same-role messages.
    const userMessageContent = (composedMessages[1] as any).content
    expect(userMessageContent[0].text).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] hello from user$/)

    const memoryText = userMessageContent[1].text
    expect(memoryText).toContain('[Memory]')
    expect(memoryText.indexOf('[Profile Summary]')).toBeLessThan(memoryText.indexOf('[Stable Facts]'))
    expect(memoryText.indexOf('[Stable Facts]')).toBeLessThan(memoryText.indexOf('[Recent Turns]'))
    expect(memoryText).toContain('AIRI knows the user prefers concise replies.')
    expect(memoryText).toContain('- preference: concise')
    expect(memoryText).toContain('- user: Earlier question')
    expect(memoryText).toContain('- assistant: Earlier answer')

    const syntheticContextText = userMessageContent[2].text
    expect(syntheticContextText).not.toContain('<context>')
    expect(syntheticContextText).not.toContain('<module ')
    expect(syntheticContextText).toContain('[Context]')
    expect(syntheticContextText).toContain('- system:weather: sunny')
  })

  it('keeps sending stable when memory summary, facts, and turns are empty', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    readPromptContextMock.mockResolvedValue({
      memoryCards: [],
      profileSummary: null,
      recentTurns: [],
      schemaVersion: 0,
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      stableFacts: [],
    })

    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      expect(messages).toHaveLength(2)
      const userMessageContent = (messages[1] as any).content
      expect(typeof userMessageContent === 'string' || Array.isArray(userMessageContent)).toBe(true)
      await options.onStreamEvent({ type: 'text-delta', text: 'ok' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()

    await expect(store.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })).resolves.toBeUndefined()
  })

  it('continues the chat flow when appendTurn fails and logs a clear error branch', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    appendTurnMock
      .mockRejectedValueOnce(new Error('user append failed'))
      .mockRejectedValueOnce(new Error('assistant append failed'))

    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'ok' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()

    await expect(store.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })).resolves.toBeUndefined()

    expect(llmStreamMock).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[memory-turn-write] Failed to append turn to local memory:',
      expect.objectContaining({
        error: expect.any(Error),
        payload: expect.objectContaining({ role: 'user' }),
      }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[memory-turn-write] Failed to append turn to local memory:',
      expect.objectContaining({
        error: expect.any(Error),
        payload: expect.objectContaining({ role: 'assistant' }),
      }),
    )

    consoleErrorSpy.mockRestore()
  })

  it('does not persist a stale assistant generation into memory', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'stale reply' })
      currentGeneration = 2
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()

    await store.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(appendTurnMock).toHaveBeenCalledTimes(1)
    expect(appendTurnMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      role: 'user',
      text: 'hello from user',
    }))
  })

  it('persists assistant memory with the same scope captured for the user turn', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      activeCardIdRef.value = 'character-switched'
      userIdRef.value = 'user-switched'
      await options.onStreamEvent({ type: 'text-delta', text: 'scoped reply' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()

    await store.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(appendTurnMock).toHaveBeenCalledTimes(2)
    expect(appendTurnMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: 'assistant',
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      text: 'scoped reply',
    }))
  })

  it('rejects cancelled queued sends before they start', async () => {
    llmStreamMock.mockImplementation(async () => {
      // keep pending
      await new Promise(() => {})
    })

    const store = useChatOrchestratorStore()
    const pending = store.ingest('cancel me', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    store.cancelPendingSends('session-1')

    await expect(pending).rejects.toThrow('Chat session was reset before send could start')
  })

  it('rejects stale generation sends before performSend starts', async () => {
    const store = useChatOrchestratorStore()
    const pending = store.ingest('stale request', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    currentGeneration = 2

    await expect(pending).rejects.toThrow('Chat session was reset before send could start')
    expect(llmStreamMock).not.toHaveBeenCalled()
  })

  it('uses forked session id in ingestOnFork and keeps public store contract keys', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    forkSessionMock.mockResolvedValue('session-forked')
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'text-delta', text: 'fork-reply' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()

    expect(store.$id).toBe('chat-orchestrator')
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
