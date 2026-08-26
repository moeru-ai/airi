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
    addTombstone: (uid: string, id: string) => addTombstoneMock(uid, id),
    deleteSession: (id: string) => deleteSessionRepoMock(id),
    dequeueOutbox: vi.fn().mockResolvedValue(undefined),
    dropOutboxForSession: (uid: string, id: string) => dropOutboxForSessionMock(uid, id),
    enqueueOutbox: vi.fn().mockResolvedValue(undefined),
    getIndex: (uid: string) => getIndexMock(uid),
    getOutbox: (uid: string) => getOutboxMock(uid),
    getSession: (id: string) => getSessionMock(id),
    getTombstones: (uid: string) => getTombstonesMock(uid),
    removeTombstones: (uid: string, ids: string[]) => removeTombstonesMock(uid, ids),
    saveIndex: (idx: ChatSessionsIndex) => saveIndexMock(idx),
    saveSession: (id: string, rec: ChatSessionRecord) => saveSessionMock(id, rec),
    updateOutboxEntries: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../libs/auth', () => ({
  getAuthToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../libs/auth-fetch', () => ({
  authedFetch: vi.fn().mockResolvedValue({ json: () => Promise.resolve({}), ok: true }),
}))

vi.mock('../../libs/server', () => ({
  SERVER_URL: 'http://test',
}))

