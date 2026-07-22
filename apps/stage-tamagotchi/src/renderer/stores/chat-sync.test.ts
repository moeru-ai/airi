// @vitest-environment jsdom

import type { ChatSessionsExport } from '@proj-airi/stage-ui/types/chat-session'
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
  createdAt?: number
  id?: string
  role: string
  content: string
  slices?: unknown[]
  tool_results?: Array<{ id: string, isError?: boolean, result: unknown }>
}

type MockImportSessions = ReturnType<typeof vi.fn<(payload: ChatSessionsExport) => Promise<void>>>

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
  activeSendSessionId: Ref<string | undefined>
  activeStreamingMessage: Ref<MockChatMessage | undefined>
  activeSessionId: Ref<string>
  sending: Ref<boolean>
  streamingMessage: Ref<MockChatMessage>
  sessionMessages: Ref<Record<string, MockChatMessage[]>>
  sessionMetas: Ref<Record<string, unknown>>
  applyRemoteSnapshot: ReturnType<typeof vi.fn>
  setSessionMessages: ReturnType<typeof vi.fn>
  getSessionMessages: ReturnType<typeof vi.fn>
  importSessions: MockImportSessions
  createSession: ReturnType<typeof vi.fn>
  loadSession: ReturnType<typeof vi.fn>
  deleteSession: ReturnType<typeof vi.fn>
  setActiveSessionLocally: ReturnType<typeof vi.fn>
  ingest: ReturnType<typeof vi.fn>
}

