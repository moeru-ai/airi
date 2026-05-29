// @vitest-environment jsdom

import type { Ref } from 'vue'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

interface MockBroadcastMessageEvent<T> {
  data: T
}

type MockListener = (event: MockBroadcastMessageEvent<unknown>) => void

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>()

  static reset() {
    for (const peers of MockBroadcastChannel.channels.values()) {
      for (const peer of peers)
        peer.listeners.clear()
    }
    MockBroadcastChannel.channels.clear()
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

interface MockState {
  activeSessionId: Ref<string>
  sessionMessages: Ref<Record<string, Array<{ role: string, content: string }>>>
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

/**
 * @example
 * describe('useChatSyncStore authority ingest failures', () => {
 *   it('persists ingest errors into authoritative session snapshot', async () => {})
 * })
 */
describe('useChatSyncStore authority ingest failures', async () => {
  const { useChatSyncStore } = await import('./chat-sync')

  beforeEach(() => {
    setActivePinia(createPinia())
    MockBroadcastChannel.reset()
    vi.restoreAllMocks()

    const activeSessionId = ref('session-1')
    const sessionMessages = ref<Record<string, Array<{ role: string, content: string }>>>({
      'session-1': [{ role: 'system', content: 'init' }],
    })
    const sessionMetas = ref<Record<string, unknown>>({})
    const applyRemoteSnapshot = vi.fn((snapshot: {
      activeSessionId: string
      sessionMessages: Record<string, Array<{ role: string, content: string }>>
      sessionMetas: Record<string, unknown>
    }) => {
      activeSessionId.value = snapshot.activeSessionId
      sessionMessages.value = snapshot.sessionMessages
      sessionMetas.value = snapshot.sessionMetas
    })

    const setSessionMessages = vi.fn((sessionId: string, next: Array<{ role: string, content: string }>) => {
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

  /**
   * @example
   * it('keeps region-availability errors visible for follower windows', async () => {
   *   // authority receives ingest command failure
   *   // authoritative session gets role:error entry
   * })
   */
  it('stores command ingest errors in authority session history', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(consoleError).toHaveBeenCalledWith('[chat-sync] command failed', expect.objectContaining({
      command: 'ingest',
      requestId: 'req-1',
      errorMessage: expect.stringContaining('This model is not available in your region'),
      payload: expect.objectContaining({
        text: 'hello',
        sessionId: 'session-1',
      }),
    }))

    peer.close()
    store.dispose()
  })

  /**
   * @example
   * await expect(store.requestIngest({ text: 'hello' })).rejects.toThrow(/timed out/i)
   * expect(console.error).toHaveBeenCalledWith('[chat-sync] command timed out waiting for authority response', expect.any(Object))
   */
  it('logs follower command timeouts with request metadata', async () => {
    vi.useFakeTimers()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useChatSyncStore()
    store.initialize('follower')

    const pending = store.requestIngest({
      text: 'hello timeout',
      sessionId: 'session-1',
    })
    const expectedRejection = expect(pending).rejects.toThrow('Timed out waiting for chat authority response')

    await vi.advanceTimersByTimeAsync(30000)

    await expectedRejection
    expect(consoleError).toHaveBeenCalledWith('[chat-sync] command timed out waiting for authority response', expect.objectContaining({
      command: 'ingest',
      mode: 'follower',
      requestId: expect.any(String),
      errorMessage: 'Timed out waiting for chat authority response',
      payload: expect.objectContaining({
        text: 'hello timeout',
        sessionId: 'session-1',
      }),
    }))

    store.dispose()
    vi.useRealTimers()
  })

  /**
   * @example
   * it('replaces the last failed turn before retrying', async () => {
   *   // authority receives retry command for trailing user -> error pair
   *   // authoritative session removes that failed turn before re-ingesting the user text
   * })
   */
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

  /**
   * @example
   * it('rewinds from the source user turn when retry targets an assistant message', async () => {
   *   // future assistant retry still trims the whole tail from its originating user turn
   * })
   */
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

  /**
   * @example
   * it('keeps the follower chat window on its local session while applying remote snapshots', async () => {
   *   // follower already displays session-2
   *   // authority snapshot arrives with session-1 as active
   *   // follower keeps session-2 selected but still receives session-2 message updates
   * })
   */
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
})
