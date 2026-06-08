// @vitest-environment jsdom

import type { Ref } from 'vue'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

interface MockBroadcastMessageEvent<T> {
  data: T
}

type MockListener = (event: MockBroadcastMessageEvent<unknown>) => void
interface MockChatMessage {
  role: string
  content: string
  slices?: Array<{ type: string, text?: string }>
  tool_results?: unknown[]
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

vi.mock('./tools/builtin/widgets', () => ({
  widgetsTools: vi.fn(async () => []),
}))

vi.mock('./tools/builtin/weather', () => ({
  weatherTools: vi.fn(async () => []),
}))

vi.mock('./tools/builtin/image-journal', () => ({
  imageJournalTools: vi.fn(async () => []),
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

  it('keeps normal ingest on command response without result payloads', async () => {
    mockState.ingest.mockResolvedValueOnce(undefined)

    const { authorityStore, followerStore } = initializeAuthorityAndFollower()
    const result = await followerStore.requestIngest({ text: 'hello normal chat' })

    const commandMessages = postedMessagesOfType('command')
    const responseMessages = postedMessagesOfType('response')

    expect(result).toBeUndefined()
    expect(commandMessages).toEqual([
      expect.objectContaining({
        type: 'command',
        command: 'ingest',
        payload: {
          text: 'hello normal chat',
        },
      }),
    ])
    expect(responseMessages).toEqual([
      expect.objectContaining({
        type: 'response',
        ok: true,
      }),
    ])
    expect(responseMessages[0]).not.toHaveProperty('result')

    authorityStore.dispose()
    followerStore.dispose()
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

  it('sends spotlight commands through dedicated request and response messages', async () => {
    mockState.ingest.mockImplementationOnce(async () => {
      mockState.sessionMessages.value['session-1'] = [
        ...(mockState.sessionMessages.value['session-1'] ?? []),
        assistantMessage('visible reply'),
      ]
    })

    const { authorityStore, followerStore } = initializeAuthorityAndFollower()
    const result = await followerStore.requestSpotlightIngest({ text: 'hello spotlight' })
    const spotlightCommands = postedMessagesOfType('spotlight-command')
    const spotlightResponses = postedMessagesOfType('spotlight-response')
    const normalResponses = postedMessagesOfType('response')

    expect(result).toEqual({
      sessionId: 'session-1',
      visibleText: 'visible reply',
    })
    expect(spotlightCommands).toEqual([
      expect.objectContaining({
        type: 'spotlight-command',
        command: 'ingest',
        payload: {
          text: 'hello spotlight',
        },
      }),
    ])
    expect(spotlightResponses).toEqual([
      expect.objectContaining({
        type: 'spotlight-response',
        ok: true,
        result: {
          sessionId: 'session-1',
          visibleText: 'visible reply',
        },
      }),
    ])
    expect(normalResponses).toEqual([])
    expect(mockState.ingest).toHaveBeenCalledWith('hello spotlight', expect.objectContaining({
      tools: expect.any(Function),
    }), 'session-1')

    authorityStore.dispose()
    followerStore.dispose()
  })

  it('fails empty spotlight replies on the authority and appends the error to the main session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockState.sessionMessages.value['session-1'] = [
      { role: 'system', content: 'init' },
      assistantMessage('previous reply'),
    ]
    mockState.ingest.mockResolvedValueOnce(undefined)

    const { authorityStore, followerStore } = initializeAuthorityAndFollower()
    await expect(
      followerStore.requestSpotlightIngest({ text: 'empty spotlight' }),
    ).rejects.toThrow('Spotlight response was empty')

    const spotlightResponses = postedMessagesOfType('spotlight-response')
    const persistedMessages = mockState.sessionMessages.value['session-1']

    expect(spotlightResponses).toEqual([
      expect.objectContaining({
        type: 'spotlight-response',
        ok: false,
        error: 'Spotlight response was empty',
      }),
    ])
    expect(persistedMessages).toHaveLength(3)
    expect(persistedMessages[2]?.role).toBe('error')
    expect(persistedMessages[2]?.content).toBe('Spotlight response was empty')
    expect(mockState.ingest).toHaveBeenCalledWith('empty spotlight', expect.objectContaining({
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
    const expectedRejection = expect(pending).rejects.toThrow('回复超时')

    await vi.advanceTimersByTimeAsync(300000)

    await expectedRejection

    store.dispose()
    vi.useRealTimers()
  })
})
