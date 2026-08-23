import type { ChatSessionMeta, ChatSessionRecord, ChatSessionsIndex } from '../../types/chat-session'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

// Refs the store reads through the mocked `useAuthStore` / `useAiriCardStore`.
// Tests mutate these to simulate auth and card swaps.
const userIdRef = ref<string>('local')
const activeCardIdRef = ref<string>('default')
const systemPromptRef = ref<string>('')

const getIndexMock = vi.fn<(uid: string) => Promise<ChatSessionsIndex | null>>()
const saveIndexMock = vi.fn<(idx: ChatSessionsIndex) => Promise<void>>()
const getSessionMock = vi.fn<(id: string) => Promise<ChatSessionRecord | null>>()
const saveSessionMock = vi.fn<(id: string, rec: ChatSessionRecord) => Promise<void>>()
const deleteSessionRepoMock = vi.fn<(id: string) => Promise<void>>()
const getOutboxMock = vi.fn<(uid: string) => Promise<any[]>>()
const dropOutboxForSessionMock = vi.fn<(uid: string, id: string) => Promise<void>>()
const getTombstonesMock = vi.fn<(uid: string) => Promise<string[]>>()
const removeTombstonesMock = vi.fn<(uid: string, ids: string[]) => Promise<void>>()
const addTombstoneMock = vi.fn<(uid: string, id: string) => Promise<void>>()
const deleteCloudChatMock = vi.fn<(id: string) => Promise<void>>()
const listChatsMock = vi.fn()
const pullMessagesMock = vi.fn()
const reconcileLocalAndRemoteMock = vi.fn()
const connectCloudWsMock = vi.fn()
let cloudWsStatus: 'idle' | 'open' = 'idle'
let cloudStatusListener: ((status: 'idle' | 'open') => void) | undefined

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: any) => store,
  }
})

vi.mock('../auth', () => ({
  useAuthStore: () => ({ userId: userIdRef }),
}))

vi.mock('../modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCardId: activeCardIdRef,
    systemPrompt: systemPromptRef,
  }),
}))

vi.mock('../../database/repos/chat-sessions.repo', () => ({
  chatSessionsRepo: {
    getIndex: (uid: string) => getIndexMock(uid),
    saveIndex: (idx: ChatSessionsIndex) => saveIndexMock(idx),
    getSession: (id: string) => getSessionMock(id),
    saveSession: (id: string, rec: ChatSessionRecord) => saveSessionMock(id, rec),
    deleteSession: (id: string) => deleteSessionRepoMock(id),
    getOutbox: (uid: string) => getOutboxMock(uid),
    enqueueOutbox: vi.fn().mockResolvedValue(undefined),
    dequeueOutbox: vi.fn().mockResolvedValue(undefined),
    updateOutboxEntries: vi.fn().mockResolvedValue(undefined),
    dropOutboxForSession: (uid: string, id: string) => dropOutboxForSessionMock(uid, id),
    getTombstones: (uid: string) => getTombstonesMock(uid),
    addTombstone: (uid: string, id: string) => addTombstoneMock(uid, id),
    removeTombstones: (uid: string, ids: string[]) => removeTombstonesMock(uid, ids),
  },
}))

vi.mock('../../libs/auth', () => ({
  getAuthToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../libs/auth-fetch', () => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
}))

vi.mock('../../libs/server', () => ({
  SERVER_URL: 'http://test',
}))