let mockState: MockState
let mockOrchestratorStoreCalls = 0
let mockStreamStoreCalls = 0

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
    importSessions: mockState.importSessions,
    setSessionMessages: mockState.setSessionMessages,
    createSession: mockState.createSession,
    loadSession: mockState.loadSession,
    deleteSession: mockState.deleteSession,
    setActiveSessionLocally: mockState.setActiveSessionLocally,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/stream-store', () => ({
  useChatStreamStore: () => {
    const streamingMessage = mockStreamStoreCalls++ === 0
      ? mockState.streamingMessage
      : ref<MockChatMessage>({ role: 'assistant', content: '', slices: [], tool_results: [] })

    return { streamingMessage }
  },
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatOrchestratorStore: () => {
    const activeSendSessionId = mockOrchestratorStoreCalls === 0 ? mockState.activeSendSessionId : ref<string>()
    const activeStreamingMessage = mockOrchestratorStoreCalls === 0 ? mockState.activeStreamingMessage : ref<MockChatMessage>()
    const sending = mockOrchestratorStoreCalls++ === 0 ? mockState.sending : ref(false)
    return { activeSendSessionId, activeStreamingMessage, sending, ingest: mockState.ingest }
  },
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
    mockOrchestratorStoreCalls = 0
    mockStreamStoreCalls = 0

    const activeSendSessionId = ref<string>()
    const activeStreamingMessage = ref<MockChatMessage>()
    const activeSessionId = ref('session-1')
    const sending = ref(false)
    const streamingMessage = ref<MockChatMessage>({ role: 'assistant', content: '', slices: [], tool_results: [] })
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
    const importSessions = vi.fn<(payload: ChatSessionsExport) => Promise<void>>().mockResolvedValue(undefined)
    const createSession = vi.fn(async () => 'session-2')
    const loadSession = vi.fn(async () => undefined)
    const deleteSession = vi.fn(async () => undefined)
    const setActiveSessionLocally = vi.fn((sessionId: string) => {
      activeSessionId.value = sessionId
    })

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
      activeSendSessionId,
      activeStreamingMessage,
      activeSessionId,
      sending,
      streamingMessage,
      sessionMessages,
      sessionMetas,
      applyRemoteSnapshot,
      setSessionMessages,
      getSessionMessages,
      importSessions,
      createSession,
      loadSession,
      deleteSession,
      setActiveSessionLocally,
      ingest,
    }

    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    MockBroadcastChannel.reset()
  })

  // https://github.com/moeru-ai/airi/issues/2087
  it('issue #2087: imports settings-window chats through the authority store', async () => {
    // ROOT CAUSE:
    //
    // The settings window previously never joined the desktop chat channel.
    // Its import updated only that renderer's Pinia store and IndexedDB, so
    // the authority kept broadcasting its stale session snapshot until an
    // app restart hydrated the persisted import.
    const importedMeta = {
      sessionId: 'imported-session',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 2,
    }
    const payload: ChatSessionsExport = {
      format: 'chat-sessions-index:v1',
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'imported-session',
            sessions: {
              'imported-session': importedMeta,
            },
          },
        },
      },
      sessions: {
        'imported-session': {
          meta: importedMeta,
          messages: [{ id: 'message-1', role: 'user', content: 'Imported chat' }],
        },
      },
    }
    mockState.importSessions.mockImplementationOnce(async (imported) => {
      mockState.activeSessionId.value = imported.index.characters.default?.activeSessionId ?? ''
      mockState.sessionMetas.value = Object.fromEntries(
        Object.values(imported.index.characters).flatMap(character => Object.entries(character.sessions)),
      )
      mockState.sessionMessages.value = Object.fromEntries(
        Object.entries(imported.sessions).map(([sessionId, session]) => [
          sessionId,
          session.messages.map(message => ({
            id: message.id,
            role: message.role,
            content: typeof message.content === 'string' ? message.content : '',
          })),
        ]),
      )
    })
    const authorityStore = useChatSyncStore()
    authorityStore.initialize('authority')

    setActivePinia(createPinia())
    const settingsStore = useChatSyncStore()
    settingsStore.initialize('client')

    await settingsStore.requestImportSessions(payload)

    expect(mockState.importSessions).toHaveBeenCalledTimes(1)
    expect(mockState.importSessions).toHaveBeenCalledWith(payload)
    await vi.waitFor(() => {
      expect(postedMessagesOfType('session-snapshot')).toContainEqual(expect.objectContaining({
        snapshot: expect.objectContaining({
          sessionMetas: {
            'imported-session': importedMeta,
          },
        }),
      }))
    })

    settingsStore.dispose()
    authorityStore.dispose()
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

  // https://github.com/moeru-ai/airi/issues/2085
  it('hydrates the follower-targeted session before retrying for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Follower selection is window-local, so the authority can know an older
    // target only from metadata. Retry previously read before hydration and
    // therefore could not find the persisted source user turn.
    const persistedMessages: MockChatMessage[] = [
      { role: 'system', content: 'init' },
      { role: 'user', content: 'hello-1' },
      { role: 'assistant', content: 'answer-1' },
      { role: 'user', content: 'hello' },
      { role: 'error', content: 'Remote sent 400 response' },
      { role: 'user', content: 'hello-3' },
      { role: 'assistant', content: 'answer-3' },
    ]
    delete mockState.sessionMessages.value['session-1']
    mockState.sessionMetas.value['session-1'] = { sessionId: 'session-1' }
    mockState.loadSession.mockImplementationOnce(async () => {
      mockState.sessionMessages.value['session-1'] = persistedMessages
    })
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
      expect(mockState.loadSession).toHaveBeenCalledWith('session-1')
      expect(mockState.setSessionMessages).toHaveBeenCalledWith('session-1', [
        { role: 'system', content: 'init' },
        { role: 'user', content: 'hello-1' },
        { role: 'assistant', content: 'answer-1' },
      ])
      expect(mockState.ingest).toHaveBeenCalledWith('hello', expect.any(Object), 'session-1')
    })

    const retriedMessages = mockState.sessionMessages.value['session-1']
    expect(retriedMessages).toEqual([
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

  // https://github.com/moeru-ai/airi/issues/2085
  it('scopes authority stream snapshots to the follower active session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Stream snapshots previously carried only global sending state and text.
    // A follower viewing another session therefore rendered the authority's
    // in-progress assistant response under the wrong conversation.
    mockState.activeSessionId.value = 'session-2'
    mockState.sessionMetas.value = {
      'session-1': { sessionId: 'session-1' },
      'session-2': { sessionId: 'session-2' },
    }

    const store = useChatSyncStore()
    store.initialize('follower')

    const authority = new MockBroadcastChannel('airi:stage-tamagotchi:chat-sync')
    authority.postMessage({
      type: 'stream-snapshot',
      authorityId: 'authority',
      snapshot: {
        sessionId: 'session-1',
        sending: true,
        streamingMessage: assistantMessage('session-1 partial response'),
      },
    })

    await vi.waitFor(() => {
      expect(mockState.sending.value).toBe(false)
      expect(mockState.streamingMessage.value.content).toBe('')
    })

    authority.postMessage({
      type: 'stream-snapshot',
      authorityId: 'authority',
      snapshot: {
        sessionId: 'session-2',
        sending: true,
        streamingMessage: assistantMessage('session-2 partial response'),
      },
    })

    await vi.waitFor(() => {
      expect(mockState.sending.value).toBe(true)
      expect(mockState.streamingMessage.value.content).toBe('session-2 partial response')
    })

    await store.requestSelectSession('session-1')

    expect(mockState.sending.value).toBe(false)
    expect(mockState.streamingMessage.value.content).toBe('')

    authority.close()
    store.dispose()
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('labels authority stream snapshots with the background send target for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Stream snapshots used the authority's visible session even when the
    // queued send belonged to a follower-selected background session. The
    // follower then discarded its own sending state as a foreign stream.
    mockState.activeSessionId.value = 'session-1'

    const store = useChatSyncStore()
    store.initialize('authority')

    mockState.streamingMessage.value = { ...assistantMessage('stale session-1 response'), createdAt: 1 }
    mockState.activeSendSessionId.value = 'session-2'
    mockState.activeStreamingMessage.value = { ...assistantMessage('session-2 partial response'), createdAt: 2 }
    mockState.sending.value = true

    await vi.waitFor(() => {
      expect(postedMessagesOfType('stream-snapshot').at(-1)).toEqual(expect.objectContaining({
        snapshot: expect.objectContaining({
          sessionId: 'session-2',
          sending: true,
          streamingMessage: expect.objectContaining({
            content: 'session-2 partial response',
            createdAt: 2,
          }),
        }),
      }))
    })

    store.dispose()
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('preserves loaded follower messages when authority snapshots include only metadata for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Metadata-only authority snapshots preserved the follower's local
    // selection but replaced its entire messages map. The active chat then
    // blanked and reloaded from IndexedDB after every authority heartbeat.
    mockState.activeSessionId.value = 'session-2'
    mockState.sessionMessages.value = {
      'session-2': [
        { role: 'system', content: 'chat-window' },
        { role: 'user', content: 'locally loaded history' },
      ],
    }

    const store = useChatSyncStore()
    store.initialize('follower')

    const authority = new MockBroadcastChannel('airi:stage-tamagotchi:chat-sync')
    const metadataOnlySnapshot = {
      activeSessionId: 'session-1',
      sessionMessages: {
        'session-1': [{ role: 'system', content: 'main-window' }],
      },
      sessionMetas: {
        'session-2': { sessionId: 'session-2' },
      },
    }
    authority.postMessage({
      type: 'session-snapshot',
      authorityId: 'authority',
      snapshot: metadataOnlySnapshot,
    })

    await vi.waitFor(() => {
      expect(mockState.applyRemoteSnapshot).toHaveBeenCalledTimes(1)
      expect(mockState.setActiveSessionLocally).toHaveBeenCalledWith('session-2')
    })

    authority.postMessage({
      type: 'session-snapshot',
      authorityId: 'authority',
      snapshot: metadataOnlySnapshot,
    })

    await vi.waitFor(() => {
      expect(mockState.applyRemoteSnapshot).toHaveBeenCalledTimes(2)
    })
    expect(mockState.activeSessionId.value).toBe('session-2')
    expect(mockState.sessionMessages.value).toEqual({
      'session-1': [{ role: 'system', content: 'main-window' }],
      'session-2': [
        { role: 'system', content: 'chat-window' },
        { role: 'user', content: 'locally loaded history' },
      ],
    })

    authority.close()
    store.dispose()
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('routes follower session list mutations through the authority for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // The chat window is a follower, but the session drawer created and
    // deleted sessions in its local Pinia store. The authority heartbeat then
    // replaced those changes with its unchanged snapshot. Persistent mutations
    // now execute against the authority, while selection remains window-local.
    const { authorityStore, followerStore } = initializeAuthorityAndFollower()

    const createdSessionId = await followerStore.requestCreateSession('default')
    mockState.ingest.mockResolvedValueOnce(undefined)
    await followerStore.requestIngest({
      text: 'first message in the new chat',
      sessionId: createdSessionId,
    })
    await followerStore.requestSelectSession('session-1')
    await followerStore.requestDeleteSession('session-2')

    expect(createdSessionId).toBe('session-2')
    expect(mockState.createSession).toHaveBeenCalledWith('default', { setActive: false })
    expect(mockState.setActiveSessionLocally).toHaveBeenCalledWith('session-2')
    expect(mockState.setActiveSessionLocally).toHaveBeenLastCalledWith('session-1')
    expect(mockState.deleteSession).toHaveBeenCalledWith('session-2')
    expect(mockState.loadSession).toHaveBeenCalledWith('session-2')
    expect(mockState.ingest).toHaveBeenCalledWith('first message in the new chat', expect.any(Object), 'session-2')

    const commands = postedMessagesOfType('command').map(message => message.command)
    expect(commands).toContain('create-session')
    expect(commands).toContain('delete-session')
    expect(commands).not.toContain('select-session')

    authorityStore.dispose()
    followerStore.dispose()
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('hydrates a metadata-only follower session before ingesting for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // A follower can select an older session without changing the authority's
    // active session. The authority then knows that session only from metadata;
    // ingesting before its messages load lets the orchestrator create and
    // persist a fresh system-only session over the existing history.
    mockState.sessionMetas.value['session-2'] = { sessionId: 'session-2' }
    mockState.ingest.mockResolvedValueOnce(undefined)

    let finishHydration: (() => void) | undefined
    mockState.loadSession.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishHydration = resolve
      })
      mockState.sessionMessages.value['session-2'] = [{ role: 'system', content: 'persisted history' }]
    })

    const { authorityStore, followerStore } = initializeAuthorityAndFollower()
    await followerStore.requestSelectSession('session-2')
    const pendingIngest = followerStore.requestIngest({
      text: 'continue this chat',
      sessionId: 'session-2',
    })

    await vi.waitFor(() => {
      expect(mockState.loadSession).toHaveBeenCalledWith('session-2')
    })
    expect(mockState.ingest).not.toHaveBeenCalled()

    finishHydration?.()
    await pendingIngest

    expect(mockState.ingest).toHaveBeenCalledWith('continue this chat', expect.any(Object), 'session-2')

    authorityStore.dispose()
    followerStore.dispose()
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('hydrates a metadata-only follower session before deleting a message for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Deleting from an older follower-selected session previously read the
    // authority's unloaded state. That read created a system-only session and
    // the subsequent write persisted it over the conversation being edited.
    mockState.sessionMetas.value['session-2'] = { sessionId: 'session-2' }

    let finishHydration: (() => void) | undefined
    mockState.loadSession.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishHydration = resolve
      })
      mockState.sessionMessages.value['session-2'] = [
        { role: 'system', content: 'persisted history' },
        { id: 'remove-me', role: 'user', content: 'remove this message' },
        { id: 'keep-me', role: 'assistant', content: 'keep this message' },
      ]
    })

    const { authorityStore, followerStore } = initializeAuthorityAndFollower()
    const pendingDelete = followerStore.requestDeleteMessage({
      sessionId: 'session-2',
      messageId: 'remove-me',
    })

    await vi.waitFor(() => {
      expect(mockState.loadSession).toHaveBeenCalledWith('session-2')
    })
    expect(mockState.setSessionMessages).not.toHaveBeenCalled()

    finishHydration?.()
    await pendingDelete

    expect(mockState.setSessionMessages).toHaveBeenCalledWith('session-2', [
      { role: 'system', content: 'persisted history' },
      { id: 'keep-me', role: 'assistant', content: 'keep this message' },
    ])

    authorityStore.dispose()
    followerStore.dispose()
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

  // https://github.com/moeru-ai/airi/issues/2085
  it('hydrates the targeted session before rerunning a tool call for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Tool replay previously searched the authority's unloaded fallback
    // instead of hydrating the follower-selected session that owns the call.
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
    delete mockState.sessionMessages.value['session-1']
    mockState.sessionMetas.value['session-1'] = { sessionId: 'session-1' }
    mockState.loadSession.mockImplementationOnce(async () => {
      mockState.sessionMessages.value['session-1'] = initialMessages
    })

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

    expect(mockState.loadSession).toHaveBeenCalledWith('session-1')
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
