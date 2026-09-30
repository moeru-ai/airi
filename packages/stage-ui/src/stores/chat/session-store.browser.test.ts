import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ChatSessionMeta } from '../../types/chat-session'

import { createPinia, defineStore, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'

import { chatAudioRepo } from '../../database/repos/chat-audio.repo'
import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { storage } from '../../database/storage'

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
  return { activeCardId, systemPrompt, getSystemPromptForCard: () => systemPrompt.value }
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
  // https://github.com/moeru-ai/airi/pull/2546#discussion_r4141166996
  // ROOT CAUSE:
  // Audio cleanup could fail before the updated session index reached storage.
  // The store now saves the index before it starts audio cleanup.
  it('keeps failed audio cleanup available after session deletion', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const reference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    await store.setSessionMessages(sessionId, [
      { role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: reference, format: 'wav' } }] },
    ])

    const removeItem = storage.removeItem.bind(storage)
    const audioKey = `local:chat/audio/${reference.slice('airi-chat-audio:'.length)}`
    const failingRemove = vi.spyOn(storage, 'removeItem').mockImplementation(async (key) => {
      if (key === audioKey)
        throw new Error('Audio cleanup failed')
      return await removeItem(key)
    })

    await expect(store.deleteSession(sessionId)).rejects.toThrow('Audio cleanup failed')
    expect(await chatAudioRepo.pendingSessionRemovals()).toContain(sessionId)
    const persistedIndex = vi.mocked(chatSessionsRepo.saveIndex).mock.lastCall?.[0]
    expect(persistedIndex?.characters.default.sessions).not.toHaveProperty(sessionId)
    failingRemove.mockRestore()

    const retryContext = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(retryContext.runtime.isLeader()).toBe(true))
    setActivePinia(retryContext.pinia)
    await useChatSessionStore().initialize()
    expect(await chatAudioRepo.pendingSessionRemovals()).not.toContain(sessionId)
    await expect(chatAudioRepo.load(reference)).rejects.toThrow('Stored chat audio is unavailable')
  })

  it('keeps pending audio when its session record still exists', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const reference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    const meta = store.sessionMetas[sessionId]
    if (!meta)
      throw new Error('Expected an active session.')
    await chatAudioRepo.markSessionRemoval(sessionId)

    const getSession = vi.spyOn(chatSessionsRepo, 'getSession').mockImplementation(async id => id === sessionId
      ? { meta, messages: [{ role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: reference, format: 'wav' } }] }] }
      : null)
    const retryContext = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(retryContext.runtime.isLeader()).toBe(true))
    setActivePinia(retryContext.pinia)
    await useChatSessionStore().initialize()

    expect(await chatAudioRepo.load(reference)).toBe('YXVkaW8=')
    expect(await chatAudioRepo.pendingSessionRemovals()).not.toContain(sessionId)
    getSession.mockRestore()
    await chatAudioRepo.removeSession(sessionId)
  })

  // https://github.com/moeru-ai/airi/pull/2546#discussion_r4141167002
  // ROOT CAUSE:
  // Clearing history returned before storage removed the voice recording.
  // The store now waits for cleanup and keeps a durable retry marker on failure.
  it('retries failed audio removal after clearing message history', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const reference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    await store.setSessionMessages(sessionId, [
      { role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: reference, format: 'wav' } }] },
    ])

    const removeItem = storage.removeItem.bind(storage)
    const audioKey = `local:chat/audio/${reference.slice('airi-chat-audio:'.length)}`
    const failingRemove = vi.spyOn(storage, 'removeItem').mockImplementation(async (key) => {
      if (key === audioKey)
        throw new Error('Audio cleanup failed')
      return await removeItem(key)
    })

    await expect(store.cleanupMessages(sessionId)).rejects.toThrow('Audio cleanup failed')
    expect(await chatAudioRepo.pendingSessionPrunes()).toContain(sessionId)
    const savedRecord = vi.mocked(chatSessionsRepo.saveSession).mock.lastCall?.[1]
    expect(savedRecord?.messages).not.toContainEqual(expect.objectContaining({ id: 'voice' }))
    failingRemove.mockRestore()

    const getSession = vi.spyOn(chatSessionsRepo, 'getSession').mockImplementation(async id => id === sessionId ? savedRecord ?? null : null)
    const retryContext = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(retryContext.runtime.isLeader()).toBe(true))
    setActivePinia(retryContext.pinia)
    await useChatSessionStore().initialize()

    expect(await chatAudioRepo.pendingSessionPrunes()).not.toContain(sessionId)
    await expect(chatAudioRepo.load(reference)).rejects.toThrow('Stored chat audio is unavailable')
    getSession.mockRestore()
  })

  it('keeps referenced audio when cleanup stops before the session write', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const reference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    const meta = store.sessionMetas[sessionId]
    if (!meta)
      throw new Error('Expected an active session.')
    await chatAudioRepo.markSessionPrune(sessionId)

    const getSession = vi.spyOn(chatSessionsRepo, 'getSession').mockImplementation(async id => id === sessionId
      ? { meta, messages: [{ role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: reference, format: 'wav' } }] }] }
      : null)
    const retryContext = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(retryContext.runtime.isLeader()).toBe(true))
    setActivePinia(retryContext.pinia)
    await useChatSessionStore().initialize()

    expect(await chatAudioRepo.load(reference)).toBe('YXVkaW8=')
    expect(await chatAudioRepo.pendingSessionPrunes()).not.toContain(sessionId)
    getSession.mockRestore()
    await chatAudioRepo.removeSession(sessionId)
  })

  it('clears voice history through the leader when a follower requests cleanup', async () => {
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useChatSessionStore()
    await leaderStore.initialize()
    const sessionId = leaderStore.activeSessionId
    const reference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    await leaderStore.setSessionMessages(sessionId, [
      { role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: reference, format: 'wav' } }] },
    ])

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useChatSessionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await followerStore.cleanupMessages(sessionId)

    expect(leaderStore.getSessionMessages(sessionId)).not.toContainEqual(expect.objectContaining({ id: 'voice' }))
    expect(await chatAudioRepo.pendingSessionPrunes()).not.toContain(sessionId)
    await expect(chatAudioRepo.load(reference)).rejects.toThrow('Stored chat audio is unavailable')
  })

  it('retries failed audio cleanup after deleting all sessions', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const reference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    await store.setSessionMessages(sessionId, [
      { role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: reference, format: 'wav' } }] },
    ])

    const removeItem = storage.removeItem.bind(storage)
    const audioKey = `local:chat/audio/${reference.slice('airi-chat-audio:'.length)}`
    const failingRemove = vi.spyOn(storage, 'removeItem').mockImplementation(async (key) => {
      if (key === audioKey)
        throw new Error('Audio cleanup failed')
      return await removeItem(key)
    })

    await expect(store.resetAllSessions()).rejects.toThrow('Audio cleanup failed')
    expect(await chatAudioRepo.pendingSessionRemovals()).toContain(sessionId)
    failingRemove.mockRestore()

    const retryContext = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(retryContext.runtime.isLeader()).toBe(true))
    setActivePinia(retryContext.pinia)
    await useChatSessionStore().initialize()
    expect(await chatAudioRepo.pendingSessionRemovals()).not.toContain(sessionId)
    await expect(chatAudioRepo.load(reference)).rejects.toThrow('Stored chat audio is unavailable')
  })

  it('removes copied audio when a fork fails', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const firstReference = await chatAudioRepo.save(sessionId, 'Zmlyc3Q=')
    const secondReference = await chatAudioRepo.save(sessionId, 'c2Vjb25k')
    await store.setSessionMessages(sessionId, [
      { role: 'user', id: 'first', content: [{ type: 'input_audio', input_audio: { data: firstReference, format: 'wav' } }] },
      { role: 'user', id: 'second', content: [{ type: 'input_audio', input_audio: { data: secondReference, format: 'wav' } }] },
    ])

    const save = chatAudioRepo.save.bind(chatAudioRepo)
    const copied: string[] = []
    let forkId = ''
    const failingCopy = vi.spyOn(chatAudioRepo, 'save').mockImplementation(async (id, data) => {
      forkId = id
      if (data === 'c2Vjb25k')
        throw new Error('Audio copy failed')
      const reference = await save(id, data)
      copied.push(reference)
      return reference
    })

    await expect(store.forkSession({ fromSessionId: sessionId })).rejects.toThrow('Audio copy failed')
    failingCopy.mockRestore()
    expect(copied).toHaveLength(1)
    expect(store.sessionMetas[forkId]).toBeUndefined()
    const copiedReference = copied[0]
    if (!copiedReference)
      throw new Error('Expected a copied voice recording.')
    await expect(chatAudioRepo.load(copiedReference)).rejects.toThrow('Stored chat audio is unavailable')
    expect(await chatAudioRepo.pendingSessionRemovals()).not.toContain(forkId)
  })

  it('removes copied audio when fork session persistence fails', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const reference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    await store.setSessionMessages(sessionId, [
      { role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: reference, format: 'wav' } }] },
    ])

    const save = chatAudioRepo.save.bind(chatAudioRepo)
    let forkId = ''
    let copiedReference = ''
    const copying = vi.spyOn(chatAudioRepo, 'save').mockImplementation(async (id, data) => {
      forkId = id
      copiedReference = await save(id, data)
      return copiedReference
    })
    const saveSession = chatSessionsRepo.saveSession.bind(chatSessionsRepo)
    const failingPersistence = vi.spyOn(chatSessionsRepo, 'saveSession').mockImplementation(async (id, record) => {
      if (id === forkId)
        throw new Error('Fork persistence failed')
      return await saveSession(id, record)
    })

    await expect(store.forkSession({ fromSessionId: sessionId })).rejects.toThrow('Fork persistence failed')
    copying.mockRestore()
    failingPersistence.mockRestore()
    expect(store.sessionMetas[forkId]).toBeUndefined()
    await expect(chatAudioRepo.load(copiedReference)).rejects.toThrow('Stored chat audio is unavailable')
    expect(await chatAudioRepo.pendingSessionRemovals()).not.toContain(forkId)
  })

  it('routes concurrent explicit character resolution to one authority without changing either selection', async () => {
    const namespace = `chat-session:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    setActivePinia(leader.pinia)
    const leaderStore = useChatSessionStore()
    await leaderStore.initialize()
    const leaderSelection = leaderStore.activeSessionId

    const follower = createSyncedContext(namespace, 'follower-only')
    setActivePinia(follower.pinia)
    const followerStore = useChatSessionStore()
    await followerStore.initialize()
    const followerSelection = followerStore.activeSessionId
    vi.mocked(chatSessionsRepo.saveSession).mockClear()

    const sessions = await Promise.all([
      followerStore.ensureSessionForCharacter('background'),
      followerStore.ensureSessionForCharacter('background'),
    ])

    expect(sessions[0]).toBe(sessions[1])
    expect(chatSessionsRepo.saveSession).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(followerStore.sessionMetas[sessions[0]]?.characterId).toBe('background'))
    expect(leaderStore.activeSessionId).toBe(leaderSelection)
    expect(followerStore.activeSessionId).toBe(followerSelection)
    expect(await followerStore.ensureSessionForCharacter('background')).toBe(sessions[0])
    expect(chatSessionsRepo.saveSession).toHaveBeenCalledOnce()
  })

  it('clears removed message audio and waits for all audio deletion', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const firstReference = await chatAudioRepo.save(sessionId, 'Zmlyc3Q=')
    const secondReference = await chatAudioRepo.save(sessionId, 'c2Vjb25k')
    await store.setSessionMessages(sessionId, [
      { role: 'system', id: 'system', content: 'System' },
      { role: 'user', id: 'first', content: [{ type: 'input_audio', input_audio: { data: firstReference, format: 'wav' } }] },
      { role: 'user', id: 'second', content: [{ type: 'input_audio', input_audio: { data: secondReference, format: 'wav' } }] },
    ])

    await store.deleteMessage({ sessionId, messageId: 'first' })
    await expect(chatAudioRepo.load(firstReference)).rejects.toThrow('Stored chat audio is unavailable')
    expect(await chatAudioRepo.load(secondReference)).toBe('c2Vjb25k')

    const retriedReference = await chatAudioRepo.save(sessionId, 'dGhpcmQ=')
    await store.setSessionMessages(sessionId, [
      ...store.getSessionMessages(sessionId),
      { role: 'user', id: 'retried', content: [{ type: 'input_audio', input_audio: { data: retriedReference, format: 'wav' } }] },
    ])
    await store.setSessionMessages(sessionId, store.getSessionMessages(sessionId).slice(0, -1))
    await expect(chatAudioRepo.load(retriedReference)).rejects.toThrow('Stored chat audio is unavailable')

    await store.resetAllSessions()
    await expect(chatAudioRepo.load(secondReference)).rejects.toThrow('Stored chat audio is unavailable')
  })

  it('replaces old audio references when importing the same session twice', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const firstReference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    await store.setSessionMessages(sessionId, [
      { role: 'system', id: 'system', content: 'System' },
      { role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: firstReference, format: 'wav' } }] },
    ])
    const exportData = await store.exportSessions()

    function currentReference() {
      const message = store.sessionMessages[sessionId]?.find(item => item.id === 'voice')
      const part = Array.isArray(message?.content) ? message.content.find(item => item.type === 'input_audio') : undefined
      if (part?.type !== 'input_audio')
        throw new Error('Expected an imported voice message.')
      return part.input_audio.data
    }

    await store.importSessions(exportData)
    const secondReference = currentReference()
    await expect(chatAudioRepo.load(firstReference)).rejects.toThrow('Stored chat audio is unavailable')
    expect(await chatAudioRepo.load(secondReference)).toBe('YXVkaW8=')

    await store.importSessions(exportData)
    const thirdReference = currentReference()
    await expect(chatAudioRepo.load(secondReference)).rejects.toThrow('Stored chat audio is unavailable')
    expect(await chatAudioRepo.load(thirdReference)).toBe('YXVkaW8=')
  })

  it('removes copied audio when an import copy fails', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const firstReference = await chatAudioRepo.save(sessionId, 'Zmlyc3Q=')
    const secondReference = await chatAudioRepo.save(sessionId, 'c2Vjb25k')
    await store.setSessionMessages(sessionId, [
      { role: 'user', id: 'voice', content: [
        { type: 'input_audio', input_audio: { data: firstReference, format: 'wav' } },
        { type: 'input_audio', input_audio: { data: secondReference, format: 'wav' } },
      ] },
    ])
    const payload = await store.exportSessions()

    const save = chatAudioRepo.save.bind(chatAudioRepo)
    let copiedReference = ''
    const failingCopy = vi.spyOn(chatAudioRepo, 'save').mockImplementation(async (id, data) => {
      if (data === 'c2Vjb25k')
        throw new Error('Import audio copy failed')
      copiedReference = await save(id, data)
      return copiedReference
    })

    await expect(store.importSessions(payload)).rejects.toThrow('Import audio copy failed')
    failingCopy.mockRestore()
    await expect(chatAudioRepo.load(copiedReference)).rejects.toThrow('Stored chat audio is unavailable')
    expect(await chatAudioRepo.load(firstReference)).toBe('Zmlyc3Q=')
    expect(await chatAudioRepo.load(secondReference)).toBe('c2Vjb25k')
  })

  it('removes copied audio when an imported session cannot be saved', async () => {
    const context = createSyncedContext(`chat-session:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const store = useChatSessionStore()
    await store.initialize()
    const sessionId = store.activeSessionId
    const originalReference = await chatAudioRepo.save(sessionId, 'YXVkaW8=')
    await store.setSessionMessages(sessionId, [
      { role: 'user', id: 'voice', content: [{ type: 'input_audio', input_audio: { data: originalReference, format: 'wav' } }] },
    ])
    const payload = await store.exportSessions()

    const save = chatAudioRepo.save.bind(chatAudioRepo)
    let copiedReference = ''
    const copying = vi.spyOn(chatAudioRepo, 'save').mockImplementation(async (id, data) => {
      copiedReference = await save(id, data)
      return copiedReference
    })
    const failingPersistence = vi.spyOn(chatSessionsRepo, 'saveSession').mockRejectedValue(new Error('Import persistence failed'))

    await expect(store.importSessions(payload)).rejects.toThrow('Import persistence failed')
    copying.mockRestore()
    failingPersistence.mockRestore()
    await expect(chatAudioRepo.load(copiedReference)).rejects.toThrow('Stored chat audio is unavailable')
    expect(await chatAudioRepo.load(originalReference)).toBe('YXVkaW8=')
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