// Inert chat-sync surface. The store doesn't drive any cloud writes in these
// tests (anonymous user for one, deferred index for the other), so noops are
// sufficient. We keep `extractMessageText` realistic so message previews work.
vi.mock('../../libs/chat-sync', () => ({
  applyCreateActions: vi.fn().mockResolvedValue([]),
  reconcileLocalAndRemote: (...args: unknown[]) => reconcileLocalAndRemoteMock(...args),
  createCloudChatMapper: () => ({
    listChats: () => listChatsMock(),
    deleteChat: (id: string) => deleteCloudChatMock(id),
  }),
  createChatWsClient: () => ({
    status: () => cloudWsStatus,
    connect: connectCloudWsMock,
    disconnect: vi.fn(),
    destroy: vi.fn(),
    sendMessages: vi.fn().mockResolvedValue({ ok: true }),
    pullMessages: (...args: unknown[]) => pullMessagesMock(...args),
    onNewMessages: () => () => {},
    onStatusChange: (listener: (status: 'idle' | 'open') => void) => {
      cloudStatusListener = listener
      return () => {}
    },
  }),
  extractMessageText: (m: any) => (typeof m?.content === 'string' ? m.content : ''),
  isCloudSyncableMessage: () => false,
  mergeCloudMessagesIntoLocal: () => ({ dirty: false, messages: [], maxSeq: 0 }),
}))

const { useChatSessionStore } = await import('./session-store')
let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  userIdRef.value = 'local'
  activeCardIdRef.value = 'default'
  systemPromptRef.value = ''

  getIndexMock.mockReset().mockResolvedValue(null)
  saveIndexMock.mockReset().mockResolvedValue(undefined)
  getSessionMock.mockReset().mockResolvedValue(null)
  saveSessionMock.mockReset().mockResolvedValue(undefined)
  deleteSessionRepoMock.mockReset().mockResolvedValue(undefined)
  getOutboxMock.mockReset().mockResolvedValue([])
  dropOutboxForSessionMock.mockReset().mockResolvedValue(undefined)
  getTombstonesMock.mockReset().mockResolvedValue([])
  removeTombstonesMock.mockReset().mockResolvedValue(undefined)
  addTombstoneMock.mockReset().mockResolvedValue(undefined)
  deleteCloudChatMock.mockReset().mockResolvedValue(undefined)
  listChatsMock.mockReset().mockResolvedValue([])
  pullMessagesMock.mockReset().mockResolvedValue({ messages: [], seq: 0 })
  reconcileLocalAndRemoteMock.mockReset().mockReturnValue({ adopt: [], claim: [], create: [] })
  connectCloudWsMock.mockReset()
  cloudWsStatus = 'idle'
  cloudStatusListener = undefined
})

afterEach(() => {
  disposePinia(pinia)
})

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++)
    await Promise.resolve()
}

