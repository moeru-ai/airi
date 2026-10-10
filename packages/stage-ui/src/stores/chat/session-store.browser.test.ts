import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ChatSessionMeta } from '../../types/chat-session'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { useAuthStore } from '../auth'
import { useAiriCardStore } from '../modules/airi-card'

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
  enableAnalytics: vi.fn(() => false),
  getAnalytics: vi.fn(),
  getAnalyticsPrivacyPolicyUrl: vi.fn(),
  isAnalyticsAvailableInBuild: vi.fn(() => false),
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

vi.mock('../../libs/chat-sync', async importOriginal => ({
  ...await importOriginal<typeof import('../../libs/chat-sync')>(),
  createCloudChatMapper: () => ({
    deleteChat: vi.fn().mockResolvedValue(undefined),
    createChat: async (options: { id: string }) => ({ id: options.id, type: 'bot', title: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
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
}))

const { useChatSessionStore } = await import('./session-store')

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
  app: ReturnType<typeof createApp>
  container: HTMLDivElement
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  const card = {
    name: 'Character',
    version: '1.0',
    extensions: { airi: { agents: {}, modules: {
      consciousness: { provider: '', model: '' },
      vision: { provider: '', model: '' },
      speech: { provider: '', model: '', voice_id: '' },
    } } },
  }
  localStorage.setItem('airi-cards', JSON.stringify([['default', card], ['background-character', card]]))
  const app = createApp(defineComponent({ setup() {
    useAuthStore()
    useAiriCardStore()
    return () => h('div')
  } }))
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  const container = document.createElement('div')
  document.body.append(container)
  app.mount(container)
  syncedContexts.push({ pinia, runtime, app, container })
  return { pinia, runtime }
}

afterEach(() => {
  for (const context of syncedContexts.splice(0)) {
    context.app.unmount()
    context.container.remove()
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
  chatSyncMocks.clients.length = 0
  localStorage.clear()
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
    expect(leader.sessionMetas[fork]?.hidden).toBe(true)
    expect(leader.sessionMetas[fork]?.characterId).toBe('default')
  })

  // A background task keeps its status in its own session, so every window lists it and a restart still knows how it ended.
  it('records a background task status through the leader for every window', async () => {
    const namespace = `chat-task:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const leader = useChatSessionStore(leaderContext.pinia)
    await leader.initialize()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    const follower = useChatSessionStore(followerContext.pinia)
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await follower.initialize()

    const task = await follower.createSession('default', { setActive: false, hidden: true, recipeId: 'user:research', task: { status: 'armed', startedAt: 1 } })
    expect(await follower.setSessionTask(task, { status: 'running' }, ['armed'])).toBe(true)

    // ROOT CAUSE:
    // A stop and a natural end both read `running` before either write landed, so a stopped task still reported done.
    // The check and the write now run in one step, so exactly one change wins.
    const [stopped, finished] = await Promise.all([
      follower.setSessionTask(task, { status: 'interrupted', endedAt: 2 }, ['armed', 'running']),
      follower.setSessionTask(task, { status: 'done', endedAt: 3 }, ['running']),
    ])
    expect([stopped, finished].filter(Boolean)).toHaveLength(1)
    expect(leader.sessionMetas[task]?.task).toEqual(stopped ? { status: 'interrupted', startedAt: 1, endedAt: 2 } : { status: 'done', startedAt: 1, endedAt: 3 })
    await vi.waitFor(() => expect(follower.sessionMetas[task]?.task).toEqual(leader.sessionMetas[task]?.task))
    expect(await follower.setSessionTask('missing-session', { status: 'done' })).toBe(false)
  })

  // ROOT CAUSE:
  // Background tasks were deleted through deleteSession, which moved the character's selected conversation to the first remaining session,
  // a hidden one included, and created a replacement when none remained.
  it('deletes a hidden task session without moving the selected conversation', async () => {
    const namespace = `chat-task-delete:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const store = useChatSessionStore(leaderContext.pinia)
    await store.initialize()

    const selected = store.activeSessionId
    const task = await store.createSession('default', { setActive: false, hidden: true, recipeId: 'user:check', task: { status: 'done', startedAt: 1 } })
    const sessionCount = Object.keys(store.sessionMetas).length

    expect(await store.deleteHiddenSession(selected)).toBe(false)
    expect(await store.deleteHiddenSession(task)).toBe(true)

    expect(store.sessionMetas[task]).toBeUndefined()
    expect(Object.keys(store.sessionMetas)).toHaveLength(sessionCount - 1)
    expect(store.activeSessionId).toBe(selected)
    expect(store.index?.characters.default?.activeSessionId).toBe(selected)
  })

  it('never selects a hidden task session after the selected conversation is deleted', async () => {
    const namespace = `chat-delete-fallback:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const store = useChatSessionStore(leaderContext.pinia)
    await store.initialize()

    const selected = store.activeSessionId
    const task = await store.createSession('default', { setActive: false, hidden: true, recipeId: 'user:check', task: { status: 'done', startedAt: 1 } })
    await store.deleteSession(selected)

    expect(store.activeSessionId).not.toBe(task)
    expect(store.sessionMetas[store.activeSessionId]?.hidden).toBeFalsy()
    expect(store.index?.characters.default?.activeSessionId).toBe(store.activeSessionId)
  })

  // ROOT CAUSE:
  // A fork had no bindings, so it read the owner's private scene from a channel history.
  it('keeps forks in their scene and recovers a scene only into its root session', async () => {
    const namespace = `chat-binding:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const store = useChatSessionStore(leaderContext.pinia)
    await store.initialize()

    const root = await store.ensureBoundSession('discord:channel:a')
    const fork = await store.forkSession({ fromSessionId: root, hidden: true })

    expect(store.sessionMetas[fork]?.bindings).toEqual(['discord:channel:a'])
    expect(await store.ensureBoundSession('discord:channel:a')).toBe(root)
    // The persisted meta must be a plain copy. IndexedDB refuses to clone a Vue proxy, and the repository mock never clones.
    const persisted = vi.mocked(chatSessionsRepo.saveSession).mock.lastCall?.[1]
    expect(() => structuredClone(persisted)).not.toThrow()
  })

  it('routes concurrent follower wake requests to one character session without navigating either window', async () => {
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    setActivePinia(leader.pinia)
    const leaderStore = useChatSessionStore()
    await leaderStore.initialize()
    const foreground = leaderStore.activeSessionId
    const follower = createSyncedContext(namespace, 'follower-only')
    setActivePinia(follower.pinia)
    const followerStore = useChatSessionStore()
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    await followerStore.initialize()
    const [first, second] = await Promise.all([
      followerStore.ensureCharacterSession('background-character'),
      followerStore.ensureCharacterSession('background-character'),
    ])
    expect(first).toBe(second)
    expect(leaderStore.sessionMetas[first]?.characterId).toBe('background-character')
    expect(leaderStore.activeSessionId).toBe(foreground)
    expect(followerStore.activeSessionId).toBe(foreground)
    await expect(followerStore.ensureCharacterSession('missing')).rejects.toThrow('unavailable')
  })

  it('persists follower interruption retries once and preserves the first control event', async () => {
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    setActivePinia(leader.pinia)
    const leaderStore = useChatSessionStore()
    await leaderStore.initialize()
    const follower = createSyncedContext(namespace, 'follower-only')
    setActivePinia(follower.pinia)
    const followerStore = useChatSessionStore()
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    await followerStore.initialize()
    const sessionId = followerStore.activeSessionId
    const before = leaderStore.getSessionMessages(sessionId).length
    const event = { eventId: 'interrupt-once', turn: { sessionId, turnId: 'reply' }, cause: 'button', playback: { groupId: 'audio', status: 'silent' as const, played: [] } }
    const persisted = Promise.withResolvers<void>()
    let cloneError: unknown
    vi.mocked(chatSessionsRepo.saveSession).mockImplementationOnce((_sessionId, record) => {
      try {
        structuredClone(record)
      }
      catch (error) {
        cloneError = error
      }
      return persisted.promise
    })
    let settled = false
    const receiving = followerStore.recordInterruption(event).then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(leaderStore.sessionMetas[sessionId]?.controlEvents).toHaveLength(1))
    expect(settled).toBe(false)
    persisted.resolve()
    await receiving
    expect(cloneError).toBeUndefined()
    await followerStore.recordInterruption({ ...event, cause: 'retry' })
    expect(leaderStore.sessionMetas[sessionId]?.controlEvents).toEqual([event])
    expect(leaderStore.getSessionMessages(sessionId)).toHaveLength(before)
    await vi.waitFor(() => expect(followerStore.sessionMetas[sessionId]?.controlEvents).toEqual([event]))
  })

  it('acknowledges a follower submission after storage and deduplicates its retry', async () => {
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    setActivePinia(leader.pinia)
    const leaderStore = useChatSessionStore()
    await leaderStore.initialize()
    const follower = createSyncedContext(namespace, 'follower-only')
    setActivePinia(follower.pinia)
    const followerStore = useChatSessionStore()
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    await followerStore.initialize()
    const sessionId = followerStore.activeSessionId
    const stored = Promise.withResolvers<void>()
    const saving = vi.mocked(chatSessionsRepo.saveSession).mockImplementationOnce(async () => stored.promise)
    const priorWrites = saving.mock.calls.length
    const message = { id: 'voice-submission', role: 'user' as const, content: 'Voice message' }
    let acknowledged = false
    const request = followerStore.commitUserMessage(sessionId, message).then((receipt) => {
      acknowledged = true
      return receipt
    })
    try {
      await vi.waitFor(() => expect(saving.mock.calls.length).toBe(priorWrites + 1))
      expect(acknowledged).toBe(false)
    }
    finally {
      stored.resolve()
    }
    expect(await request).toEqual({ status: 'inserted', messageId: 'voice-submission' })
    expect(await followerStore.commitUserMessage(sessionId, message)).toEqual({ status: 'existing', messageId: 'voice-submission' })
    expect(leaderStore.getSessionMessages(sessionId).filter(item => item.id === message.id)).toHaveLength(1)
    await vi.waitFor(() => expect(followerStore.getSessionMessages(sessionId).filter(item => item.id === message.id)).toHaveLength(1))
  })

  it('rejects a storage receipt when its session is deleted during persistence', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const entered = Promise.withResolvers<void>()
    const stored = Promise.withResolvers<void>()
    vi.mocked(chatSessionsRepo.saveSession).mockImplementationOnce(async () => {
      entered.resolve()
      await stored.promise
    })
    const committing = store.commitUserMessage(sessionId, { id: 'removed-input', role: 'user', content: 'Hello' })
    const rejected = expect(committing).rejects.toThrow('Chat session changed before message persistence completed')
    await entered.promise
    const deleting = store.deleteSession(sessionId)
    stored.resolve()
    await rejected
    await deleting
    expect(store.sessionMetas[sessionId]).toBeUndefined()
  })

  it('initializes a follower through the canonical session action', async () => {
    // ROOT CAUSE: Initialization before leader election left followers without a session. Initialization now invokes the synchronized session action and stores its canonical result as the local selection.
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

    // A session stores no system snapshot, so its first message is the user's.
    await vi.waitFor(() => expect(leaderChatStore.sessionMessages[newSessionId]).toHaveLength(1))
    await vi.waitFor(() => expect(followerChatStore.sessionMessages[newSessionId]).toHaveLength(1))

    expect(previousSessionId).not.toBe(newSessionId)
    expect(followerChatStore.activeSessionId).toBe(newSessionId)
  })

  it('keeps the leader chat snapshot when new followers receive the auth identity', async () => {
    // ROOT CAUSE: A follower cleared shared state after receiving auth identity. The identity watcher now invokes the synchronized action, which retains matching leader data.
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderAuthStore = useAuthStore()
    leaderAuthStore.user = { id: 'cloud-user', name: 'User', email: 'user@example.test', emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0) }
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
    const followerAuthStore = useAuthStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerAuthStore.userId).toBe('cloud-user'))
    await vi.waitFor(() => expect(followerChatStore.sessionMessages['session-a']).toHaveLength(1))

    const secondFollowerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(secondFollowerContext.pinia)
    const secondFollowerChatStore = useChatSessionStore()
    const secondFollowerAuthStore = useAuthStore()
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
    const leaderAuthStore = useAuthStore()
    leaderAuthStore.user = { id: 'cloud-user', name: 'User', email: 'user@example.test', emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0) }
    leaderAuthStore.token = 'cloud-token'
    const leaderChatStore = useChatSessionStore()
    await leaderChatStore.initialize()
    expect(chatSyncMocks.clients).toHaveLength(1)

    const followerContext = createSyncedContext(namespace, 'follower-preferred')
    setActivePinia(followerContext.pinia)
    const followerAuthStore = useAuthStore()
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
