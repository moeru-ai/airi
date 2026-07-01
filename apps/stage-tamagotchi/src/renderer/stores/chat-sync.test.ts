// @vitest-environment jsdom

import type { Tool } from '@xsai/shared-chat'
import type { Ref } from 'vue'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

const mockResolveLlmTools = vi.hoisted(() => vi.fn<(options?: { customTools?: (() => Promise<Tool[]>) | Tool[] }) => Promise<Tool[]>>())
const mockWidgetsTools = vi.hoisted(() => vi.fn<() => Promise<Tool[]>>(async () => []))
const mockWeatherTools = vi.hoisted(() => vi.fn<() => Promise<Tool[]>>(async () => []))
const mockImageJournalTools = vi.hoisted(() => vi.fn<() => Promise<Tool[]>>(async () => []))

interface MockBroadcastMessageEvent<T> {
  data: T
}

type MockListener = (event: MockBroadcastMessageEvent<unknown>) => void
interface MockChatMessage {
  id?: string
  role: string
  content: string
  slices?: unknown[]
  tool_results?: Array<{ id: string, isError?: boolean, result: unknown }>
}

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>()
  static messages: unknown[] = []

  static reset() {
    for (const peers of MockBroadcastChannel.channels.values()) {
      for (const peer of peers)
        peer.listeners.clear()
    }
    MockBroadcastChannel.channels.clear()
    MockBroadcastChannel.messages = []
  }

  readonly name: string
  private readonly listeners = new Set<MockListener>()

  constructor(name: string) {
    this.name = name
    if (!MockBroadcastChannel.channels.has(name))
      MockBroadcastChannel.channels.set(name, new Set())
    MockBroadcastChannel.channels.get(name)?.add(this)
  }

  addEventListener(_type: 'message', listener: EventListener) {
    this.listeners.add(listener as unknown as MockListener)
  }

  removeEventListener(_type: 'message', listener: EventListener) {
    this.listeners.delete(listener as unknown as MockListener)
  }

  postMessage(data: unknown) {
    MockBroadcastChannel.messages.push(data)

    const peers = MockBroadcastChannel.channels.get(this.name)
    if (!peers)
      return

    for (const peer of peers) {
      if (peer === this)
        continue

      for (const listener of peer.listeners)
        listener({ data })
    }
  }

  close() {
    const peers = MockBroadcastChannel.channels.get(this.name)
    peers?.delete(this)
    this.listeners.clear()
    if (peers && peers.size === 0)
      MockBroadcastChannel.channels.delete(this.name)
  }
}

function postedMessagesOfType<T extends string>(type: T) {
  return MockBroadcastChannel.messages.filter((message): message is { type: T } & Record<string, unknown> => {
    return typeof message === 'object'
      && message !== null
      && 'type' in message
      && message.type === type
  })
}

function assistantMessage(content: string): MockChatMessage {
  return {
    role: 'assistant',
    content,
    slices: [{ type: 'text', text: content }],
    tool_results: [],
  }
}

interface MockState {
  activeSessionId: Ref<string>
  sessionMessages: Ref<Record<string, MockChatMessage[]>>
  sessionMetas: Ref<Record<string, unknown>>
  applyRemoteSnapshot: ReturnType<typeof vi.fn>
  setSessionMessages: ReturnType<typeof vi.fn>
  getSessionMessages: ReturnType<typeof vi.fn>
  ingest: ReturnType<typeof vi.fn>
}

let mockState: MockState