describe('chat-session-store · user swap during in-flight ensureActiveSessionForCharacter', () => {
  // ROOT CAUSE:
  //
  // ensureActiveSessionForCharacter caches `ensureActivePromise` for singleflight
  // and the IIFE captures `currentUserId` at start. When `userId` flips A → B
  // mid-flight:
  //   1. The userId watcher calls clearInMemoryState (resets sessionMetas /
  //      index / activeSessionId), but does NOT reset `ensureActivePromise`.
  //   2. A's IIFE eventually resumes after its awaited IDB read completes and
  //      writes A's session record back into the now-empty B state — leak.
  //   3. Any subsequent ensureActiveSessionForCharacter call (e.g. from the
  //      [userId, activeCardId] watcher) returns A's stale promise instead of
  //      starting a fresh hydrate for B — B silently sees no sessions.
  //
  // We fix this by:
  //   - bumping an `ensureActiveEpoch` and nulling `ensureActivePromise` in
  //     `clearInMemoryState`,
  //   - re-checking the captured epoch after each await inside the IIFE,
  //   - re-checking `sessionMetas[sessionId]` inside `loadSession` so the
  //     post-IDB write does not resurrect cleared state,
  //   - triggering a fresh hydrate from the userId watcher itself so the new
  //     user actually loads.
  it('runs a fresh hydrate for the new user and discards the stale write from the old user', async () => {
    const aSessionMeta: ChatSessionMeta = {
      sessionId: 'sess-A',
      userId: 'A',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    const aIndex: ChatSessionsIndex = {
      userId: 'A',
      characters: {
        default: {
          activeSessionId: 'sess-A',
          sessions: { 'sess-A': aSessionMeta },
        },
      },
    }
    const bSessionMeta: ChatSessionMeta = {
      sessionId: 'sess-B',
      userId: 'B',
      characterId: 'default',
      createdAt: 2,
      updatedAt: 2,
    }
    const bIndex: ChatSessionsIndex = {
      userId: 'B',
      characters: {
        default: {
          activeSessionId: 'sess-B',
          sessions: { 'sess-B': bSessionMeta },
        },
      },
    }

    let resolveASessionGet: ((rec: ChatSessionRecord | null) => void) | undefined
    getIndexMock.mockImplementation((uid: string) => {
      if (uid === 'A')
        return Promise.resolve(aIndex)
      if (uid === 'B')
        return Promise.resolve(bIndex)
      return Promise.resolve(null)
    })
    getSessionMock.mockImplementation((id: string) => {
      // A's session getSession is the slow await we use to hold the IIFE open
      // until after the user swap fires.
      if (id === 'sess-A') {
        return new Promise<ChatSessionRecord | null>((resolve) => {
          resolveASessionGet = resolve
        })
      }
      if (id === 'sess-B')
        return Promise.resolve({ meta: bSessionMeta, messages: [] })
      return Promise.resolve(null)
    })

    userIdRef.value = 'A'
    const store = useChatSessionStore()

    // Kick off initialize; it will await ensureActiveSessionForCharacter, which
    // will await loadSession('sess-A') → getSession('sess-A') (deferred).
    const initPromise = store.initialize()
    await flushMicrotasks()

    // Sanity: A's getSession was reached and is parked.
    expect(getSessionMock).toHaveBeenCalledWith('sess-A')
    expect(resolveASessionGet).toBeDefined()

    // Auth swap mid-flight.
    userIdRef.value = 'B'
    await nextTick()
    await flushMicrotasks()

    // Resolve A's IDB read AFTER the swap. With the bug, A's IIFE writes
    // sess-A back into the cleared sessionMetas.
    resolveASessionGet!({ meta: aSessionMeta, messages: [] })
    await initPromise.catch(() => {})
    await flushMicrotasks()

    // B's hydrate must have fired — without the fix, the [userId, activeCardId]
    // watcher returned the stale A promise and B never loaded.
    expect(getIndexMock).toHaveBeenCalledWith('B')
    expect(store.sessionMetas['sess-B']).toBeDefined()

    // A's data must NOT have leaked into B's state.
    expect(store.sessionMetas['sess-A']).toBeUndefined()
  })
})

describe('chat-session-store · loadSession vs concurrent deleteSession', () => {
  // ROOT CAUSE:
  //
  // loadSession kicks off `chatSessionsRepo.getSession(id)` and writes the
  // returned record back into reactive state on resolve. If `deleteSession(id)`
  // runs synchronously between the getSession() call and its resolution, the
  // post-await `sessionMetas.value[sessionId] = stored.meta` write resurrects
  // the deleted entry — and `loadedSessions.add(id)` then short-circuits every
  // future loadSession retry, locking the resurrection in.
  //
  // The drawer's batch loadSession + per-row trash button is the production
  // path that hits this race.
  //
  // We fix this by re-checking `sessionMetas.value[sessionId]` inside
  // loadSession after the await; if the session is gone, skip the write-back
  // and skip `loadedSessions.add` so a subsequent (legitimate) load can retry.
  it('does not resurrect a session deleted while loadSession was awaiting IDB', async () => {
    const meta: ChatSessionMeta = {
      sessionId: 'sess-1',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }

    let resolveGet: ((rec: ChatSessionRecord | null) => void) | undefined
    getSessionMock.mockImplementation((id: string) => {
      if (id === 'sess-1') {
        return new Promise<ChatSessionRecord | null>((resolve) => {
          resolveGet = resolve
        })
      }
      return Promise.resolve(null)
    })

    userIdRef.value = 'local'
    const store = useChatSessionStore()

    // Inject sess-1 into sessionMetas without going through createSession
    // (which would also pre-mark it loaded and short-circuit our test).
    store.applyRemoteSnapshot({
      activeSessionId: '',
      sessionMessages: {},
      sessionMetas: { 'sess-1': meta },
      index: null,
    })
    expect(store.sessionMetas['sess-1']).toBeDefined()

    // Start loadSession (don't await). getSession is now pending.
    const loadPromise = store.loadSession('sess-1')
    await flushMicrotasks()
    expect(resolveGet).toBeDefined()

    // Delete the session. In-memory clear is synchronous; IDB delete enqueues.
    await store.deleteSession('sess-1')
    expect(store.sessionMetas['sess-1']).toBeUndefined()

    // Resolve getSession with the stale stored record.
    resolveGet!({ meta, messages: [{ role: 'user', content: 'hi', id: 'm1' } as any] })
    await loadPromise
    await flushMicrotasks()

    // Without the fix, sess-1 reappears here.
    expect(store.sessionMetas['sess-1']).toBeUndefined()
  })
})

describe('chat-session-store · deletion and hydration failures', () => {
  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743502031
  it('persists the fallback without changing the leader selection when a follower deletes its active session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Session selection is window-local, so the synchronized leader can be on
    // A while the persisted index still points to B. Deleting B returned A but
    // left the persisted index empty, so the next startup created a blank chat.
    const sessionA: ChatSessionMeta = {
      sessionId: 'session-a',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    const sessionB: ChatSessionMeta = {
      sessionId: 'session-b',
      userId: 'local',
      characterId: 'default',
      createdAt: 2,
      updatedAt: 2,
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-a',
      sessionMessages: { 'session-a': [], 'session-b': [] },
      sessionMetas: { 'session-a': sessionA, 'session-b': sessionB },
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'session-b',
            sessions: { 'session-a': sessionA, 'session-b': sessionB },
          },
        },
      },
    })

    await store.deleteSession('session-b')

    expect(store.activeSessionId).toBe('session-a')
    expect(store.getSnapshot().index?.characters.default?.activeSessionId).toBe('session-a')
    expect(store.sessionMetas['session-b']).toBeUndefined()
    expect(saveIndexMock).toHaveBeenLastCalledWith(expect.objectContaining({
      characters: expect.objectContaining({
        default: expect.objectContaining({ activeSessionId: 'session-a' }),
      }),
    }))
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743309237
  it('persists a replacement fallback without changing an unrelated leader selection for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // When a follower deleted the final session for one character, the leader
    // created a replacement with local activation disabled. The replacement
    // was indexed but the persisted character active ID stayed empty, so the
    // next initialization created another blank conversation.
    const leaderSession: ChatSessionMeta = {
      sessionId: 'leader-session',
      userId: 'local',
      characterId: 'other-character',
      createdAt: 1,
      updatedAt: 1,
    }
    const deletedSession: ChatSessionMeta = {
      sessionId: 'deleted-session',
      userId: 'local',
      characterId: 'default',
      createdAt: 2,
      updatedAt: 2,
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'leader-session',
      sessionMessages: { 'leader-session': [], 'deleted-session': [] },
      sessionMetas: { 'leader-session': leaderSession, 'deleted-session': deletedSession },
      index: {
        userId: 'local',
        characters: {
          'other-character': {
            activeSessionId: 'leader-session',
            sessions: { 'leader-session': leaderSession },
          },
          'default': {
            activeSessionId: 'deleted-session',
            sessions: { 'deleted-session': deletedSession },
          },
        },
      },
    })

    await store.deleteSession('deleted-session')
    const snapshot = store.getSnapshot()
    const [replacementSessionId] = Object.keys(snapshot.index?.characters.default?.sessions ?? {})
    expect(replacementSessionId).toBeDefined()
    if (!replacementSessionId)
      throw new Error('Expected deletion to create a replacement session')

    expect(store.activeSessionId).toBe('leader-session')
    expect(snapshot.index?.characters.default?.activeSessionId).toBe(replacementSessionId)
    expect(snapshot.index?.characters.default?.sessions[replacementSessionId]).toBeDefined()
    expect(saveIndexMock).toHaveBeenLastCalledWith(expect.objectContaining({
      characters: expect.objectContaining({
        default: expect.objectContaining({ activeSessionId: replacementSessionId }),
      }),
    }))
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3628917803
  it('keeps deleted session generations invalid for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Deletion previously removed the generation entry. A send captured at
    // generation zero could then read the deleted session as generation zero
    // again and continue appending messages after the chat was gone.
    const meta: ChatSessionMeta = {
      sessionId: 'sess-1',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'sess-1',
      sessionMessages: { 'sess-1': [] },
      sessionMetas: { 'sess-1': meta },
      index: null,
    })

    expect(store.getSessionGeneration('sess-1')).toBe(0)

    await store.deleteSession('sess-1')

    expect(store.getSessionGeneration('sess-1')).toBe(1)
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3628003766
  it('reports hydration failure and permits a later retry for Issue #2085', async () => {
    const meta: ChatSessionMeta = {
      sessionId: 'sess-1',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getSessionMock
      .mockRejectedValueOnce(new Error('IndexedDB read failed'))
      .mockResolvedValueOnce(null)

    userIdRef.value = 'local'
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: '',
      sessionMessages: {},
      sessionMetas: { 'sess-1': meta },
      index: null,
    })

    await expect(store.loadSession('sess-1')).resolves.toBe(false)
    await expect(store.loadSession('sess-1')).resolves.toBe(true)

    expect(getSessionMock).toHaveBeenCalledTimes(2)
  })
})

