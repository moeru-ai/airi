import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ChatSessionMeta } from '../../types/chat-session'

import { createPinia, defineStore, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'

const useTestAuthStore = defineStore('auth', () => {
  const userId = ref('local')
  const token = ref<string | null>(null)
  return { userId, token }
}, {
  synced: { state: true },
})

const useTestAiriCardStore = defineStore('airi-card', () => {
  const activeCardId = ref('default')
  const systemPrompt = ref('')
  return { activeCardId, systemPrompt }
})

vi.doMock('../auth', () => {
  return {
    useAuthStore: useTestAuthStore,
  }
})

vi.doMock('../modules/airi-card', () => {
  return {
    useAiriCardStore: useTestAiriCardStore,
  }
})

vi.mock('../../database/repos/chat-sessions.repo', () => ({
  chatSessionsRepo: {
    addTombstone: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    dequeueOutbox: vi.fn().mockResolvedValue(undefined),
    dropOutboxForSession: vi.fn().mockResolvedValue(undefined),
    enqueueOutbox: vi.fn().mockResolvedValue(undefined),
    getIndex: vi.fn().mockResolvedValue(null),
    getOutbox: vi.fn().mockResolvedValue([]),
    getSession: vi.fn().mockResolvedValue(null),
    getTombstones: vi.fn().mockResolvedValue([]),
    removeTombstones: vi.fn().mockResolvedValue(undefined),
    saveIndex: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockResolvedValue(undefined),
    updateOutboxEntries: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../libs/product-signals', () => ({
  captureAnalyticsEvent: vi.fn(),
}))

vi.mock('../../libs/auth-fetch', () => ({
  authedFetch: vi.fn(),
}))

vi.mock('../../libs/server', () => ({
  SERVER_URL: 'http://test',
}))

const chatSyncMocks = vi.hoisted(() => ({
  clients: [] as Array<{
    connect: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock('../../libs/chat-sync', () => ({
  applyCreateActions: vi.fn().mockResolvedValue([]),
  createCloudChatMapper: () => ({
    deleteChat: vi.fn().mockResolvedValue(undefined),
    listChats: vi.fn().mockResolvedValue([]),
  }),
  createChatWsClient: () => {
    const client = {
      connect: vi.fn(),
      destroy: vi.fn(),
      disconnect: vi.fn(),
      onNewMessages: () => () => {},
      onStatusChange: () => () => {},
      pullMessages: vi.fn().mockResolvedValue({ messages: [], seq: 0 }),
      sendMessages: vi.fn().mockResolvedValue({ ok: true }),
      status: () => 'idle',
    }
    chatSyncMocks.clients.push(client)
    return client
  },
  extractMessageText: () => '',
  isCloudSyncableMessage: () => false,
  mergeCloudMessagesIntoLocal: () => ({ dirty: false, messages: [], maxSeq: 0 }),
  reconcileLocalAndRemote: () => ({ adopt: [], claim: [], create: [] }),
}))

const { useChatSessionStore } = await import('./session-store')

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

afterEach(() => {
  for (const context of syncedContexts.splice(0)) {
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
  chatSyncMocks.clients.length = 0
})

describe('chat session synchronization', () => {
  it('recovers one persistent external session through the leader without changing local selection', async () => {
    const namespace = `chat-binding:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const leader = useChatSessionStore(leaderContext.pinia)
    await leader.initialize()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    const follower = useChatSessionStore(followerContext.pinia)
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await follower.initialize()
    const selected = follower.activeSessionId
    const [first, second] = await Promise.all([
      follower.ensureBoundSession('discord:channel:a'),
      follower.ensureBoundSession('discord:channel:a'),
    ])

    expect(first).toBe(second)
    expect(first).not.toBe(selected)
    expect(follower.activeSessionId).toBe(selected)
    expect(leader.sessionMetas[first]?.bindings).toEqual(['discord:channel:a'])
    expect(Object.values(leader.sessionMetas).filter(meta => meta.bindings?.includes('discord:channel:a'))).toHaveLength(1)

    const other = await follower.ensureBoundSession('discord:channel:b')
    expect(other).not.toBe(first)
    leader.appendSessionMessage(first, { id: 'external-input', role: 'user', content: 'hello from A' })
    await vi.waitFor(() => expect(follower.sessionMessages[first]?.at(-1)?.content).toBe('hello from A'))

    const fork = await follower.forkSession({ fromSessionId: first, reason: 'follow-up', hidden: true })
    expect(leader.sessionMetas[fork]?.parentSessionId).toBe(first)
    expect(leader.sessionMetas[fork]?.forkReason).toBe('follow-up')
    expect(leader.sessionMetas[fork]?.hidden).toBe(true)
    expect(leader.sessionMetas[fork]?.characterId).toBe('default')
  })

  // ROOT CAUSE:
  // A fork had no bindings, so it read the owner's private scene from a channel history.
  // Recovery also ignored what a history had read, so a narrowed history could return to its channel.
  it('keeps forks in their scene and recovers a scene only into a compatible root session', async () => {
    const namespace = `chat-audience:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const store = useChatSessionStore(leaderContext.pinia)
    await store.initialize()
    const channel = { kind: 'subjects' as const, subjects: ['discord:channel:a:members', 'user:owner'] }

    const root = await store.ensureBoundSession('discord:channel:a')
    expect(store.getSessionAudience(root)).toEqual(channel)
    expect(store.getSessionAudience(store.activeSessionId)).toEqual({ kind: 'subjects', subjects: ['user:owner'] })

    const fork = await store.forkSession({ fromSessionId: root, hidden: true })
    expect(store.sessionMetas[fork]?.bindings).toEqual(['discord:channel:a'])
    expect(store.getSessionAudience(fork)).toEqual(channel)
    expect(await store.ensureBoundSession('discord:channel:a')).toBe(root)

    // The history read an owner-only record, so it can no longer serve the channel.
    await store.narrowSessionAudience(root, { kind: 'subjects', subjects: ['user:owner'] })
    expect(store.getSessionAudience(root)).toEqual({ kind: 'subjects', subjects: ['user:owner'] })
    await store.narrowSessionAudience(root, channel)
    expect(store.getSessionAudience(root)).toEqual({ kind: 'subjects', subjects: ['user:owner'] })
    const next = await store.ensureBoundSession('discord:channel:a')
    expect(next).not.toBe(root)
    expect(next).not.toBe(fork)
    expect(store.getSessionAudience(next)).toEqual(channel)
  })

  it('initializes a follower through the canonical session action', async () => {
    // ROOT CAUSE:
    //
    // Chat initialization used the local leadership value before the Web Lock
    // election finished. A renderer that started as a follower skipped both
    // session loading and session creation. A later leadership update only
    // started cloud sync, so anonymous chat kept an empty session id.
    //
    // Initialization now calls a synchronized action. The plugin routes the
    // stateful work to the leader and returns the canonical session id. Each
    // window stores that id as its local selection.
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderChatStore = useChatSessionStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerChatStore = useChatSessionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    await followerChatStore.initialize()

    expect(followerChatStore.activeSessionId).not.toBe('')
    expect(followerChatStore.activeSessionId).toBe(leaderChatStore.index?.characters.default?.activeSessionId)
    expect(followerChatStore.sessionMetas[followerChatStore.activeSessionId]).toBeDefined()
    expect(Object.keys(leaderChatStore.index?.characters.default?.sessions ?? {})).toHaveLength(1)
  })

  // https://github.com/moeru-ai/airi/issues/2595
  it('keeps a new conversation selected after its first synchronized message for Issue #2595', async () => {
    // ROOT CAUSE:
    //
    // The leader creates the session while the caller selects it locally.
    // The first message then synchronizes a new index ref. An index watcher
    // treated that data update as navigation and restored the old session.
    // Shared index updates no longer control window-local navigation.
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderChatStore = useChatSessionStore()
    await leaderChatStore.initialize()
    const previousSessionId = leaderChatStore.activeSessionId

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerChatStore = useChatSessionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await followerChatStore.initialize()

    const newSessionId = await followerChatStore.createSession('default', { setActive: false })
    await followerChatStore.setActiveSession(newSessionId)
    followerChatStore.appendSessionMessage(newSessionId, {
      id: 'first-user-message',
      role: 'user',
      content: 'Hello',
    })

    await vi.waitFor(() => expect(leaderChatStore.sessionMessages[newSessionId]).toHaveLength(2))
    await vi.waitFor(() => expect(followerChatStore.sessionMessages[newSessionId]).toHaveLength(2))

    expect(previousSessionId).not.toBe(newSessionId)
    expect(followerChatStore.activeSessionId).toBe(newSessionId)
  })

  it('keeps the leader chat snapshot when new followers receive the auth identity', async () => {
    // ROOT CAUSE:
    //
    // A new settings renderer received the synchronized auth identity after
    // its chat-session store was created. Its local userId watcher cleared the
    // synchronized chat state and proposed that empty snapshot to the leader.
    //
    // The follower routes its observed auth transition to the synchronized
    // identity action. The leader keeps its matching snapshot unchanged.
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderAuthStore = useTestAuthStore()
    leaderAuthStore.userId = 'cloud-user'
    const leaderChatStore = useChatSessionStore()

    const session: ChatSessionMeta = {
      sessionId: 'session-a',
      userId: 'cloud-user',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    leaderChatStore.$patch({
      index: {
        userId: 'cloud-user',
        characters: {
          default: {
            activeSessionId: 'session-a',
            sessions: { 'session-a': session },
          },
        },
      },
      sessionMessages: {
        'session-a': [{ id: 'message-a', role: 'user', content: 'Keep this message' }],
      },
      sessionMetas: { 'session-a': session },
    })

    let leaderIdentityActions = 0
    let leaderMutations = 0
    leaderChatStore.$onAction(({ name }) => {
      if (name === 'activateCurrentUser')
        leaderIdentityActions++
    })
    leaderChatStore.$subscribe(() => leaderMutations++)

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerChatStore = useChatSessionStore()
    const followerAuthStore = useTestAuthStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerAuthStore.userId).toBe('cloud-user'))
    await vi.waitFor(() => expect(followerChatStore.sessionMessages['session-a']).toHaveLength(1))

    const secondFollowerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(secondFollowerContext.pinia)
    const secondFollowerChatStore = useChatSessionStore()
    const secondFollowerAuthStore = useTestAuthStore()
    await vi.waitFor(() => expect(secondFollowerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(secondFollowerAuthStore.userId).toBe('cloud-user'))
    await vi.waitFor(() => expect(secondFollowerChatStore.sessionMessages['session-a']).toHaveLength(1))
    await Promise.resolve()

    expect(leaderChatStore.sessionMessages['session-a']?.[0]?.id).toBe('message-a')
    expect(followerChatStore.sessionMessages['session-a']?.[0]?.id).toBe('message-a')
    expect(leaderChatStore.index?.userId).toBe('cloud-user')
    expect(followerChatStore.index?.userId).toBe('cloud-user')
    expect(secondFollowerChatStore.sessionMessages['session-a']?.[0]?.id).toBe('message-a')
    expect(leaderIdentityActions).toBe(2)
    expect(leaderMutations).toBe(0)
  })

  // https://github.com/moeru-ai/airi/pull/2394#discussion_r3883360315
  it('keeps synchronized state unchanged when a follower disposes local consumers', async () => {
    // ROOT CAUSE:
    //
    // Follower disposal used the cloud teardown path, which changed the
    // synchronized cloudSyncReady ref. The synchronization plugin then sent
    // the follower's full, potentially stale snapshot to the leader.
    //
    // Follower disposal now destroys only its window-local cloud runtime.
    // Leader-owned actions remain responsible for synchronized state changes.
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderChatStore = useChatSessionStore()
    leaderChatStore.$patch({ cloudSyncReady: true })

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerChatStore = useChatSessionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerChatStore.cloudSyncReady).toBe(true))

    let leaderMutations = 0
    leaderChatStore.$subscribe(() => leaderMutations++)

    followerChatStore.dispose()
    await Promise.resolve()

    expect(followerChatStore.cloudSyncReady).toBe(true)
    expect(leaderChatStore.cloudSyncReady).toBe(true)
    expect(leaderMutations).toBe(0)
  })

  // https://github.com/moeru-ai/airi/pull/2394#discussion_r3883162024
  it('starts a new cloud consumer after leader failover', async () => {
    // ROOT CAUSE:
    //
    // The cloud WebSocket belongs to the elected renderer. If that renderer
    // closed, the next leader received the synchronized state but no action
    // restarted its local WebSocket.
    //
    // The chat lifecycle now observes leader promotion and calls the routed
    // session action. The new leader then starts its local cloud consumer.
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderAuthStore = useTestAuthStore()
    leaderAuthStore.userId = 'cloud-user'
    leaderAuthStore.token = 'cloud-token'
    const leaderChatStore = useChatSessionStore()
    await leaderChatStore.initialize()
    expect(chatSyncMocks.clients).toHaveLength(1)

    const followerContext = createSyncedContext(namespace, 'follower-preferred')
    setActivePinia(followerContext.pinia)
    const followerAuthStore = useTestAuthStore()
    const followerChatStore = useChatSessionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerAuthStore.userId).toBe('cloud-user'))
    await followerChatStore.initialize()

    const stopLeadershipListener = followerContext.runtime.onLeadershipChange((isLeader) => {
      if (isLeader)
        void followerChatStore.ensureCurrentSession()
      else
        followerChatStore.dispose()
    })

    leaderChatStore.dispose()
    leaderContext.runtime.dispose()
    disposePinia(leaderContext.pinia)

    await vi.waitFor(() => expect(followerContext.runtime.isLeader()).toBe(true))
    await vi.waitFor(() => expect(chatSyncMocks.clients).toHaveLength(2))

    expect(chatSyncMocks.clients[0]?.destroy).toHaveBeenCalledOnce()
    expect(chatSyncMocks.clients[1]?.connect).toHaveBeenCalledOnce()
    stopLeadershipListener()
  })
})
