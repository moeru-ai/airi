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
const createDatetimeContextMock = vi.fn()
const createMinecraftContextMock = vi.fn()
const persistSessionMessagesMock = vi.fn()
const forkSessionMock = vi.fn()
const ensureSessionMock = vi.fn()
const parserConsumeMock = vi.fn()
const parserEndMock = vi.fn()

const activeSessionIdRef = ref('session-1')
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
  createDatetimeContext: () => createDatetimeContextMock(),
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
    createDatetimeContextMock.mockReset()
    createMinecraftContextMock.mockReset()
    createMinecraftContextMock.mockReturnValue(undefined)
    persistSessionMessagesMock.mockReset()
    forkSessionMock.mockReset()
    ensureSessionMock.mockReset()
    parserConsumeMock.mockReset()
    parserEndMock.mockReset()
    activeSessionIdRef.value = 'session-1'
    streamingMessageRef.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
    currentGeneration = 1

    for (const key of Object.keys(sessionMessages)) {
      delete sessionMessages[key]
    }

    sessionMessages['session-1'] = [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
  })

  it('keeps hook order and composes context prompt after system message', async () => {
    const datetimeContext = {
      id: 'datetime',
      contextId: 'datetime',
      source: 'ReplaceSelf',
      content: 'now',
      createdAt: 123,
    }
    const contextsSnapshot = {
      weather: [
        {
          id: 'weather',
          contextId: 'weather',
          source: 'ReplaceSelf',
          content: 'sunny',
          createdAt: 456,
        },
      ],
    }

    createDatetimeContextMock.mockReturnValue(datetimeContext)
    getContextsSnapshotMock.mockReturnValue(contextsSnapshot)

    let composedMessages: Message[] = []
    let receivedOptions: any
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      composedMessages = messages
      receivedOptions = options
      expect(options.toolMode).toBe('disabled')
      expect(options.tools).toBeUndefined()
      expect(options.waitForTools).toBe(false)

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
    expect(ingestContextMessageMock).toHaveBeenCalledWith(datetimeContext)
    expect(persistSessionMessagesMock).not.toHaveBeenCalled()
    expect(parserConsumeMock).toHaveBeenCalledWith('hello')
    expect(parserEndMock).toHaveBeenCalledTimes(1)
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
    expect(receivedOptions.builtinTools).toBeUndefined()
    expect((composedMessages[0] as any).content).toBe('system prompt')
    const userMessageContent = (composedMessages[1] as any).content

    expect(userMessageContent[0].text).toBe('hello from user')

    const syntheticContextText = userMessageContent[1].text
    expect(syntheticContextText).toContain('<context>')
    expect(syntheticContextText).toContain('<module name="weather">')
  })

  it('forwards tools only when tool mode is explicitly enabled', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    const customTools = [{ name: 'weather-tool' }] as any
    let receivedOptions: any
    let composedMessages: Message[] = []

    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      receivedOptions = options
      composedMessages = messages
      await options.onStreamEvent({ type: 'tool-call', toolName: 'weather-tool', args: '{"location":"Tokyo"}', toolCallId: 'tool-1', toolCallType: 'function' })
      await options.onStreamEvent({ type: 'tool-result', toolCallId: 'tool-1', result: 'sunny' })
      await options.onStreamEvent({ type: 'text-delta', text: 'hello with tools' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()
    await store.ingest('hello with tools', {
      model: 'gpt-test',
      chatProvider: provider,
      toolMode: 'enabled',
      builtinTools: ['mcp'],
      waitForTools: true,
      tools: customTools,
    })

    expect(receivedOptions.toolMode).toBe('enabled')
    expect(receivedOptions.builtinTools).toEqual(['mcp'])
    expect(receivedOptions.waitForTools).toBe(true)
    expect(receivedOptions.tools).toBe(customTools)
    expect((composedMessages[0] as any).content).toContain('MCP tools are optional.')
    expect((composedMessages[0] as any).content).toContain('Do not call MCP tools for greetings, small talk')

    const assistantMessage = sessionMessages['session-1'].at(-1)
    expect(assistantMessage).toMatchObject({
      role: 'assistant',
      tool_results: [{ id: 'tool-1', result: 'sunny' }],
    })
    expect(assistantMessage.slices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-call',
        toolCall: expect.objectContaining({
          toolCallId: 'tool-1',
          toolName: 'weather-tool',
        }),
      }),
      expect.objectContaining({
        type: 'text',
        text: 'hello with tools',
      }),
    ]))
  })

  it('ignores unexpected tool events when tool mode is disabled', async () => {
    getContextsSnapshotMock.mockReturnValue({})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options: any) => {
      await options.onStreamEvent({ type: 'tool-call', toolName: 'weather-tool', args: '{"location":"Tokyo"}', toolCallId: 'tool-1', toolCallType: 'function' })
      await options.onStreamEvent({ type: 'tool-error', toolCallId: 'tool-1', result: 'boom' })
      await options.onStreamEvent({ type: 'text-delta', text: 'plain reply' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()

    try {
      await store.ingest('hello', {
        model: 'gpt-test',
        chatProvider: provider,
      })
    }
    finally {
      warnSpy.mockRestore()
    }

    const assistantMessage = sessionMessages['session-1'].at(-1)
    expect(assistantMessage).toMatchObject({
      role: 'assistant',
      tool_results: [],
    })
    expect(assistantMessage.slices).toEqual([
      { type: 'text', text: 'plain reply' },
    ])
    expect(warnSpy).toHaveBeenCalledTimes(1)
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
