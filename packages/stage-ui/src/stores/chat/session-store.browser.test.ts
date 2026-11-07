import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ChatSessionMeta } from '../../types/chat-session'

import en from '@proj-airi/i18n/locales/en'

import { DEFAULT_SESSION_FEATURES } from '@proj-airi/core-agent'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { createApp, defineComponent, effectScope, h, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SessionFeatureSettings from '../../components/scenarios/chat/components/session-feature-settings.vue'
import SessionsDialog from '../../components/scenarios/chat/components/sessions-dialog.vue'

import { useSessionOutputFeatures } from '../../composables/session-output-features'
import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { useLlmToolsStore } from '../ai/chat-llm/tools'
import { useAuthStore } from '../auth'
import { useMemoryStore } from '../memory'
import { useAiriCardStore } from '../modules/airi-card'
import { useHomeAssistantStore } from '../modules/home-assistant'
import { useStickersStore } from '../modules/stickers'
import { useVisionStore } from '../modules/vision'
import { useWebSearchStore } from '../modules/web-search'
import { useSyncPreferencesStore } from '../sync-preferences'
import { useChatFeaturesStore } from './features-store'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

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
    updateChat: vi.fn().mockResolvedValue(undefined),
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

  it('keeps a message that the leader commits while a follower reads the session', async () => {
    // ROOT CAUSE:
    //
    // Reading an empty session wrote it. The follower then proposed its session state without the committed message,
    // and the leader applied that proposal after the commit.
    //
    // Before the fix, both copies lost the user message.
    //
    // The fix makes reads pure.
    const namespace = `chat-read:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const leader = useChatSessionStore(leaderContext.pinia)
    await leader.initialize()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    const follower = useChatSessionStore(followerContext.pinia)
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await follower.initialize()
    const sessionId = await follower.createSession('default')
    await vi.waitFor(() => expect(follower.sessionMessages[sessionId]).toEqual([]))

    expect(follower.getSessionMessages(sessionId)).toEqual([])
    expect(follower.getSessionGeneration(sessionId)).toBe(leader.getSessionGeneration(sessionId))
    await follower.commitUserMessage(sessionId, { id: 'user-1', role: 'user', content: 'hello', createdAt: 1 })
    await follower.storeMessage(sessionId, { id: 'assistant-1', role: 'assistant', content: 'hi', slices: [], tool_results: [], createdAt: 2 })
    // A retried store replaces the message, so the history keeps one copy.
    await follower.storeMessage(sessionId, { id: 'assistant-1', role: 'assistant', content: 'hi there', slices: [], tool_results: [], createdAt: 2 })

    const expected = [
      { id: 'user-1', role: 'user', content: 'hello', createdAt: 1 },
      { id: 'assistant-1', role: 'assistant', content: 'hi there', slices: [], tool_results: [], createdAt: 2 },
    ]
    await vi.waitFor(() => expect(follower.sessionMessages[sessionId]).toEqual(expected))
    // A late proposal would arrive within a commit task. Give it time, then check both copies again.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(leader.sessionMessages[sessionId]).toEqual(expected)
    expect(follower.sessionMessages[sessionId]).toEqual(expected)
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

    const task = await follower.createSession('default', { setActive: false, hidden: true, recipeId: 'user:research', task: { status: 'running', startedAt: 1 } })
    expect(await follower.setSessionTask(task, { status: 'done' }, ['interrupted'])).toBe(false)

    // ROOT CAUSE:
    // A stop and a natural end both read `running` before either write landed, so a stopped task still reported done.
    // The check and the write now run in one step, so exactly one change wins.
    const [stopped, finished] = await Promise.all([
      follower.setSessionTask(task, { status: 'interrupted', endedAt: 2 }, ['running']),
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

  it('closes and opens the cloud connection of the leader when a follower changes the chat sync switch', async () => {
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderAuthStore = useAuthStore()
    leaderAuthStore.user = { id: 'cloud-user', name: 'User', email: 'user@example.test', emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0) }
    leaderAuthStore.token = 'cloud-token'
    await useChatSessionStore().initialize()
    expect(chatSyncMocks.clients).toHaveLength(1)

    const followerContext = createSyncedContext(namespace, 'follower-preferred')
    setActivePinia(followerContext.pinia)
    useChatSessionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    const followerSyncPreferences = useSyncPreferencesStore(followerContext.pinia)

    followerSyncPreferences.setEnabled('chats', false)
    await vi.waitFor(() => expect(chatSyncMocks.clients[0]?.destroy).toHaveBeenCalledOnce())
    expect(chatSyncMocks.clients).toHaveLength(1)

    followerSyncPreferences.setEnabled('chats', true)
    await vi.waitFor(() => expect(chatSyncMocks.clients).toHaveLength(2))
    expect(chatSyncMocks.clients[1]?.connect).toHaveBeenCalledOnce()
  })
})

describe('conversation feature inheritance', () => {
  it('uses existing module preferences as defaults and resets only the conversation exceptions', async () => {
    const context = createSyncedContext(`chat-module-defaults:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    const sessions = useChatSessionStore(context.pinia)
    await sessions.initialize()
    const memory = useMemoryStore(context.pinia)
    const stickers = useStickersStore(context.pinia)
    memory.enabled = false
    stickers.enabled = false
    const inherited = await sessions.createSession('default')
    const custom = await sessions.createSession('default', { features: { memory: 'read', stickers: true } })
    expect(sessions.sessionFeatures[inherited]?.memory).toBe('off')
    expect(sessions.sessionFeatures[inherited]?.stickers).toBe(false)
    expect(sessions.sessionFeatures[custom]?.memory).toBe('read')
    expect(sessions.sessionFeatures[custom]?.stickers).toBe(true)
    memory.enabled = true
    stickers.enabled = true
    await sessions.setSessionFeatures(custom, { memory: 'off', stickers: false })
    expect(sessions.sessionFeatures[inherited]?.memory).toBe('write')
    expect(sessions.sessionFeatures[inherited]?.stickers).toBe(true)
    expect(sessions.sessionFeatures[custom]?.memory).toBe('off')
    expect(sessions.sessionFeatures[custom]?.stickers).toBe(false)
    await sessions.setSessionFeatures(custom)
    expect(sessions.sessionMetas[custom]?.features).toBeUndefined()
    expect(sessions.sessionFeatures[custom]).toEqual(sessions.sessionFeatures[inherited])
    expect(memory.enabled).toBe(true)
    expect(stickers.enabled).toBe(true)
  })

  it('synchronizes individual tool choices without fixing their sibling sources', async () => {
    const namespace = `chat-tool-choices:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const leader = useChatSessionStore(leaderContext.pinia)
    await leader.initialize()
    const followerContext = createSyncedContext(namespace, 'follower-only')
    const follower = useChatSessionStore(followerContext.pinia)
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await follower.initialize()
    const sessionId = await follower.createSession('default', { setActive: false })
    await follower.setSessionFeatures(sessionId, { tools: { mcp: false } })
    await follower.setSessionFeatures(sessionId, { tools: { 'web-search': false } })
    await vi.waitFor(() => expect(leader.sessionMetas[sessionId]?.features?.tools).toEqual({ 'mcp': false, 'web-search': false }))
    expect(follower.sessionFeatures[sessionId]?.tools).toContain('plugins')
    await leader.setSessionFeatures(sessionId, { tools: { plugins: false } })
    await vi.waitFor(() => expect(follower.sessionFeatures[sessionId]?.tools).not.toContain('plugins'))
    await follower.setSessionFeatures(sessionId, {}, ['tools.mcp'])
    expect(follower.sessionMetas[sessionId]?.features?.tools).toEqual({ 'plugins': false, 'web-search': false })
    expect(follower.sessionFeatures[sessionId]?.tools).toContain('mcp')
    await follower.setSessionFeatures(sessionId)
    expect(follower.sessionMetas[sessionId]?.features).toBeUndefined()
    expect(follower.sessionFeatures[sessionId]?.tools).toEqual(DEFAULT_SESSION_FEATURES.tools)
  })

  it('persists explicit choices through the leader, follows defaults, and restores individual choices without a feedback write', async () => {
    const namespace = `chat-features:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    const leader = useChatSessionStore(leaderContext.pinia)
    await leader.initialize()
    const followerContext = createSyncedContext(namespace, 'follower-only')
    const follower = useChatSessionStore(followerContext.pinia)
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await follower.initialize()
    const defaults = useChatFeaturesStore(leaderContext.pinia)
    defaults.resetState()
    const first = await follower.createSession('default', { setActive: false, features: { speech: false, memory: 'read' } })
    const second = await follower.createSession('default', { setActive: false })
    const selected = follower.activeSessionId

    defaults.setDefaults({ reactions: false, tasks: false })
    await vi.waitFor(() => expect(follower.sessionFeatures[second]?.reactions).toBe(false))
    expect(follower.sessionFeatures[first]?.memory).toBe('read')
    await follower.setSessionFeatures(first, { reactions: true })
    await vi.waitFor(() => expect(leader.sessionMetas[first]?.features?.reactions).toBe(true))
    const writes = vi.mocked(chatSessionsRepo.saveSession).mock.calls.length
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(vi.mocked(chatSessionsRepo.saveSession).mock.calls.length).toBe(writes)
    expect(follower.activeSessionId).toBe(selected)

    await follower.setSessionFeatures(first, {}, ['reactions'])
    expect(follower.sessionMetas[first]?.features?.reactions).toBeUndefined()
    expect(follower.sessionFeatures[first]?.reactions).toBe(false)
    expect(follower.sessionMetas[first]?.features?.memory).toBe('read')
    await follower.setSessionFeatures(first)
    expect(follower.sessionMetas[first]?.features).toBeUndefined()
    expect(follower.sessionFeatures[first]?.memory).toBe('write')
    defaults.resetState()
  })

  it('keeps branch choices independent and prevents task sessions from extending parent access', async () => {
    const context = createSyncedContext(`chat-feature-branches:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    const sessions = useChatSessionStore(context.pinia)
    await sessions.initialize()
    useChatFeaturesStore(context.pinia).resetState()
    const toolChoices = Object.fromEntries(DEFAULT_SESSION_FEATURES.tools.map(group => [group, group === 'mcp']))
    const parent = await sessions.createSession('default', { features: { memory: 'read', tools: toolChoices, reactions: false } })
    const branch = await sessions.forkSession({ fromSessionId: parent })
    expect(sessions.sessionMetas[branch]?.features).toEqual(sessions.sessionMetas[parent]?.features)
    await sessions.setSessionFeatures(branch, { reactions: true })
    expect(sessions.sessionFeatures[parent]?.reactions).toBe(false)
    expect(sessions.sessionFeatures[branch]?.reactions).toBe(true)
    const task = await sessions.createSession('default', {
      setActive: false,
      recipeId: 'user:example',
      parentSessionId: parent,
      features: { memory: 'write', tools: { ...toolChoices, plugins: true }, reactions: true },
    })
    expect(sessions.sessionFeatures[task]?.memory).toBe('read')
    expect(sessions.sessionFeatures[task]?.tools).toEqual(['mcp'])
    expect(sessions.sessionFeatures[task]?.reactions).toBe(false)
    const exported = await sessions.exportSessions()
    expect(exported.sessions[parent]?.meta.features).toEqual({ memory: 'read', tools: toolChoices, reactions: false })
  })
})

it('stops only the owning speech producer and keeps expressions independent across identical turn ids', async () => {
  const context = createSyncedContext(`chat-output-features:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
  setActivePinia(context.pinia)
  const sessions = useChatSessionStore(context.pinia)
  await sessions.initialize()
  const defaults = useChatFeaturesStore(context.pinia)
  defaults.resetState()
  const first = await sessions.createSession('default', { features: { reactions: false } })
  const second = await sessions.createSession('default', { features: { speech: false } })
  const stopSpeech = vi.fn()
  const scope = effectScope()
  const output = scope.run(() => useSessionOutputFeatures(stopSpeech))!
  const spoken = { sessionId: first, turnId: 'same-input-id', speaks: true, reactions: false }
  const silent = { sessionId: second, turnId: 'same-input-id', speaks: false, reactions: true }
  output.begin(spoken)
  output.begin(silent)
  expect(output.canSpeak(spoken)).toBe(true)
  expect(output.canSpeak(silent)).toBe(false)
  expect(output.canReactFor(spoken.turnId, first)).toBe(false)
  expect(output.canReactFor(silent.turnId, second)).toBe(true)
  await sessions.setSessionFeatures(first, { speech: false })
  await nextTick()
  expect(stopSpeech).toHaveBeenCalledExactlyOnceWith(spoken)
  expect(output.canSpeak(spoken)).toBe(false)
  expect(output.canReact(silent)).toBe(true)
  await sessions.setSessionFeatures(first, {}, ['speech'])
  expect(output.canSpeak(spoken)).toBe(false)
  output.end(spoken)
  const next = { ...spoken, turnId: 'next-input-id' }
  output.begin(next)
  expect(output.canSpeak(next)).toBe(true)
  scope.stop()
})

it('edits available conversation choices and restores all controls, including choices outside the panel', async () => {
  const context = createSyncedContext(`chat-feature-form:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
  const sessions = useChatSessionStore(context.pinia)
  await sessions.initialize()
  const defaults = useChatFeaturesStore(context.pinia)
  defaults.resetState()
  const sessionId = await sessions.createSession('default', { features: { speech: false, cards: false, memory: 'read', tools: { 'computer-use': false } } })
  const tools = useLlmToolsStore(context.pinia)
  const search = useWebSearchStore(context.pinia)
  const memory = useMemoryStore(context.pinia)
  const stickers = useStickersStore(context.pinia)
  stickers.enabled = false
  search.enabled = false
  memory.enabled = true
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: defineComponent({ render: () => h('div') }) }] })
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const screen = await render(SessionFeatureSettings, { props: { sessionId }, global: { plugins: [context.pinia, router, i18n] } })
  try {
    const restoreAll = screen.getByRole('button', { name: 'Reset all', exact: true })
    await expect.element(restoreAll).toBeEnabled()
    expect(screen.getByRole('radiogroup').elements()).toHaveLength(0)
    expect(screen.getByRole('combobox').elements()).toHaveLength(0)
    expect(screen.getByRole('link').elements()).toHaveLength(0)
    expect(screen.getByRole('switch', { name: 'Automatic speech', exact: true }).elements()).toHaveLength(0)
    const stickerSwitch = screen.getByRole('switch', { name: 'Stickers', exact: true })
    await expect.element(stickerSwitch).not.toBeChecked()
    await stickerSwitch.click()
    await vi.waitFor(() => expect(sessions.sessionMetas[sessionId]?.features?.stickers).toBe(true))
    expect(stickers.enabled).toBe(false)
    expect(screen.getByRole('switch', { name: 'MCP tools', exact: true }).elements()).toHaveLength(0)
    expect(screen.getByRole('region', { name: 'Tools and information', exact: true }).elements()).toHaveLength(0)
    const memorySwitch = screen.getByRole('switch', { name: 'Long-term memory', exact: true })
    await expect.element(memorySwitch).toBeChecked()
    expect(sessions.sessionFeatures[sessionId]?.memory).toBe('read')
    await memorySwitch.click()
    await vi.waitFor(() => expect(sessions.sessionFeatures[sessionId]?.memory).toBe('off'))
    expect(memory.enabled).toBe(true)

    const reactions = screen.getByRole('switch', { name: 'Reply expressions and actions', exact: true })
    defaults.setDefaults({ reactions: false })
    await expect.element(reactions).not.toBeChecked()
    await reactions.click()
    await vi.waitFor(() => expect(sessions.sessionMetas[sessionId]?.features?.reactions).toBe(true))
    defaults.setDefaults({ reactions: true })
    defaults.setDefaults({ reactions: false })
    await expect.element(reactions).toBeChecked()

    expect(screen.getByRole('button', { name: /^About / }).elements()).toHaveLength(0)

    stickers.enabled = true
    await expect.element(screen.getByRole('switch', { name: 'Stickers', exact: true })).toBeChecked()
    search.enabled = true
    search.activeApiKey = 'test-key'
    const vision = useVisionStore(context.pinia)
    vision.activeProvider = 'example-vision'
    vision.activeModel = 'example-model'
    for (const group of ['mcp', 'plugins', 'home-assistant'] as const) {
      tools.addTools({ id: `example:${group}`, group, type: 'function', function: { name: `example_${group}`, description: 'Example tool', parameters: { type: 'object', properties: {} } }, execute: async () => 'done' })
    }
    const homeAssistant = useHomeAssistantStore(context.pinia)
    homeAssistant.enabled = true
    homeAssistant.hasCredentials = true
    await expect.element(screen.getByRole('switch', { name: 'Home Assistant', exact: true })).toBeVisible()
    expect(screen.getByRole('switch').elements()).toHaveLength(10)
    const mcp = screen.getByRole('switch', { name: 'MCP tools', exact: true })
    const plugin = screen.getByRole('switch', { name: 'Plugin tools', exact: true })
    const webSearch = screen.getByRole('switch', { name: 'Web search', exact: true })
    await expect.element(mcp).toBeChecked()
    await mcp.click()
    await vi.waitFor(() => expect(sessions.sessionFeatures[sessionId]?.tools).not.toContain('mcp'))
    await expect.element(mcp).toBeVisible()
    await expect.element(plugin).toBeChecked()
    await webSearch.click()
    await vi.waitFor(() => expect(sessions.sessionFeatures[sessionId]?.tools).not.toContain('web-search'))
    expect(search.enabled).toBe(true)
    search.enabled = false
    await expect.element(webSearch).toBeVisible()
    await expect.element(webSearch).toBeDisabled()
    await expect.element(screen.getByText('Search services are off.', { exact: false })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open settings', exact: true }).element().closest('label')).toBeNull()
    expect(sessions.sessionMetas[sessionId]?.features?.tools?.['web-search']).toBe(false)
    search.enabled = true
    await expect.element(webSearch).not.toBeChecked()
    await expect.element(webSearch).toBeEnabled()
    expect(screen.getByText('Search services are off.', { exact: false }).elements()).toHaveLength(0)
    const screenSwitch = screen.getByRole('switch', { name: 'Use screen information', exact: true })
    vision.enabled = false
    await expect.element(screenSwitch).toBeDisabled()
    await expect.element(screenSwitch).not.toBeChecked()
    await expect.element(screen.getByText('The vision module is off.', { exact: false })).toBeVisible()
    expect(sessions.sessionFeatures[sessionId]?.screen).toBe(true)
    vision.enabled = true
    await expect.element(screenSwitch).toBeChecked()
    expect(screen.getByText('The vision module is off.', { exact: false }).elements()).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Restore defaults for/ }).elements()).toHaveLength(0)
    await restoreAll.click()
    await vi.waitFor(() => expect(sessions.sessionMetas[sessionId]?.features).toBeUndefined())
    await expect.element(reactions).not.toBeChecked()
    await expect.element(memorySwitch).toBeChecked()
    await expect.element(mcp).toBeChecked()
    await expect.element(webSearch).toBeChecked()
    expect(sessions.sessionFeatures[sessionId]?.speech).toBe(true)
    expect(sessions.sessionFeatures[sessionId]?.cards).toBe(true)
    expect(sessions.sessionFeatures[sessionId]?.tools).toContain('computer-use')
    await expect.element(restoreAll).toBeDisabled()
    await screen.unmount()
    const remounted = await render(SessionFeatureSettings, { props: { sessionId }, global: { plugins: [context.pinia, router, i18n] } })
    await expect.element(remounted.getByRole('switch', { name: 'Reply expressions and actions', exact: true })).not.toBeChecked()
    await remounted.unmount()
  }
  finally {
    defaults.resetState()
  }
})

it.each(['dialog', 'popover'] as const)('opens features from the %s list, restores focus, and preserves batch deletion', async (desktopMode) => {
  await page.viewport(1280, 900)
  const context = createSyncedContext(`chat-feature-navigation:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
  const sessions = useChatSessionStore(context.pinia)
  await sessions.initialize()
  const sessionId = await sessions.createSession('default')
  const title = 'A conversation with a long title that remains identifiable while editing its features'
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: defineComponent({ render: () => h('div') }) }] })
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: { stage: { chat: { sessions: {
    'new': 'New conversation',
    'select': 'Select conversations',
    'delete-selected': 'Delete selected',
    'confirm-delete-selected': 'Confirm deletion',
  } } }, settings: { 'session-features': {
    'session-action': 'Features for {title}',
    'session-title': 'Conversation features',
    'restore-all': 'Reset all',
    'close': 'Close conversation features',
  } } } } })
  const deleteSessions = vi.fn()
  const harness = defineComponent({
    setup() {
      const open = ref(true)
      return () => h(SessionsDialog, {
        'open': open.value,
        'onUpdate:open': (value: boolean) => open.value = value,
        'rows': [{ meta: sessions.sessionMetas[sessionId], preview: title, isActive: true, activityAtLabel: 'now' }],
        'isDesktop': true,
        'isCreatingSession': false,
        'onDeleteSessions': deleteSessions,
        desktopMode,
      }, { trigger: () => h('button', { type: 'button' }, 'Conversations') })
    },
  })
  const screen = await render(harness, { global: { plugins: [context.pinia, router, i18n] } })
  try {
    const configure = screen.getByRole('button', { name: `Features for ${title}`, exact: true })
    await configure.click()
    const dialog = screen.getByRole('dialog', { name: 'Conversation features', exact: true })
    await expect.element(dialog).toHaveAttribute('aria-modal', 'true')
    await expect.poll(() => {
      const bounds = dialog.element().getBoundingClientRect()
      return Math.abs(bounds.x + bounds.width / 2 - window.innerWidth / 2)
    }).toBeLessThan(2)
    await expect.poll(() => {
      const bounds = dialog.element().getBoundingClientRect()
      return Math.abs(bounds.y + bounds.height / 2 - window.innerHeight / 2)
    }).toBeLessThan(2)
    expect(dialog.getByText(title, { exact: true }).elements()).toHaveLength(0)
    expect(dialog.getByRole('button', { name: 'Back to conversations', exact: true }).elements()).toHaveLength(0)
    expect(dialog.getByRole('link').elements()).toHaveLength(0)
    expect(dialog.element().contains(document.activeElement)).toBe(true)
    expect(sessions.activeSessionId).toBe(sessionId)

    const trigger = screen.getByRole('button', { name: 'Conversations', exact: true })
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
    await trigger.click()
    await expect.element(screen.getByRole('button', { name: 'New conversation', exact: true })).toBeVisible()
    expect(screen.getByRole('button', { name: 'New conversation', exact: true }).elements()).toHaveLength(1)
    await screen.getByRole('button', { name: 'Select conversations', exact: true }).click()
    await expect.element(configure).not.toBeInTheDocument()
    await screen.getByRole('button', { name: new RegExp(title) }).click()
    await screen.getByRole('button', { name: 'Delete selected', exact: true }).click()
    expect(deleteSessions).not.toHaveBeenCalled()
    await screen.getByRole('button', { name: 'Confirm deletion', exact: true }).click()
    expect(deleteSessions).toHaveBeenCalledExactlyOnceWith([sessionId])
    await expect.element(configure).toBeVisible()
    await configure.click()
    await screen.getByRole('button', { name: 'Close conversation features', exact: true }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
  }
  finally {
    await screen.unmount()
  }
})
