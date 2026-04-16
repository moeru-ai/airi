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
    applyRemoteSnapshot: vi.fn(),
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

    const activeSessionId = ref('session-1')
    const sessionMessages = ref<Record<string, Array<{ role: string, content: string }>>>({
      'session-1': [{ role: 'system', content: 'init' }],
    })
    const sessionMetas = ref<Record<string, unknown>>({})

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
})
