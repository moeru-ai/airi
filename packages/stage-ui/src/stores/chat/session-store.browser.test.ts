import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ChatSessionMeta } from '../../types/chat-session'

import { createPinia, defineStore, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'

const useTestAuthStore = defineStore('auth', () => {
  const userId = ref('local')
  const token = ref<string | null>(null)

  async function setIdentity(nextUserId: string) {
    userId.value = nextUserId
  }

  return { setIdentity, userId, token }
}, {
  synced: {
    actions: ['setIdentity'],
    state: true,
  },
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

vi.mock('../../libs/analytics', () => ({
  captureAnalyticsEvent: vi.fn(),
}))

vi.mock('../../libs/auth-fetch', () => ({
  authedFetch: vi.fn(),
}))

vi.mock('../../libs/server', () => ({
  SERVER_URL: 'http://test',
}))

vi.mock('../../libs/chat-sync', () => ({
  applyCreateActions: vi.fn().mockResolvedValue([]),
  createCloudChatMapper: () => ({
    deleteChat: vi.fn().mockResolvedValue(undefined),
    listChats: vi.fn().mockResolvedValue([]),
  }),
  createChatWsClient: () => ({
    connect: vi.fn(),
    destroy: vi.fn(),
    disconnect: vi.fn(),
    onNewMessages: () => () => {},
    onStatusChange: () => () => {},
    pullMessages: vi.fn().mockResolvedValue({ messages: [], seq: 0 }),
    sendMessages: vi.fn().mockResolvedValue({ ok: true }),
    status: () => 'idle',
  }),
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
})

describe('chat session synchronization', () => {
  it('keeps the leader chat snapshot when a new follower receives the auth identity', async () => {
    // ROOT CAUSE:
    //
    // A new settings renderer received the synchronized auth identity after
    // its chat-session store was created. Its local userId watcher cleared the
    // synchronized chat state and proposed that empty snapshot to the leader.
    //
    // Chat identity work now follows the committed auth action in the leader.
    // Applying that action's snapshot in a follower does not run another action
    // or propose another chat mutation.
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderAuthStore = useTestAuthStore()
    const leaderChatStore = useChatSessionStore()
    await leaderAuthStore.setIdentity('cloud-user')
    await vi.waitFor(() => expect(leaderChatStore.index).toBeNull())

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

    let leaderActions = 0
    let leaderMutations = 0
    leaderChatStore.$onAction(() => leaderActions++)
    leaderChatStore.$subscribe(() => leaderMutations++)

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerAuthStore = useTestAuthStore()
    const followerChatStore = useChatSessionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerAuthStore.userId).toBe('cloud-user'))
    await vi.waitFor(() => expect(followerChatStore.sessionMessages['session-a']).toHaveLength(1))
    await Promise.resolve()

    expect(leaderChatStore.sessionMessages['session-a']?.[0]?.id).toBe('message-a')
    expect(followerChatStore.sessionMessages['session-a']?.[0]?.id).toBe('message-a')
    expect(leaderChatStore.index?.userId).toBe('cloud-user')
    expect(followerChatStore.index?.userId).toBe('cloud-user')
    expect(leaderActions).toBe(0)
    expect(leaderMutations).toBe(0)
  })
})