describe('chat-session-store · cloud placeholder hydration', () => {
  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743502032
  it('retries cloud hydration when the reconcile pull for an adopted placeholder fails for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Reconcile creates a system-only placeholder before its first cloud pull.
    // If that pull fails, loadSession sees the message-map entry and marks the
    // placeholder as loaded. Selecting the chat then skips every later pull.
    const localMeta: ChatSessionMeta = {
      sessionId: 'local-session',
      userId: 'cloud-user',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    const remoteChat = {
      id: 'remote-session',
      type: 'bot' as const,
      title: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    userIdRef.value = 'cloud-user'
    getIndexMock.mockResolvedValue({
      userId: 'cloud-user',
      characters: {
        default: {
          activeSessionId: localMeta.sessionId,
          sessions: { [localMeta.sessionId]: localMeta },
        },
      },
    })
    getSessionMock.mockImplementation((sessionId) => {
      if (sessionId === remoteChat.id) {
        return Promise.resolve({
          meta: {
            sessionId: remoteChat.id,
            userId: 'cloud-user',
            characterId: 'default',
            createdAt: Date.parse(remoteChat.createdAt),
            updatedAt: Date.parse(remoteChat.updatedAt),
            cloudChatId: remoteChat.id,
          },
          messages: [],
        })
      }
      return Promise.resolve({ meta: localMeta, messages: [] })
    })
    listChatsMock.mockResolvedValue([remoteChat])
    reconcileLocalAndRemoteMock.mockReturnValue({ adopt: [remoteChat], claim: [], create: [] })
    pullMessagesMock
      .mockRejectedValueOnce(new Error('temporary cloud failure'))
      .mockResolvedValueOnce({ messages: [], seq: 0 })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = useChatSessionStore()
    await store.initialize()
    expect(cloudStatusListener).toBeDefined()

    cloudWsStatus = 'open'
    cloudStatusListener?.('open')
    await vi.waitFor(() => {
      expect(store.cloudSyncReady).toBe(true)
    })
    expect(pullMessagesMock).toHaveBeenCalledTimes(1)

    await store.setActiveSession(remoteChat.id)

    expect(pullMessagesMock).toHaveBeenCalledTimes(2)
  })
})

describe('chat-session-store · cloud deletion', () => {
  it('tombstones an unmapped cloud session before an in-flight create can finish', async () => {
    // ROOT CAUSE:
    //
    // A newly created cloud session can be deleted before POST /chats binds
    // its cloud id. Without a tombstone for the deterministic session id, the
    // completed remote create is adopted again by the next reconcile.
    userIdRef.value = 'cloud-user'
    const deleted: ChatSessionMeta = {
      sessionId: 'pending-cloud-session',
      userId: 'cloud-user',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    const survivor: ChatSessionMeta = {
      sessionId: 'surviving-session',
      userId: 'cloud-user',
      characterId: 'default',
      createdAt: 2,
      updatedAt: 2,
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'surviving-session',
      sessionMessages: { 'pending-cloud-session': [], 'surviving-session': [] },
      sessionMetas: { 'pending-cloud-session': deleted, 'surviving-session': survivor },
      index: {
        userId: 'cloud-user',
        characters: {
          default: {
            activeSessionId: 'pending-cloud-session',
            sessions: { 'pending-cloud-session': deleted, 'surviving-session': survivor },
          },
        },
      },
    })

    await store.deleteSession('pending-cloud-session')

    expect(addTombstoneMock).toHaveBeenCalledWith('cloud-user', 'pending-cloud-session')
    expect(deleteCloudChatMock).not.toHaveBeenCalled()
  })
})

describe('chat-session-store · active card prompt edits', () => {
  // https://github.com/moeru-ai/airi/discussions/2239
  it('adds the AIRI chat math syntax to the system message for Issue #2239', async () => {
    const store = useChatSessionStore()
    await store.initialize()

    const content = store.messages[0]?.content

    expect(content).toContain('Use $$...$$ for inline math.')
    expect(content).toContain('Use a separate multiline $$ block for each display equation.')
    expect(content).toContain('Use a latex fence for a list of independent one-line equations.')
    expect(content).toContain('Use a math fence for one multiline equation or LaTeX environment.')
    expect(content).toContain('Do not use single dollar signs as math delimiters.')
    expect(content).not.toContain('eg: $ x^3 $')
  })

  // ROOT CAUSE:
  //
  // Editing the active card updates `systemPrompt`, but the session store only
  // used that value when creating or resetting a session. The current
  // conversation therefore kept sending its stale system message until the
  // user manually started a new session.
  //
  // We fix this by replacing only the current character session's system
  // message when its resolved card prompt changes, while preserving the
  // message identity and conversation history.
  // https://github.com/moeru-ai/airi/issues/1995
  it('updates the current session system message for Issue #1995 without clearing its history', async () => {
    systemPromptRef.value = 'Original character prompt'
    const store = useChatSessionStore()
    await store.initialize()

    const sessionId = store.activeSessionId
    const originalSystemMessage = store.messages[0]
    store.appendSessionMessage(sessionId, {
      role: 'user',
      content: 'Keep this turn.',
      id: 'user-message',
      createdAt: 2,
    })

    systemPromptRef.value = 'Updated character prompt'
    await nextTick()

    expect(store.messages).toHaveLength(2)
    expect(store.messages[0]?.role).toBe('system')
    expect(store.messages[0]?.id).toBe(originalSystemMessage?.id)
    expect(store.messages[0]?.createdAt).toBe(originalSystemMessage?.createdAt)
    expect(store.messages[0]?.content).toContain('Updated character prompt')
    expect(store.messages[0]?.content).not.toContain('Original character prompt')
    expect(store.messages[1]?.content).toBe('Keep this turn.')
  })

  // https://github.com/moeru-ai/airi/issues/1995
  it('hydrates a persisted Issue #1995 session before refreshing its system message', async () => {
    const meta: ChatSessionMeta = {
      sessionId: 'persisted-session',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    getIndexMock.mockResolvedValue({
      userId: 'local',
      characters: {
        default: {
          activeSessionId: meta.sessionId,
          sessions: { [meta.sessionId]: meta },
        },
      },
    })

    let resolveStoredSession: ((record: ChatSessionRecord) => void) | undefined
    getSessionMock.mockImplementation(() => new Promise<ChatSessionRecord | null>((resolve) => {
      resolveStoredSession = resolve
    }))

    systemPromptRef.value = 'Updated persisted prompt'
    const store = useChatSessionStore()
    const initializePromise = store.initialize()
    await flushMicrotasks()

    // Updating the active session id must not persist a fresh system message
    // over history that has not finished loading from IndexedDB.
    expect(store.sessionMessages[meta.sessionId]).toBeUndefined()

    resolveStoredSession?.({
      meta,
      messages: [
        {
          role: 'system',
          content: 'Stale persisted prompt',
          id: 'system-message',
          createdAt: 1,
        },
        {
          role: 'user',
          content: 'Persisted history',
          id: 'user-message',
          createdAt: 2,
        },
      ],
    })
    await initializePromise
    await nextTick()

    expect(store.messages).toHaveLength(2)
    expect(store.messages[0]?.id).toBe('system-message')
    expect(store.messages[0]?.content).toContain('Updated persisted prompt')
    expect(store.messages[1]?.content).toBe('Persisted history')
  })
})

describe('chat-session-store · synchronized data actions', () => {
  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3755711151
  it('keeps cloud synchronization in the elected leader for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Window-local initialization opened a cloud WebSocket in every window.
    // Follower callbacks then proposed direct full-state mutations.
    const store = useChatSessionStore()
    store.setCloudSyncOwnership(false)
    await store.initialize()

    userIdRef.value = 'cloud-user'
    await nextTick()
    expect(connectCloudWsMock).not.toHaveBeenCalled()

    store.setCloudSyncOwnership(true)
    expect(connectCloudWsMock).toHaveBeenCalledTimes(1)
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743242525
  it('initializes a new window selection from the synchronized index for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // `ready` was synchronized while selection was not. A joining window saw
    // the leader's ready flag, skipped initialization, and remained on an
    // empty local selection.
    const session: ChatSessionMeta = {
      sessionId: 'session-b',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    const store = useChatSessionStore()
    store.$patch({
      sessionMessages: { 'session-b': [{ id: 'system', role: 'system', content: 'prompt' }] },
      sessionMetas: { 'session-b': session },
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'session-b',
            sessions: { 'session-b': session },
          },
        },
      },
    })

    expect(store.$state).not.toHaveProperty('ready')
    expect(store.activeSessionId).toBe('')

    await store.initialize()

    expect(store.activeSessionId).toBe('session-b')
    expect(store.isReady).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743242529
  it('trusts synchronized messages instead of merging a stale follower IDB record for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Follower hydration read its own older IndexedDB record and mutated the
    // fully synchronized store, allowing that stale snapshot to overwrite the
    // leader's newer messages or resurrect a deleted session.
    const session: ChatSessionMeta = {
      sessionId: 'session-b',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 2,
    }
    getSessionMock.mockResolvedValue({
      meta: { ...session, updatedAt: 1 },
      messages: [{ id: 'stale', role: 'user', content: 'stale follower data' }],
    })
    const store = useChatSessionStore()
    store.$patch({
      sessionMessages: {
        'session-b': [{ id: 'current', role: 'assistant', content: 'leader data', slices: [], tool_results: [] }],
      },
      sessionMetas: { 'session-b': session },
    })

    await expect(store.loadSession('session-b')).resolves.toBe(true)

    expect(getSessionMock).not.toHaveBeenCalled()
    expect(store.getSessionMessagesIfLoaded('session-b')?.map(message => message.id)).toEqual(['current'])
  })

  it('refreshes an already loaded session from IndexedDB for a completed remote stream', async () => {
    const session: ChatSessionMeta = {
      sessionId: 'session-b',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 2,
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      sessionMessages: { 'session-b': [{ id: 'system', role: 'system', content: 'prompt' }] },
      sessionMetas: { 'session-b': session },
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'session-b',
            sessions: { 'session-b': session },
          },
        },
      },
    })
    getSessionMock.mockResolvedValue({
      meta: session,
      messages: [
        { id: 'system', role: 'system', content: 'prompt' },
        { id: 'assistant', role: 'assistant', content: 'complete answer', slices: [], tool_results: [] },
      ],
    })

    await expect(store.refreshSession('session-b')).resolves.toBe(true)

    expect(getSessionMock).toHaveBeenCalledWith('session-b')
    expect(store.getSessionMessages('session-b').map(message => message.id)).toEqual(['system', 'assistant'])
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743121862
  it('moves a follower away from a session removed by another window for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Synchronized deletion removed B's metadata, but activeSessionId is
    // intentionally window-local. A follower that also selected B therefore
    // kept an invalid selection until it manually chose another session.
    const sessionA: ChatSessionMeta = {
      sessionId: 'session-a',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    const sessionB: ChatSessionMeta = {
      sessionId: 'session-b',
      userId: 'local',
      characterId: 'default',
      createdAt: 2,
      updatedAt: 2,
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      sessionMessages: { 'session-a': [], 'session-b': [] },
      sessionMetas: { 'session-a': sessionA, 'session-b': sessionB },
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'session-a',
            sessions: { 'session-a': sessionA, 'session-b': sessionB },
          },
        },
      },
    })
    await nextTick()

    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      sessionMessages: { 'session-a': [] },
      sessionMetas: { 'session-a': sessionA },
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'session-a',
            sessions: { 'session-a': sessionA },
          },
        },
      },
    })
    await nextTick()

    expect(store.activeSessionId).toBe('session-a')
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743221033
  it('waits for the leader replacement when every window loses its last session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Every follower independently created a replacement when synchronized
    // deletion temporarily left no metadata. Multiple windows could therefore
    // turn one deletion into several empty chats before state converged.
    const removedSession: ChatSessionMeta = {
      sessionId: 'session-b',
      userId: 'local',
      characterId: 'default',
      createdAt: 1,
      updatedAt: 1,
    }
    const replacementSession: ChatSessionMeta = {
      sessionId: 'session-c',
      userId: 'local',
      characterId: 'default',
      createdAt: 2,
      updatedAt: 2,
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      sessionMessages: { 'session-b': [] },
      sessionMetas: { 'session-b': removedSession },
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'session-b',
            sessions: { 'session-b': removedSession },
          },
        },
      },
    })
    await nextTick()
    saveSessionMock.mockClear()

    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      sessionMessages: {},
      sessionMetas: {},
      index: { userId: 'local', characters: {} },
    })
    await nextTick()

    expect(saveSessionMock).not.toHaveBeenCalled()
    expect(store.activeSessionId).toBe('session-b')

    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      sessionMessages: { 'session-c': [] },
      sessionMetas: { 'session-c': replacementSession },
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'session-c',
            sessions: { 'session-c': replacementSession },
          },
        },
      },
    })
    await nextTick()

    expect(store.activeSessionId).toBe('session-c')
  })

  it('deletes a message by its stable id from the specified session', async () => {
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-1',
      sessionMessages: {
        'session-1': [
          { id: 'keep', role: 'user', content: 'keep' },
          { id: 'delete', role: 'assistant', content: 'delete', slices: [], tool_results: [] },
        ],
      },
      sessionMetas: {},
    })

    await store.deleteMessage({
      sessionId: 'session-1',
      messageId: 'delete',
    })

    expect(store.getSessionMessages('session-1').map(message => message.id)).toEqual(['keep'])
  })

  it('keeps window-local selection out of synchronized and persisted session state', async () => {
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'persisted-session',
      index: {
        userId: 'local',
        characters: {
          default: {
            activeSessionId: 'persisted-session',
            sessions: {},
          },
        },
      },
      sessionMessages: {
        'window-local-session': [{ id: 'system', role: 'system', content: 'prompt' }],
      },
      sessionMetas: {},
    })

    await store.setActiveSession('window-local-session')

    expect(store.activeSessionId).toBe('window-local-session')
    expect(store.$state).not.toHaveProperty('activeSessionId')
    expect(store.getSnapshot().index?.characters.default?.activeSessionId).toBe('persisted-session')
  })
})