vi.mock('@proj-airi/stage-ui/stores/chat/session-store', () => ({
  useChatSessionStore: () => ({
    activeSessionId: mockState.activeSessionId,
    sessionMessages: mockState.sessionMessages,
    sessionMetas: mockState.sessionMetas,
    applyRemoteSnapshot: mockState.applyRemoteSnapshot,
    getSnapshot: vi.fn(() => ({
      activeSessionId: mockState.activeSessionId.value,
      sessionMessages: mockState.sessionMessages.value,
      sessionMetas: mockState.sessionMetas.value,
    })),
    getSessionMessages: mockState.getSessionMessages,
    setSessionMessages: mockState.setSessionMessages,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/stream-store', () => ({
  useChatStreamStore: () => ({
    streamingMessage: ref({ role: 'assistant', content: '', slices: [], tool_results: [] }),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatOrchestratorStore: () => ({
    sending: ref(false),
    ingest: mockState.ingest,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/maintenance', () => ({
  useChatMaintenanceStore: () => ({
    cleanupMessages: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/providers', () => ({
  useProvidersStore: () => ({
    getProviderInstance: vi.fn(async () => ({ id: 'provider' })),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: computed(() => 'provider-id'),
    activeModel: computed(() => 'model-id'),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/llm-tool-resolver', async (importOriginal) => {
  const original = await importOriginal<typeof import('@proj-airi/stage-ui/stores/llm-tool-resolver')>()

  return {
    ...original,
    resolveLlmTools: mockResolveLlmTools,
  }
})

vi.mock('./tools/builtin/widgets', () => ({
  widgetsTools: mockWidgetsTools,
}))

vi.mock('./tools/builtin/weather', () => ({
  weatherTools: mockWeatherTools,
}))

vi.mock('./tools/builtin/image-journal', () => ({
  imageJournalTools: mockImageJournalTools,
}))

describe('useChatSyncStore', async () => {
  const { useChatSyncStore } = await import('./chat-sync')

  function initializeAuthorityAndFollower() {
    const authorityStore = useChatSyncStore()
    authorityStore.initialize('authority')

    setActivePinia(createPinia())
    const followerStore = useChatSyncStore()
    followerStore.initialize('follower')

    return { authorityStore, followerStore }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    MockBroadcastChannel.reset()
    vi.restoreAllMocks()

    const activeSessionId = ref('session-1')
    const sessionMessages = ref<Record<string, MockChatMessage[]>>({
      'session-1': [{ role: 'system', content: 'init' }],
    })
    const sessionMetas = ref<Record<string, unknown>>({})
    const applyRemoteSnapshot = vi.fn((snapshot: {
      activeSessionId: string
      sessionMessages: Record<string, MockChatMessage[]>
      sessionMetas: Record<string, unknown>
    }) => {
      activeSessionId.value = snapshot.activeSessionId
      sessionMessages.value = snapshot.sessionMessages
      sessionMetas.value = snapshot.sessionMetas
    })

    const setSessionMessages = vi.fn((sessionId: string, next: MockChatMessage[]) => {
      sessionMessages.value[sessionId] = next
    })

    const getSessionMessages = vi.fn((sessionId: string) => sessionMessages.value[sessionId] ?? [])

    const ingest = vi.fn(async () => {
      throw new Error('Remote sent 403 response: {"error":{"message":"This model is not available in your region.","code":403}}')
    })

    mockResolveLlmTools.mockReset()
    mockResolveLlmTools.mockResolvedValue([])
    mockWidgetsTools.mockReset()
    mockWidgetsTools.mockResolvedValue([])
    mockWeatherTools.mockReset()
    mockWeatherTools.mockResolvedValue([])
    mockImageJournalTools.mockReset()
    mockImageJournalTools.mockResolvedValue([])

    mockState = {
      activeSessionId,
      sessionMessages,
      sessionMetas,
      applyRemoteSnapshot,
      setSessionMessages,
      getSessionMessages,
      ingest,
    }

    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    MockBroadcastChannel.reset()
  })

  it('stores command ingest errors in authority session history', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useChatSyncStore()
    store.initialize('authority')

    const peer = new MockBroadcastChannel('airi:stage-tamagotchi:chat-sync')
    peer.postMessage({
      type: 'command',
      requestId: 'req-1',
      senderId: 'peer',
      command: 'ingest',
      payload: {
        text: 'hello',
        sessionId: 'session-1',
      },
    })

    await vi.waitFor(() => {
      expect(mockState.ingest).toHaveBeenCalledTimes(1)
      expect(mockState.setSessionMessages).toHaveBeenCalledTimes(1)
    })

    const persistedMessages = mockState.sessionMessages.value['session-1']
    expect(persistedMessages).toHaveLength(2)
    expect(persistedMessages[1]?.role).toBe('error')
    expect(persistedMessages[1]?.content).toContain('This model is not available in your region')

    peer.close()
    store.dispose()
  })

  it('rejects follower command timeouts after thirty seconds', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useChatSyncStore()
    store.initialize('follower')

    const pending = store.requestIngest({
      text: 'hello timeout',
      sessionId: 'session-1',
    })
    const expectedRejection = expect(pending).rejects.toThrow('Timed out waiting for chat authority response')

    await vi.advanceTimersByTimeAsync(30000)

    await expectedRejection

    store.dispose()
    vi.useRealTimers()
  })

  it('replaces the last failed turn before retrying', async () => {
    mockState.sessionMessages.value['session-1'] = [
      { role: 'system', content: 'init' },
      { role: 'user', content: 'hello-1' },
      { role: 'assistant', content: 'answer-1' },
      { role: 'user', content: 'hello' },
      { role: 'error', content: 'Remote sent 400 response' },
      { role: 'user', content: 'hello-3' },
      { role: 'assistant', content: 'answer-3' },
    ]
    mockState.ingest.mockResolvedValueOnce(undefined)

    const store = useChatSyncStore()
    store.initialize('authority')

    const peer = new MockBroadcastChannel('airi:stage-tamagotchi:chat-sync')
    peer.postMessage({
      type: 'command',
      requestId: 'req-2',
      senderId: 'peer',
      command: 'retry',
      payload: {
        sessionId: 'session-1',
        index: 4,
      },
    })

    await vi.waitFor(() => {
      expect(mockState.setSessionMessages).toHaveBeenCalledWith('session-1', [
        { role: 'system', content: 'init' },
        { role: 'user', content: 'hello-1' },
        { role: 'assistant', content: 'answer-1' },
      ])
      expect(mockState.ingest).toHaveBeenCalledWith('hello', expect.any(Object), 'session-1')
    })

    const persistedMessages = mockState.sessionMessages.value['session-1']
    expect(persistedMessages).toEqual([
      { role: 'system', content: 'init' },
      { role: 'user', content: 'hello-1' },
      { role: 'assistant', content: 'answer-1' },
    ])

    peer.close()
    store.dispose()
  })

  it('rewinds from the source user turn when retry targets an assistant message', async () => {
    mockState.sessionMessages.value['session-1'] = [
      { role: 'system', content: 'init' },
      { role: 'user', content: 'hello-1' },
      { role: 'assistant', content: 'answer-1' },
      { role: 'user', content: 'hello-2' },
      { role: 'assistant', content: 'answer-2' },
      { role: 'user', content: 'hello-3' },
    ]
    mockState.ingest.mockResolvedValueOnce(undefined)

    const store = useChatSyncStore()
    store.initialize('authority')

    const peer = new MockBroadcastChannel('airi:stage-tamagotchi:chat-sync')
    peer.postMessage({
      type: 'command',
      requestId: 'req-3',
      senderId: 'peer',
      command: 'retry',
      payload: {
        sessionId: 'session-1',
        index: 4,
      },
    })

    await vi.waitFor(() => {
      expect(mockState.setSessionMessages).toHaveBeenCalledWith('session-1', [
        { role: 'system', content: 'init' },
        { role: 'user', content: 'hello-1' },
        { role: 'assistant', content: 'answer-1' },
      ])
      expect(mockState.ingest).toHaveBeenCalledWith('hello-2', expect.any(Object), 'session-1')
    })

    peer.close()
    store.dispose()
  })

  it('keeps the follower chat window on its local session while applying remote snapshots', async () => {
    mockState.activeSessionId.value = 'session-2'
    mockState.sessionMessages.value = {
      'session-2': [{ role: 'system', content: 'chat-window' }],
    }

    const store = useChatSyncStore()
    store.initialize('follower')

    const authority = new MockBroadcastChannel('airi:stage-tamagotchi:chat-sync')
    authority.postMessage({
      type: 'session-snapshot',
      authorityId: 'authority',
      snapshot: {
        activeSessionId: 'session-1',
        sessionMessages: {
          'session-1': [{ role: 'system', content: 'main-window' }],
          'session-2': [{ role: 'system', content: 'chat-window' }, { role: 'user', content: 'retry me' }],
        },
        sessionMetas: {},
      },
    })

    await vi.waitFor(() => {
      expect(mockState.applyRemoteSnapshot).toHaveBeenCalledTimes(1)
    })

    expect(mockState.activeSessionId.value).toBe('session-2')
    expect(mockState.sessionMessages.value['session-2']).toEqual([
      { role: 'system', content: 'chat-window' },
      { role: 'user', content: 'retry me' },
    ])

    authority.close()
    store.dispose()
  })

  it('sends spotlight commands through shared request and response messages', async () => {
    mockState.ingest.mockImplementationOnce(async () => {
      mockState.sessionMessages.value['session-1'] = [
        ...(mockState.sessionMessages.value['session-1'] ?? []),
        assistantMessage('visible reply'),
      ]
    })

    const { authorityStore, followerStore } = initializeAuthorityAndFollower()
    const result = await followerStore.requestSpotlightIngest({ text: 'hello spotlight' })
    const spotlightCommands = postedMessagesOfType('command')
      .filter(message => message.command === 'spotlight-ingest')
    const responses = postedMessagesOfType('response')

    expect(result).toEqual({
      sessionId: 'session-1',
      visibleText: 'visible reply',
    })
    expect(spotlightCommands).toEqual([
      expect.objectContaining({
        type: 'command',
        command: 'spotlight-ingest',
        payload: {
          text: 'hello spotlight',
        },
      }),
    ])
    expect(responses).toEqual([
      expect.objectContaining({
        type: 'response',
        ok: true,
        result: {
          sessionId: 'session-1',
          visibleText: 'visible reply',
        },
      }),
    ])
    expect(mockState.ingest).toHaveBeenCalledWith('hello spotlight', expect.objectContaining({
      tools: expect.any(Function),
    }), 'session-1')

    authorityStore.dispose()
    followerStore.dispose()
  })

  it('uses an independent five minute timeout for spotlight requests', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useChatSyncStore()
    store.initialize('follower')

    const pending = store.requestSpotlightIngest({ text: 'hello timeout' })
    const expectedRejection = expect(pending).rejects.toThrow('Spotlight response timed out')

    await vi.advanceTimersByTimeAsync(300000)

    await expectedRejection

    store.dispose()
    vi.useRealTimers()
  })

  it('reruns a tool call locally when this window is the authority', async () => {
    const execute = vi.fn<Tool['execute']>(async () => 'fresh result')
    const demoTool: Tool = {
      type: 'function',
      function: {
        name: 'demo-tool',
        description: 'Demo tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute,
    }
    mockWidgetsTools.mockResolvedValueOnce([demoTool])
    mockResolveLlmTools.mockImplementationOnce(async (options) => {
      if (typeof options?.customTools === 'function')
        return options.customTools()

      return options?.customTools ?? []
    })
    const initialMessages: MockChatMessage[] = [
      { role: 'user', content: 'run the tool', id: 'user-1' },
      {
        role: 'assistant',
        content: '',
        id: 'assistant-1',
        slices: [
          {
            type: 'tool-call',
            toolCall: {
              toolCallId: 'call-demo',
              toolCallType: 'function',
              toolName: 'demo-tool',
              args: '{ "value": 1 }',
            },
          },
        ],
        tool_results: [
          {
            id: 'call-demo',
            result: 'stale result',
          },
        ],
      },
    ]
    mockState.sessionMessages.value['session-1'] = initialMessages

    const store = useChatSyncStore()
    store.initialize('authority')

    await store.requestToolCallRerun({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      toolset: 'widgets',
      toolCallId: 'call-demo',
      toolName: 'demo-tool',
      args: '{ "value": 2 }',
    })

    expect(mockResolveLlmTools).toHaveBeenCalledWith({ customTools: expect.any(Function) })
    expect(mockWidgetsTools).toHaveBeenCalledTimes(1)
    expect(mockWeatherTools).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({ value: 2 }, {
      toolCallId: 'call-demo',
      messages: initialMessages,
    })
    expect(mockState.setSessionMessages).toHaveBeenCalledWith('session-1', [
      initialMessages[0],
      expect.objectContaining({
        id: 'assistant-1',
        tool_results: [
          {
            id: 'call-demo',
            result: 'fresh result',
          },
        ],
      }),
    ])

    store.dispose()
  })

  it('sends tool call rerun commands from followers', async () => {
    const store = useChatSyncStore()
    store.initialize('follower')

    const pending = store.requestToolCallRerun({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      toolset: 'artistry',
      toolCallId: 'call-demo',
      toolName: 'demo-tool',
      args: '{ "value": 2 }',
    })
    pending.catch(() => {})

    const rerunCommands = postedMessagesOfType('command')
      .filter(message => message.command === 'tool-call-rerun')

    expect(rerunCommands).toEqual([
      expect.objectContaining({
        type: 'command',
        command: 'tool-call-rerun',
        payload: {
          sessionId: 'session-1',
          messageId: 'assistant-1',
          toolset: 'artistry',
          toolCallId: 'call-demo',
          toolName: 'demo-tool',
          args: '{ "value": 2 }',
        },
      }),
    ])

    store.dispose()
    await expect(pending).rejects.toThrow('Chat sync channel disposed')
  })
})
