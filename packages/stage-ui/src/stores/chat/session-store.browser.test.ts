import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, defineStore, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'

const useTestAiriCardStore = defineStore('airi-card', () => {
  const activeCardId = ref('default')
  const systemPrompt = ref('')
  return { activeCardId, systemPrompt }
})

vi.doMock('../modules/airi-card', () => {
  return {
    useAiriCardStore: useTestAiriCardStore,
  }
})

vi.mock('../../database/repos/chat-sessions.repo', () => ({
  chatSessionsRepo: {
    deleteSession: vi.fn().mockResolvedValue(undefined),
    getIndex: vi.fn().mockResolvedValue(null),
    getSession: vi.fn().mockResolvedValue(null),
    saveIndex: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../libs/product-signals', () => ({
  captureAnalyticsEvent: vi.fn(),
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
  it('initializes a follower through the canonical session action', async () => {
    // ROOT CAUSE:
    //
    // Chat initialization used the local leadership value before the Web Lock
    // election finished. A renderer that started as a follower skipped both
    // session loading and session creation, so its chat stayed on an empty
    // session id.
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

  // https://github.com/moeru-ai/airi/pull/2394#discussion_r3883360315
  it('handles the canonical session action for the surviving renderer after failover', async () => {
    // ROOT CAUSE:
    //
    // A renderer that becomes leader after a failover received the
    // synchronized state but had never hydrated a session of its own, so the
    // promoted window could observe an empty session id.
    //
    // The lifecycle observes leader promotion and calls the routed session
    // action, so the new leader resolves the canonical selection.
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderChatStore = useChatSessionStore()
    await leaderChatStore.initialize()

    const followerContext = createSyncedContext(namespace, 'follower-preferred')
    setActivePinia(followerContext.pinia)
    const followerChatStore = useChatSessionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await followerChatStore.initialize()
    await vi.waitFor(() => expect(followerChatStore.sessionMetas[followerChatStore.activeSessionId]).toBeDefined())

    const stopLeadershipListener = followerContext.runtime.onLeadershipChange((isLeader) => {
      if (isLeader)
        void followerChatStore.ensureCurrentSession()
    })

    leaderContext.runtime.dispose()
    disposePinia(leaderContext.pinia)

    await vi.waitFor(() => expect(followerContext.runtime.isLeader()).toBe(true))
    await vi.waitFor(() => expect(followerChatStore.activeSessionId).not.toBe(''))

    expect(followerChatStore.sessionMetas[followerChatStore.activeSessionId]).toBeDefined()
    expect(Object.keys(followerChatStore.index?.characters.default?.sessions ?? {})).toHaveLength(1)
    stopLeadershipListener()
  })
})