// Inert chat-sync surface. The store doesn't drive any cloud writes in these
// tests (anonymous user for one, deferred index for the other), so noops are
// sufficient. We keep `extractMessageText` realistic so message previews work.
vi.mock('../../libs/chat-sync', () => ({
  applyCreateActions: vi.fn().mockResolvedValue([]),
  createChatWsClient: () => ({
    connect: connectCloudWsMock,
    destroy: vi.fn(),
    disconnect: vi.fn(),
    onNewMessages: () => () => {},
    onStatusChange: (listener: (status: 'idle' | 'open') => void) => {
      cloudStatusListener = listener
      return () => {}
    },
    pullMessages: (...args: unknown[]) => pullMessagesMock(...args),
    sendMessages: vi.fn().mockResolvedValue({ ok: true }),
    status: () => cloudWsStatus,
  }),
  createCloudChatMapper: () => ({
    deleteChat: (id: string) => deleteCloudChatMock(id),
    listChats: () => listChatsMock(),
  }),
  extractMessageText: (m: any) => (typeof m?.content === 'string' ? m.content : ''),
  isCloudSyncableMessage: () => false,
  mergeCloudMessagesIntoLocal: () => ({ dirty: false, maxSeq: 0, messages: [] }),
  reconcileLocalAndRemote: (...args: unknown[]) => reconcileLocalAndRemoteMock(...args),
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
  // and the IIFE captures `currentUserId` at start. An explicit A → B identity
  // transition must invalidate A's in-flight read before it hydrates B.
  //
  // We fix this by:
  //   - bumping an `ensureActiveEpoch` and nulling `ensureActivePromise` in
  //     `clearInMemoryState`,
  //   - re-checking the captured epoch after each await inside the IIFE,
  //   - re-checking `sessionMetas[sessionId]` inside `loadSession` so the
  //     post-IDB write does not resurrect cleared state,
  //   - hydrating the new identity only through `activateCurrentUser`.
  it('runs a fresh hydrate for the new user and discards the stale write from the old user', async () => {
    const aSessionMeta: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 1,
      sessionId: 'sess-A',
      updatedAt: 1,
      userId: 'A',
    }
    const aIndex: ChatSessionsIndex = {
      characters: {
        default: {
          activeSessionId: 'sess-A',
          sessions: { 'sess-A': aSessionMeta },
        },
      },
      userId: 'A',
    }
    const bSessionMeta: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 2,
      sessionId: 'sess-B',
      updatedAt: 2,
      userId: 'B',
    }
    const bIndex: ChatSessionsIndex = {
      characters: {
        default: {
          activeSessionId: 'sess-B',
          sessions: { 'sess-B': bSessionMeta },
        },
      },
      userId: 'B',
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
        return Promise.resolve({ messages: [], meta: bSessionMeta })
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

    // The synchronized auth state changes while A's session read is in flight.
    userIdRef.value = 'B'
    await nextTick()
    await flushMicrotasks()

    // Resolve A's IDB read AFTER the swap. With the bug, A's IIFE writes
    // sess-A back into the cleared sessionMetas.
    resolveASessionGet!({ messages: [], meta: aSessionMeta })
    await initPromise.catch(() => {})
    await flushMicrotasks()

    // B's hydrate must have fired. Without the fix, the stale A promise blocks
    // the identity action and B never loads.
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
      characterId: 'default',
      createdAt: 1,
      sessionId: 'sess-1',
      updatedAt: 1,
      userId: 'local',
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
      index: null,
      sessionMessages: {},
      sessionMetas: { 'sess-1': meta },
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
    resolveGet!({ messages: [{ content: 'hi', id: 'm1', role: 'user' } as any], meta })
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
      characterId: 'default',
      createdAt: 1,
      sessionId: 'session-a',
      updatedAt: 1,
      userId: 'local',
    }
    const sessionB: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 2,
      sessionId: 'session-b',
      updatedAt: 2,
      userId: 'local',
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-a',
      index: {
        characters: {
          default: {
            activeSessionId: 'session-b',
            sessions: { 'session-a': sessionA, 'session-b': sessionB },
          },
        },
        userId: 'local',
      },
      sessionMessages: { 'session-a': [], 'session-b': [] },
      sessionMetas: { 'session-a': sessionA, 'session-b': sessionB },
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
      characterId: 'other-character',
      createdAt: 1,
      sessionId: 'leader-session',
      updatedAt: 1,
      userId: 'local',
    }
    const deletedSession: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 2,
      sessionId: 'deleted-session',
      updatedAt: 2,
      userId: 'local',
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'leader-session',
      index: {
        characters: {
          'default': {
            activeSessionId: 'deleted-session',
            sessions: { 'deleted-session': deletedSession },
          },
          'other-character': {
            activeSessionId: 'leader-session',
            sessions: { 'leader-session': leaderSession },
          },
        },
        userId: 'local',
      },
      sessionMessages: { 'deleted-session': [], 'leader-session': [] },
      sessionMetas: { 'deleted-session': deletedSession, 'leader-session': leaderSession },
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
      characterId: 'default',
      createdAt: 1,
      sessionId: 'sess-1',
      updatedAt: 1,
      userId: 'local',
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'sess-1',
      index: null,
      sessionMessages: { 'sess-1': [] },
      sessionMetas: { 'sess-1': meta },
    })

    expect(store.getSessionGeneration('sess-1')).toBe(0)

    await store.deleteSession('sess-1')

    expect(store.getSessionGeneration('sess-1')).toBe(1)
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3628003766
  it('reports hydration failure and permits a later retry for Issue #2085', async () => {
    const meta: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 1,
      sessionId: 'sess-1',
      updatedAt: 1,
      userId: 'local',
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getSessionMock
      .mockRejectedValueOnce(new Error('IndexedDB read failed'))
      .mockResolvedValueOnce(null)

    userIdRef.value = 'local'
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: '',
      index: null,
      sessionMessages: {},
      sessionMetas: { 'sess-1': meta },
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
      characterId: 'default',
      createdAt: 1,
      sessionId: 'local-session',
      updatedAt: 1,
      userId: 'cloud-user',
    }
    const remoteChat = {
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'remote-session',
      title: null,
      type: 'bot' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    userIdRef.value = 'cloud-user'
    getIndexMock.mockResolvedValue({
      characters: {
        default: {
          activeSessionId: localMeta.sessionId,
          sessions: { [localMeta.sessionId]: localMeta },
        },
      },
      userId: 'cloud-user',
    })
    getSessionMock.mockImplementation((sessionId) => {
      if (sessionId === remoteChat.id) {
        return Promise.resolve({
          messages: [],
          meta: {
            characterId: 'default',
            cloudChatId: remoteChat.id,
            createdAt: Date.parse(remoteChat.createdAt),
            sessionId: remoteChat.id,
            updatedAt: Date.parse(remoteChat.updatedAt),
            userId: 'cloud-user',
          },
        })
      }
      return Promise.resolve({ messages: [], meta: localMeta })
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
      characterId: 'default',
      createdAt: 1,
      sessionId: 'pending-cloud-session',
      updatedAt: 1,
      userId: 'cloud-user',
    }
    const survivor: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 2,
      sessionId: 'surviving-session',
      updatedAt: 2,
      userId: 'cloud-user',
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'surviving-session',
      index: {
        characters: {
          default: {
            activeSessionId: 'pending-cloud-session',
            sessions: { 'pending-cloud-session': deleted, 'surviving-session': survivor },
          },
        },
        userId: 'cloud-user',
      },
      sessionMessages: { 'pending-cloud-session': [], 'surviving-session': [] },
      sessionMetas: { 'pending-cloud-session': deleted, 'surviving-session': survivor },
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
      content: 'Keep this turn.',
      createdAt: 2,
      id: 'user-message',
      role: 'user',
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
      characterId: 'default',
      createdAt: 1,
      sessionId: 'persisted-session',
      updatedAt: 1,
      userId: 'local',
    }
    getIndexMock.mockResolvedValue({
      characters: {
        default: {
          activeSessionId: meta.sessionId,
          sessions: { [meta.sessionId]: meta },
        },
      },
      userId: 'local',
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
      messages: [
        {
          content: 'Stale persisted prompt',
          createdAt: 1,
          id: 'system-message',
          role: 'system',
        },
        {
          content: 'Persisted history',
          createdAt: 2,
          id: 'user-message',
          role: 'user',
        },
      ],
      meta,
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
  it('keeps synchronized session data when a follower receives authenticated user state', async () => {
    // ROOT CAUSE:
    //
    // A new settings window received the synchronized auth user after its
    // chat-session store was created. The userId watcher then cleared the
    // synchronized session state in that follower. pinia-plugin-synced sent
    // the empty full-state proposal to the leader and removed chat messages
    // from every window.
    //
    // The watcher routes the identity transition to an idempotent synchronized
    // action. The action keeps state that already belongs to the current user.
    const session: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 1,
      sessionId: 'session-a',
      updatedAt: 1,
      userId: 'cloud-user',
    }
    const store = useChatSessionStore()
    store.setCloudSyncOwnership(false)
    store.applyRemoteSnapshot({
      activeSessionId: 'session-a',
      index: {
        characters: {
          default: {
            activeSessionId: 'session-a',
            sessions: { 'session-a': session },
          },
        },
        userId: 'cloud-user',
      },
      sessionMessages: {
        'session-a': [{ content: 'Keep this message', id: 'message-a', role: 'user' }],
      },
      sessionMetas: { 'session-a': session },
    })
    await nextTick()
    await flushMicrotasks()
    const messageIdsBeforeAuthHydration = store.sessionMessages['session-a'].map(message => message.id)
    const metaBeforeAuthHydration = { ...store.sessionMetas['session-a'] }

    userIdRef.value = 'cloud-user'
    await nextTick()
    await flushMicrotasks()

    expect(store.sessionMessages['session-a'].map(message => message.id)).toEqual(messageIdsBeforeAuthHydration)
    expect(store.sessionMetas['session-a']).toEqual(metaBeforeAuthHydration)
    expect(store.activeSessionId).toBe('session-a')
    expect(store.index?.userId).toBe('cloud-user')
  })

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
    await vi.waitFor(() => expect(connectCloudWsMock).toHaveBeenCalledTimes(1))
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743242525
  it('initializes a new window selection from the synchronized index for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // `ready` was synchronized while selection was not. A joining window saw
    // the leader's ready flag, skipped initialization, and remained on an
    // empty local selection.
    const session: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 1,
      sessionId: 'session-b',
      updatedAt: 1,
      userId: 'local',
    }
    const store = useChatSessionStore()
    store.setCloudSyncOwnership(false)
    store.$patch({
      index: {
        characters: {
          default: {
            activeSessionId: 'session-b',
            sessions: { 'session-b': session },
          },
        },
        userId: 'local',
      },
      sessionMessages: { 'session-b': [{ content: 'prompt', id: 'system', role: 'system' }] },
      sessionMetas: { 'session-b': session },
    })

    expect(store.$state).not.toHaveProperty('ready')
    expect(store.activeSessionId).toBe('')

    await store.initialize()

    expect(store.activeSessionId).toBe('session-b')
    expect(store.isReady).toBe(true)
    expect(getSessionMock).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743242529
  it('trusts synchronized messages instead of merging a stale follower IDB record for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Follower hydration read its own older IndexedDB record and mutated the
    // fully synchronized store, allowing that stale snapshot to overwrite the
    // leader's newer messages or resurrect a deleted session.
    const session: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 1,
      sessionId: 'session-b',
      updatedAt: 2,
      userId: 'local',
    }
    getSessionMock.mockResolvedValue({
      messages: [{ content: 'stale follower data', id: 'stale', role: 'user' }],
      meta: { ...session, updatedAt: 1 },
    })
    const store = useChatSessionStore()
    store.$patch({
      sessionMessages: {
        'session-b': [{ content: 'leader data', id: 'current', role: 'assistant', slices: [], tool_results: [] }],
      },
      sessionMetas: { 'session-b': session },
    })

    await expect(store.loadSession('session-b')).resolves.toBe(true)

    expect(getSessionMock).not.toHaveBeenCalled()
    expect(store.getSessionMessagesIfLoaded('session-b')?.map(message => message.id)).toEqual(['current'])
  })

  it('refreshes an already loaded session from IndexedDB for a completed remote stream', async () => {
    const session: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 1,
      sessionId: 'session-b',
      updatedAt: 2,
      userId: 'local',
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      index: {
        characters: {
          default: {
            activeSessionId: 'session-b',
            sessions: { 'session-b': session },
          },
        },
        userId: 'local',
      },
      sessionMessages: { 'session-b': [{ content: 'prompt', id: 'system', role: 'system' }] },
      sessionMetas: { 'session-b': session },
    })
    getSessionMock.mockResolvedValue({
      messages: [
        { content: 'prompt', id: 'system', role: 'system' },
        { content: 'complete answer', id: 'assistant', role: 'assistant', slices: [], tool_results: [] },
      ],
      meta: session,
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
      characterId: 'default',
      createdAt: 1,
      sessionId: 'session-a',
      updatedAt: 1,
      userId: 'local',
    }
    const sessionB: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 2,
      sessionId: 'session-b',
      updatedAt: 2,
      userId: 'local',
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      index: {
        characters: {
          default: {
            activeSessionId: 'session-a',
            sessions: { 'session-a': sessionA, 'session-b': sessionB },
          },
        },
        userId: 'local',
      },
      sessionMessages: { 'session-a': [], 'session-b': [] },
      sessionMetas: { 'session-a': sessionA, 'session-b': sessionB },
    })
    await nextTick()

    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      index: {
        characters: {
          default: {
            activeSessionId: 'session-a',
            sessions: { 'session-a': sessionA },
          },
        },
        userId: 'local',
      },
      sessionMessages: { 'session-a': [] },
      sessionMetas: { 'session-a': sessionA },
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
      characterId: 'default',
      createdAt: 1,
      sessionId: 'session-b',
      updatedAt: 1,
      userId: 'local',
    }
    const replacementSession: ChatSessionMeta = {
      characterId: 'default',
      createdAt: 2,
      sessionId: 'session-c',
      updatedAt: 2,
      userId: 'local',
    }
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      index: {
        characters: {
          default: {
            activeSessionId: 'session-b',
            sessions: { 'session-b': removedSession },
          },
        },
        userId: 'local',
      },
      sessionMessages: { 'session-b': [] },
      sessionMetas: { 'session-b': removedSession },
    })
    await nextTick()
    saveSessionMock.mockClear()

    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      index: { characters: {}, userId: 'local' },
      sessionMessages: {},
      sessionMetas: {},
    })
    await nextTick()

    expect(saveSessionMock).not.toHaveBeenCalled()
    expect(store.activeSessionId).toBe('session-b')

    store.applyRemoteSnapshot({
      activeSessionId: 'session-b',
      index: {
        characters: {
          default: {
            activeSessionId: 'session-c',
            sessions: { 'session-c': replacementSession },
          },
        },
        userId: 'local',
      },
      sessionMessages: { 'session-c': [] },
      sessionMetas: { 'session-c': replacementSession },
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
          { content: 'keep', id: 'keep', role: 'user' },
          { content: 'delete', id: 'delete', role: 'assistant', slices: [], tool_results: [] },
        ],
      },
      sessionMetas: {},
    })

    await store.deleteMessage({
      messageId: 'delete',
      sessionId: 'session-1',
    })

    expect(store.getSessionMessages('session-1').map(message => message.id)).toEqual(['keep'])
  })

  it('keeps window-local selection out of synchronized and persisted session state', async () => {
    const store = useChatSessionStore()
    store.applyRemoteSnapshot({
      activeSessionId: 'persisted-session',
      index: {
        characters: {
          default: {
            activeSessionId: 'persisted-session',
            sessions: {},
          },
        },
        userId: 'local',
      },
      sessionMessages: {
        'window-local-session': [{ content: 'prompt', id: 'system', role: 'system' }],
      },
      sessionMetas: {},
    })

    await store.setActiveSession('window-local-session')

    expect(store.activeSessionId).toBe('window-local-session')
    expect(store.$state).not.toHaveProperty('activeSessionId')
    expect(store.getSnapshot().index?.characters.default?.activeSessionId).toBe('persisted-session')
  })
})
