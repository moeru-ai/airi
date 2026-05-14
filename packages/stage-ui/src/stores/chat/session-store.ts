import type { MessageRole, NewMessagesPayload } from '@proj-airi/server-sdk-shared'

import type { ChatSendOutboxEntry } from '../../database/repos/chat-sessions.repo'
import type { ChatWsClient, CloudChatMapper } from '../../libs/chat-sync'
import type { ChatHistoryItem } from '../../types/chat'
import type { ChatSessionMeta, ChatSessionRecord, ChatSessionsExport, ChatSessionsIndex } from '../../types/chat-session'

import { errorMessageFrom } from '@moeru/std'
import { cloneDeep } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { getAuthToken } from '../../libs/auth'
import { authedFetch } from '../../libs/auth-fetch'
import {
  applyCreateActions,
  createChatWsClient,
  createCloudChatMapper,
  extractMessageText,
  isCloudSyncableMessage,
  mergeCloudMessagesIntoLocal,
  reconcileLocalAndRemote,
} from '../../libs/chat-sync'
import { SERVER_URL } from '../../libs/server'
import { useAuthStore } from '../auth'
import { useAiriCardStore } from '../modules/airi-card'
import { mergeLoadedSessionMessages } from './session-message-merge'

/**
 * Roles that are eligible to push to the cloud. Wire schema accepts more,
 *  but our v1 contract only round-trips authored turns.
 */
type CloudSyncableRole = Extract<MessageRole, 'user' | 'assistant'>

/** Payload shape consumed by `mergeCloudMessagesIntoSession`. */
interface CloudMergePayload {
  messages: NewMessagesPayload['messages']
  toSeq?: number
}

/**
 * Max retry attempts before an outbox entry is treated as terminally failed.
 * Failed entries stay in IDB so the user can see them in `outboxPendingCount`
 * and so a future schema migration / manual replay can recover them.
 */
const OUTBOX_MAX_ATTEMPTS = 5

export const useChatSessionStore = defineStore('chat-session', () => {
  const { userId } = storeToRefs(useAuthStore())
  const { activeCardId, systemPrompt } = storeToRefs(useAiriCardStore())

  const activeSessionId = ref<string>('')
  const sessionMessages = ref<Record<string, ChatHistoryItem[]>>({})
  const sessionMetas = ref<Record<string, ChatSessionMeta>>({})
  const sessionGenerations = ref<Record<string, number>>({})
  const index = ref<ChatSessionsIndex | null>(null)

  const ready = ref(false)
  const isReady = computed(() => ready.value)
  const initializing = ref(false)
  let initializePromise: Promise<void> | null = null
  let ensureActivePromise: Promise<void> | null = null
  // Bumped by `clearInMemoryState` (user swap / teardown). The
  // `ensureActiveSessionForCharacter` IIFE captures this at call time and
  // bails after every await once it changes, so a stale hydrate from the
  // previous user cannot write its index/session back into the cleared
  // state once the swap has happened.
  let ensureActiveEpoch = 0

  let persistQueue = Promise.resolve()
  const loadedSessions = new Set<string>()
  const loadingSessions = new Map<string, Promise<void>>()

  // Cloud sync state. The WS client is constructed lazily so anonymous
  // (`userId === 'local'`) users never open a socket. `cloudSyncReady` is a
  // UI-facing readiness flag (true after a successful reconcile); it does
  // NOT gate `pushMessageToCloud`, which writes to the outbox and lets
  // reconnect catch up — that way the very first message in a session does
  // not get dropped while reconcile completes.
  const cloudSyncReady = ref(false)
  /**
   * Number of message sends + tombstone deletes waiting on cloud delivery.
   * Reactive so a UI banner can surface "N messages syncing" / "K failed".
   */
  const outboxPendingCount = ref(0)
  let wsClient: ChatWsClient | undefined
  let cloudMapper: CloudChatMapper | undefined
  let cloudReconcileTask: Promise<void> | undefined
  let pendingReconcile = false
  // Incremented on every teardown / user swap. Long-running reconcile IIFEs
  // capture the epoch at start and bail after every await once it changes,
  // so account-A mutations cannot land on account-B state after a sign-out.
  let reconcileEpoch = 0
  // Single-flight guard for outbox drain so concurrent `reconcile end` +
  // `pushMessageToCloud post-enqueue` triggers don't double-send.
  let outboxDrainTask: Promise<void> | undefined

  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  function getCurrentUserId() {
    return userId.value || 'local'
  }

  function getCurrentCharacterId() {
    return activeCardId.value || 'default'
  }

  function getCloudMapper(): CloudChatMapper {
    if (!cloudMapper) {
      // authedFetch handles 401 → token-refresh → retry transparently, so
      // reconcile / DELETE survive expired tokens without bouncing through
      // a full WS reconnect cycle.
      cloudMapper = createCloudChatMapper({ serverUrl: SERVER_URL, fetch: authedFetch })
    }
    return cloudMapper
  }

  /**
   * Append a write task to the persist queue. Tasks always run sequentially
   * regardless of whether prior tasks rejected — but rejections propagate to
   * the awaiting caller AND are surfaced via console for debugging. The
   * previous `then(task, task)` form silently swallowed prior rejections by
   * running the next task as the rejection handler, which masked IDB
   * failures from the cloud-sync cursor tracking that depends on them.
   */
  function enqueuePersist<T>(task: () => Promise<T>): Promise<T> {
    const next = persistQueue.then(task)
    // Keep the queue alive after a rejection but log it so silent IDB
    // failures (quota, corruption) surface during dev.
    persistQueue = next.then(
      () => undefined,
      (err) => {
        console.warn('[chat-session] persist task failed:', errorMessageFrom(err))
      },
    )
    return next
  }

  function snapshotMessages(messages: ChatHistoryItem[]) {
    return cloneDeep(messages)
  }

  function ensureSessionMessageIds(sessionId: string) {
    const current = sessionMessages.value[sessionId] ?? []
    let changed = false
    const next = current.map((message) => {
      if (message.id)
        return message
      changed = true
      return {
        ...message,
        id: nanoid(),
      }
    })

    if (changed)
      sessionMessages.value[sessionId] = next

    return next
  }

  function generateInitialMessageFromPrompt(prompt: string) {
    const content = codeBlockSystemPrompt + mathSyntaxSystemPrompt + prompt

    return {
      role: 'system',
      content,
      id: nanoid(),
      createdAt: Date.now(),
    } satisfies ChatHistoryItem
  }

  function generateInitialMessage() {
    return generateInitialMessageFromPrompt(systemPrompt.value)
  }

  function ensureGeneration(sessionId: string) {
    if (sessionGenerations.value[sessionId] === undefined)
      sessionGenerations.value[sessionId] = 0
  }

  async function loadIndexForUser(currentUserId: string) {
    const stored = await chatSessionsRepo.getIndex(currentUserId)
    index.value = stored ?? {
      userId: currentUserId,
      characters: {},
    }
    // Hydrate `sessionMetas` from the index so consumers like the sessions
    // drawer can list every owned session without having to `loadSession`
    // each one (which would pull every messages payload from IndexedDB).
    // Existing entries win to preserve any in-memory mutations the store
    // performed before the index landed.
    if (index.value) {
      for (const character of Object.values(index.value.characters)) {
        for (const [sessionId, meta] of Object.entries(character.sessions)) {
          if (!sessionMetas.value[sessionId])
            sessionMetas.value[sessionId] = meta
        }
      }
    }
  }

  function getCharacterIndex(characterId: string) {
    if (!index.value)
      return null
    return index.value.characters[characterId] ?? null
  }

  async function persistIndex() {
    if (!index.value)
      return
    const snapshot = cloneDeep(index.value)
    await enqueuePersist(() => chatSessionsRepo.saveIndex(snapshot))
  }

  async function persistSession(sessionId: string) {
    await enqueuePersist(async () => {
      const meta = sessionMetas.value[sessionId]
      if (!meta)
        return

      const messages = snapshotMessages(ensureSessionMessageIds(sessionId))
      const now = Date.now()
      const updatedMeta = {
        ...meta,
        updatedAt: now,
      }

      sessionMetas.value[sessionId] = updatedMeta
      const characterIndex = index.value?.characters[meta.characterId]
      if (characterIndex)
        characterIndex.sessions[sessionId] = updatedMeta

      const record: ChatSessionRecord = {
        meta: updatedMeta,
        messages,
      }

      await chatSessionsRepo.saveSession(sessionId, record)

      if (index.value) {
        const snapshot = cloneDeep(index.value)
        await chatSessionsRepo.saveIndex(snapshot)
      }
    })
  }

  function persistSessionMessages(sessionId: string) {
    void persistSession(sessionId)
  }

  function replaceSessionMessages(sessionId: string, next: ChatHistoryItem[], options?: { persist?: boolean }) {
    sessionMessages.value[sessionId] = next

    if (options?.persist !== false)
      void persistSession(sessionId)
  }

  function setSessionMessages(sessionId: string, next: ChatHistoryItem[]) {
    replaceSessionMessages(sessionId, next)
  }

  function appendSessionMessage(sessionId: string, message: ChatHistoryItem) {
    ensureSession(sessionId)
    replaceSessionMessages(sessionId, [
      ...(sessionMessages.value[sessionId] ?? []),
      message,
    ])
  }

  /**
   * Hydrate a single session's messages from IDB into memory. Idempotent —
   * subsequent calls for the same id are no-ops.
   *
   * Use when:
   * - The drawer is opening, the user is switching to a session, or any
   *   caller needs the full message list (not just the meta record).
   *
   * Expects:
   * - `sessionId` exists either in `sessionMetas` or in IDB.
   *
   * Returns:
   * - Resolves once the session is in memory. On IDB error, removes the id
   *   from the loading map so subsequent calls can retry rather than wedge
   *   on a stale promise. Errors are intentionally not rethrown — the
   *   failing session is simply absent from local state and the next
   *   loadSession call will retry.
   */
  async function loadSession(sessionId: string) {
    if (loadedSessions.has(sessionId)) {
      return
    }
    if (loadingSessions.has(sessionId)) {
      await loadingSessions.get(sessionId)
      return
    }

    const loadPromise = (async () => {
      try {
        const stored = await chatSessionsRepo.getSession(sessionId)
        // Re-check existence: `deleteSession` (or `clearInMemoryState` on a
        // user swap) may have run while we were awaiting IDB. Without this
        // guard, the post-await write resurrects the deleted entry and
        // `loadedSessions.add` then short-circuits every future legitimate
        // load — locking the resurrection in. The drawer's batch
        // loadSession + per-row trash button hits this race in production.
        if (!sessionMetas.value[sessionId])
          return
        if (stored) {
          const currentMessages = sessionMessages.value[sessionId] ?? []
          const mergedMessages = mergeLoadedSessionMessages(stored.messages, currentMessages)

          sessionMetas.value[sessionId] = stored.meta
          replaceSessionMessages(sessionId, mergedMessages, { persist: false })
          ensureGeneration(sessionId)

          if (mergedMessages !== stored.messages)
            await persistSession(sessionId)
        }
        loadedSessions.add(sessionId)

        // Cloud gap fill: when the session is mapped to a cloud chat, ask
        // the server for everything past our highest known seq. Best
        // effort — failures are logged inside pullCloudMessages and the
        // local view stays usable.
        const meta = sessionMetas.value[sessionId]
        if (meta?.cloudChatId)
          await pullCloudMessages(sessionId)
      }
      catch (err) {
        // Do NOT add to loadedSessions on failure — the next call should
        // retry rather than fast-return on stale "already loaded" state.
        console.warn('[chat-session] loadSession failed for', sessionId, errorMessageFrom(err))
      }
    })()

    loadingSessions.set(sessionId, loadPromise)
    try {
      await loadPromise
    }
    finally {
      // Always drain the loading map so a transient failure does not leave
      // a permanent wedge entry.
      loadingSessions.delete(sessionId)
    }
  }

  /**
   * Mint a new session for `characterId`, optionally seeding it with messages
   * and / or a title. Persists the new session and its index entry, then
   * (when signed in) kicks off a fire-and-forget cloud reconcile so the new
   * session gets a `cloudChatId` before the first message lands.
   *
   * Use when:
   * - The drawer's "+ New" button fires, the active card changes and the
   *   user has no session for that card yet, or `forkSession` needs a new
   *   destination.
   *
   * Expects:
   * - The store is initialized (or being initialized via `initialize()`).
   *
   * Returns:
   * - The new session id. When `setActive` is not `false` the session is
   *   also made the active one.
   */
  async function createSession(characterId: string, options?: { setActive?: boolean, messages?: ChatHistoryItem[], title?: string }) {
    const currentUserId = getCurrentUserId()
    const sessionId = nanoid()
    const now = Date.now()
    const meta: ChatSessionMeta = {
      sessionId,
      userId: currentUserId,
      characterId,
      title: options?.title,
      createdAt: now,
      updatedAt: now,
    }

    const initialMessages = options?.messages?.length ? cloneDeep(options.messages) : [generateInitialMessage()]

    sessionMetas.value[sessionId] = meta
    replaceSessionMessages(sessionId, initialMessages, { persist: false })
    loadedSessions.add(sessionId)
    ensureGeneration(sessionId)

    if (!index.value)
      index.value = { userId: currentUserId, characters: {} }

    const characterIndex = index.value.characters[characterId] ?? {
      activeSessionId: sessionId,
      sessions: {},
    }
    characterIndex.sessions[sessionId] = meta
    if (options?.setActive !== false)
      characterIndex.activeSessionId = sessionId
    index.value.characters[characterId] = characterIndex

    const record: ChatSessionRecord = { meta, messages: initialMessages }
    await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, record))
    await persistIndex()

    if (options?.setActive !== false)
      activeSessionId.value = sessionId

    // Fire-and-forget cloud reconcile so the freshly-minted session gets a
    // `cloudChatId` (POST /api/v1/chats) before the user types into it.
    // Reentrant: `reconcileCloudSessions` itself guards on `cloudReconcileTask`
    // so concurrent triggers collapse to a single in-flight task.
    if (currentUserId !== 'local')
      void reconcileCloudSessions()

    return sessionId
  }

  /**
   * Permanently remove a session from the local index + IDB and, when the
   * session is cloud-mapped and the user is signed in, soft-delete the
   * server chat via `DELETE /api/v1/chats/:id`.
   *
   * Use when:
   * - The user explicitly chooses "delete" from the sessions drawer.
   *
   * Expects:
   * - The caller does not need to pre-confirm: this method is destructive.
   *   When the deleted session is the active one, the store falls back to
   *   another session for the same character or creates a fresh one.
   *
   * Returns:
   * - Resolves once both local state and (if applicable) the remote DELETE
   *   call have settled. Cloud failures are swallowed with a console.warn —
   *   the local removal goes through either way so the user does not see
   *   a "ghost" session after the click. A tombstone is written so the
   *   reconcile `adopt` branch will not re-import the row on next login.
   */
  async function deleteSession(sessionId: string) {
    const meta = sessionMetas.value[sessionId]
    if (!meta)
      return

    const wasActive = activeSessionId.value === sessionId
    const characterId = meta.characterId
    const cloudChatId = meta.cloudChatId
    const currentUserId = getCurrentUserId()
    const isCloudUser = currentUserId !== 'local'

    // ROOT CAUSE:
    //
    // If we awaited the cloud DELETE before mutating in-memory state, any
    // other code path firing a `persistSession` during that await would
    // snapshot the index *with the doomed entry still in it* and write that
    // snapshot to IDB. The user then sees the row reappear after a reload.
    //
    // Old behavior: await mapper.deleteChat → mutate → persist; the
    // overlapping persistSession races us and wins.
    //
    // We fixed this by performing every in-memory and IDB mutation
    // synchronously up front, then firing the cloud DELETE as
    // fire-and-forget. Persistence races now read the post-deletion state.
    delete sessionMetas.value[sessionId]
    delete sessionMessages.value[sessionId]
    delete sessionGenerations.value[sessionId]
    loadedSessions.delete(sessionId)
    loadingSessions.delete(sessionId)

    if (index.value) {
      const characterIndex = index.value.characters[characterId]
      if (characterIndex) {
        delete characterIndex.sessions[sessionId]
        if (characterIndex.activeSessionId === sessionId)
          characterIndex.activeSessionId = ''
      }
    }

    await enqueuePersist(() => chatSessionsRepo.deleteSession(sessionId))
    // Drop any pending outbox sends for this session — pushing messages
    // to a deleted chat is wasted work and may surface as a server-side
    // 404/410 next time we drain.
    if (isCloudUser)
      await enqueuePersist(() => chatSessionsRepo.dropOutboxForSession(currentUserId, sessionId))
    await persistIndex()
    await refreshOutboxPendingCount()

    if (cloudChatId && isCloudUser) {
      // Tombstone first: even if the cloud DELETE never reaches the server
      // (offline, transient 5xx), the next reconcile will see the cloudChatId
      // here and skip the adopt branch — preventing the ghost-session bug
      // where the server still has the row and re-creates the local mapping.
      // The reconcile-driven `drainTombstones` retries failed DELETEs.
      await enqueuePersist(() => chatSessionsRepo.addTombstone(currentUserId, cloudChatId))
      getCloudMapper().deleteChat(cloudChatId).then(
        async () => {
          // Server confirmed the delete; reconcile will not see this id again,
          // so we can drop the tombstone.
          await enqueuePersist(() => chatSessionsRepo.removeTombstones(currentUserId, [cloudChatId]))
        },
        (err) => {
          console.warn('[chat-sync] DELETE /api/v1/chats failed for', sessionId, errorMessageFrom(err))
        },
      )
    }

    // If the deleted session was active, pick another for the same
    // character or mint a fresh one so the chat surface never lands on an
    // empty void.
    if (wasActive) {
      const characterIndex = index.value?.characters[characterId]
      const fallbackId = characterIndex
        ? Object.keys(characterIndex.sessions).find(id => sessionMetas.value[id])
        : undefined
      if (fallbackId) {
        activeSessionId.value = fallbackId
        if (characterIndex)
          characterIndex.activeSessionId = fallbackId
        await loadSession(fallbackId)
        await persistIndex()
      }
      else {
        await createSession(characterId, { setActive: true })
      }
    }
  }

  /**
   * Load the per-user index, pick (or mint) the active session for the
   * current character, and hydrate it into memory. Reentrant: concurrent
   * callers share a single in-flight promise so a rapid `[userId, characterId]`
   * change burst does not produce duplicate sessions.
   */
  async function ensureActiveSessionForCharacter(): Promise<void> {
    if (ensureActivePromise)
      return ensureActivePromise
    const myEpoch = ensureActiveEpoch
    const isStaleEpoch = () => myEpoch !== ensureActiveEpoch
    ensureActivePromise = (async () => {
      const currentUserId = getCurrentUserId()
      const characterId = getCurrentCharacterId()

      if (!index.value || index.value.userId !== currentUserId)
        await loadIndexForUser(currentUserId)
      if (isStaleEpoch())
        return

      const characterIndex = getCharacterIndex(characterId)
      if (!characterIndex) {
        await createSession(characterId)
        return
      }

      if (!characterIndex.activeSessionId) {
        await createSession(characterId)
        return
      }

      activeSessionId.value = characterIndex.activeSessionId
      await loadSession(characterIndex.activeSessionId)
      if (isStaleEpoch())
        return
      ensureSession(characterIndex.activeSessionId)
    })()
    try {
      await ensureActivePromise
    }
    finally {
      // Only release the slot if we still own it. A user swap mid-flight
      // bumps the epoch and `clearInMemoryState` already nulled the slot —
      // a fresh hydrate may now own it and unconditional null would clobber
      // the new owner.
      if (myEpoch === ensureActiveEpoch)
        ensureActivePromise = null
    }
  }

  /**
   * Lookup local sessionId from a cloud chatId.
   *
   * Used when receiving `newMessages` push events that only carry `chatId`.
   * Returns `undefined` if the chat is not yet mapped to a local session.
   */
  function findSessionIdByCloudChatId(cloudChatId: string): string | undefined {
    for (const meta of Object.values(sessionMetas.value)) {
      if (meta.cloudChatId === cloudChatId)
        return meta.sessionId
    }
    return undefined
  }

  /**
   * Merge cloud-sourced messages into a local session, deduping by id and
   * advancing `cloudMaxSeq`. Locally-authored versions of the same id are
   * preserved (their slices / tool calls carry richer content than the wire
   * format) — only truly new ids are appended.
   *
   * Persistence is queued through the existing `persistSession` pipeline.
   */
  function mergeCloudMessagesIntoSession(sessionId: string, payload: CloudMergePayload) {
    const meta = sessionMetas.value[sessionId]
    if (!meta)
      return

    const current = sessionMessages.value[sessionId] ?? []
    const merged = mergeCloudMessagesIntoLocal(current, meta.cloudMaxSeq ?? 0, payload)
    if (!merged.dirty)
      return

    sessionMessages.value[sessionId] = merged.messages
    sessionMetas.value[sessionId] = { ...meta, cloudMaxSeq: merged.maxSeq }
    void persistSession(sessionId)
  }

  /**
   * Pull-and-merge gap fill for a single session. Safe to call multiple
   * times; uses `meta.cloudMaxSeq` as the cursor.
   */
  async function pullCloudMessages(sessionId: string) {
    if (!wsClient || wsClient.status() !== 'open')
      return
    const meta = sessionMetas.value[sessionId]
    if (!meta?.cloudChatId)
      return

    try {
      const result = await wsClient.pullMessages({
        chatId: meta.cloudChatId,
        afterSeq: meta.cloudMaxSeq ?? 0,
      })
      mergeCloudMessagesIntoSession(sessionId, {
        messages: result.messages,
        toSeq: result.seq,
      })
    }
    catch (err) {
      console.warn('[chat-sync] pullMessages failed for', sessionId, errorMessageFrom(err))
    }
  }

  /**
   * Reconcile local sessions against the server `chats` table. Called after
   * the local index loads and after every successful (re)connect.
   *
   * - Local sessions without a `cloudChatId` either claim a remote chat with
   *   the same id or trigger `POST /api/v1/chats` to mint one.
   * - Remote chats that have no local mapping are adopted as empty-shell
   *   sessions; their messages are pulled lazily on first `loadSession`.
   * - Remote chats whose id is in the user's tombstone set are skipped — the
   *   user already deleted them locally and the server-side soft-delete may
   *   not have committed yet.
   *
   * Reentrant: a single in-flight task is shared across concurrent callers.
   * If a new "open" event fires while a reconcile is running, a follow-up
   * pass is scheduled in `finally` so catch-up pulls do not get lost.
   */
  async function reconcileCloudSessions(): Promise<void> {
    if (cloudReconcileTask) {
      pendingReconcile = true
      return cloudReconcileTask
    }

    const myEpoch = reconcileEpoch
    const isStaleEpoch = () => myEpoch !== reconcileEpoch

    cloudReconcileTask = (async () => {
      const currentUserId = getCurrentUserId()
      if (currentUserId === 'local') {
        console.info('[chat-sync] reconcile skipped: anonymous user')
        return
      }

      console.info('[chat-sync] reconcile start', { userId: currentUserId, serverUrl: SERVER_URL })
      const mapper = getCloudMapper()

      let remoteChats
      try {
        remoteChats = await mapper.listChats()
      }
      catch (err) {
        console.warn('[chat-sync] listChats failed; skipping reconcile this round:', errorMessageFrom(err))
        return
      }
      if (isStaleEpoch())
        return
      console.info('[chat-sync] listChats →', remoteChats.length, 'remote chats')

      // Snapshot local metas owned by this user. Anonymous-era sessions are
      // not promoted to the cloud automatically — the user can re-open them
      // after signing in and the server is unaware of them.
      const localOwnedMetas = Object.values(sessionMetas.value).filter(meta => meta.userId === currentUserId)
      const plan = reconcileLocalAndRemote(localOwnedMetas, remoteChats)

      // Tombstones: drop adopt entries for chats the user already deleted.
      // The server's soft-delete may not have committed yet (offline DELETE
      // path), so we still need to remember "do not re-adopt this id".
      const tombstones = await chatSessionsRepo.getTombstones(currentUserId)
      if (isStaleEpoch())
        return
      if (tombstones.length > 0) {
        const tombstoneSet = new Set(tombstones)
        plan.adopt = plan.adopt.filter(chat => !tombstoneSet.has(chat.id))
        // Server-confirmed deletions: any tombstone that no longer appears
        // in the remote list can be cleared.
        const remoteIds = new Set(remoteChats.map(chat => chat.id))
        const stale = tombstones.filter(id => !remoteIds.has(id))
        if (stale.length > 0)
          await enqueuePersist(() => chatSessionsRepo.removeTombstones(currentUserId, stale))
      }

      if (isStaleEpoch())
        return

      // claim: remote chat already exists with the same id; just bind.
      for (const action of plan.claim) {
        const meta = sessionMetas.value[action.sessionId]
        if (!meta)
          continue
        sessionMetas.value[action.sessionId] = { ...meta, cloudChatId: action.cloudChatId }
        void persistSession(action.sessionId)
      }

      // create: POST /api/v1/chats and bind. Mapper handles 409-as-claim.
      const createResults = await applyCreateActions(mapper, plan.create)
      if (isStaleEpoch())
        return
      for (const result of createResults) {
        if (!result.cloudChatId)
          continue
        const meta = sessionMetas.value[result.sessionId]
        if (!meta)
          continue
        sessionMetas.value[result.sessionId] = { ...meta, cloudChatId: result.cloudChatId }
        void persistSession(result.sessionId)

        // Enqueue every pre-existing local syncable message into the
        // outbox so anonymous-era messages and turns typed during the
        // connect handshake make it server-side. The post-reconcile
        // `drainOutbox` will batch-send them. Idempotent: enqueueOutbox
        // overwrites by messageId so re-running reconcile doesn't
        // multiply rows.
        const localMessages = sessionMessages.value[result.sessionId] ?? []
        for (const message of localMessages) {
          if (!message.id || !isCloudSyncableMessage(message))
            continue
          const text = extractMessageText(message)
          if (!text)
            continue
          await enqueuePersist(() => chatSessionsRepo.enqueueOutbox(currentUserId, {
            messageId: message.id!,
            sessionId: result.sessionId,
            cloudChatId: result.cloudChatId,
            role: message.role as CloudSyncableRole,
            content: text,
            attempts: 0,
            queuedAt: Date.now(),
          }))
        }
      }

      // adopt: remote-only chats become empty local sessions. Messages get
      // pulled the first time the user opens them via `loadSession`.
      for (const remote of plan.adopt) {
        if (sessionMetas.value[remote.id])
          continue
        const now = Date.now()
        const adoptedMeta: ChatSessionMeta = {
          sessionId: remote.id,
          userId: currentUserId,
          characterId: 'default',
          title: remote.title ?? undefined,
          createdAt: new Date(remote.createdAt).getTime() || now,
          updatedAt: new Date(remote.updatedAt).getTime() || now,
          cloudChatId: remote.id,
        }
        sessionMetas.value[remote.id] = adoptedMeta
        sessionMessages.value[remote.id] = [generateInitialMessage()]
        ensureGeneration(remote.id)

        if (!index.value)
          index.value = { userId: currentUserId, characters: {} }
        const characterIndex = index.value.characters[adoptedMeta.characterId] ?? {
          activeSessionId: '',
          sessions: {},
        }
        characterIndex.sessions[remote.id] = adoptedMeta
        index.value.characters[adoptedMeta.characterId] = characterIndex

        // Snapshot the messages array — without a clone the subsequent
        // pullCloudMessages would mutate the same reference the queued
        // saveSession is about to read, and the IDB write would be
        // last-writer-wins on stale state.
        const adoptedMessagesSnapshot = snapshotMessages(sessionMessages.value[remote.id])
        await enqueuePersist(() => chatSessionsRepo.saveSession(remote.id, {
          meta: adoptedMeta,
          messages: adoptedMessagesSnapshot,
        }))
      }
      if (isStaleEpoch())
        return
      await persistIndex()

      // After reconcile, fan out a catch-up pull for every session that has
      // a cloudChatId now (claimed + created + previously-mapped). This
      // closes the window between offline writes on other devices and the
      // moment the WS push begins delivering live updates.
      const cloudMappedIds = Object.values(sessionMetas.value)
        .filter(meta => meta.cloudChatId)
        .map(meta => meta.sessionId)
      await Promise.all(cloudMappedIds.map(sessionId => pullCloudMessages(sessionId)))
      if (isStaleEpoch())
        return

      // Drain pending writes after pull so the local view is fully synced
      // both directions. drainOutbox + drainTombstones are independent so
      // run in parallel; both are best-effort and log their own failures.
      await Promise.all([drainOutbox(), drainTombstones()])
      if (isStaleEpoch())
        return

      cloudSyncReady.value = true
    })().finally(() => {
      cloudReconcileTask = undefined
      // A second 'open' event fired while we were running — schedule a
      // follow-up so its catch-up window is not lost. Skip if the epoch
      // changed (auth swap teardown will fire the next reconcile itself).
      if (pendingReconcile && !isStaleEpoch()) {
        pendingReconcile = false
        void reconcileCloudSessions()
      }
      else {
        pendingReconcile = false
      }
    })

    return cloudReconcileTask
  }

  /**
   * Lazy WS client + push handler setup. Reentrant; subsequent calls are
   * no-ops while the existing client is open. Called from `initialize` and
   * from the auth `watch`.
   */
  function ensureCloudWsClient() {
    if (getCurrentUserId() === 'local') {
      console.info('[chat-sync] WS skipped: anonymous user')
      return
    }
    if (wsClient)
      return

    console.info('[chat-sync] creating WS client →', SERVER_URL)
    wsClient = createChatWsClient({
      serverUrl: SERVER_URL,
      getToken: getAuthToken,
    })

    wsClient.onNewMessages((payload) => {
      const sessionId = findSessionIdByCloudChatId(payload.chatId)
      if (!sessionId) {
        // Not yet mapped — likely a chat created on another device that
        // has not been reconciled here yet. Trigger one to adopt it.
        void reconcileCloudSessions()
        return
      }
      mergeCloudMessagesIntoSession(sessionId, payload)
    })

    wsClient.onStatusChange((status) => {
      if (status === 'open') {
        // Reconcile on every open so reconnects after offline windows
        // trigger a catch-up pullMessages for every mapped session.
        void reconcileCloudSessions()
      }
      else if (status === 'closed' || status === 'idle') {
        cloudSyncReady.value = false
      }
    })

    // VueUse `useWebSocket` makes connect synchronous (it just flips the
    // url-driven autoConnect on); failures surface via the status watcher
    // above and the auto-reconnect loop, not as a rejected promise.
    wsClient.connect()
  }

  function teardownCloudWsClient() {
    cloudSyncReady.value = false
    cloudReconcileTask = undefined
    pendingReconcile = false
    // Invalidate any in-flight reconcile IIFE so its post-await mutations
    // do not land on the next user's state.
    reconcileEpoch += 1
    if (wsClient) {
      wsClient.destroy()
      wsClient = undefined
    }
    cloudMapper = undefined
  }

  /**
   * Drop every in-memory session for the current user. Used when the auth
   *  user changes — we must NOT keep account A's sessions visible (or
   *  exportable) when account B signs in. The next ensureActiveSessionForCharacter
   *  pass rehydrates from IDB for the new user.
   */
  function clearInMemoryState() {
    // Invalidate any in-flight `ensureActiveSessionForCharacter` IIFE so its
    // post-await writes do not land on the next user's state, and free the
    // singleflight slot so the post-swap rehydrate can start a fresh IIFE
    // for the new user.
    ensureActiveEpoch += 1
    ensureActivePromise = null
    sessionMessages.value = {}
    sessionMetas.value = {}
    sessionGenerations.value = {}
    loadedSessions.clear()
    loadingSessions.clear()
    index.value = null
    activeSessionId.value = ''
    cloudSyncReady.value = false
    // outbox count reflects the prior user; reset to 0 — the next user's
    // refreshOutboxPendingCount fires from initialize() once they hydrate.
    outboxPendingCount.value = 0
  }

  /**
   * Refresh the reactive `outboxPendingCount` from IDB. Called after every
   * enqueue / dequeue / drain so UI banners stay in sync with reality.
   */
  async function refreshOutboxPendingCount() {
    const userId = getCurrentUserId()
    if (userId === 'local') {
      outboxPendingCount.value = 0
      return
    }
    const entries = await chatSessionsRepo.getOutbox(userId)
    outboxPendingCount.value = entries.length
  }

  /**
   * Ship a single message up to the cloud (eventually).
   *
   * Local-first contract: this method ALWAYS persists the send to the IDB
   * outbox first, then attempts an opportunistic WS dispatch. Failures
   * (offline, WS dropped, server 5xx) leave the entry in the outbox; the
   * next `drainOutbox` (fired on every reconcile / WS-open) retries it.
   *
   * Use when:
   * - The chat orchestrator has just appended a user / assistant turn
   *   locally and wants the server to mirror it for cross-device delivery.
   *
   * Expects:
   * - `message.role` is one of the cloud-syncable roles (`user` /
   *   `assistant`). Tool / system / error roles are rejected by
   *   `isCloudSyncableMessage` upstream and should not reach this function.
   * - The session's `cloudChatId` may be undefined at call time (freshly-
   *   minted local session pre-reconcile). The outbox holds the entry
   *   until reconcile binds the cloudChatId, then `drainOutbox` pushes it.
   *
   * Returns:
   * - Resolves after the IDB outbox write lands. The caller does not
   *   need to await the network round-trip — failed sends are retried
   *   transparently. UI consumers can watch `outboxPendingCount` to
   *   surface "X syncing".
   */
  async function pushMessageToCloud(sessionId: string, message: { id: string, role: CloudSyncableRole, content: string }) {
    const userId = getCurrentUserId()
    if (userId === 'local')
      return

    const entry: ChatSendOutboxEntry = {
      messageId: message.id,
      sessionId,
      cloudChatId: sessionMetas.value[sessionId]?.cloudChatId,
      role: message.role,
      content: message.content,
      attempts: 0,
      queuedAt: Date.now(),
    }
    await enqueuePersist(() => chatSessionsRepo.enqueueOutbox(userId, entry))
    await refreshOutboxPendingCount()

    // Opportunistic immediate send. Skip if WS not open or cloudChatId not
    // yet bound — drainOutbox will pick it up on the next reconcile.
    if (!wsClient || wsClient.status() !== 'open')
      return
    if (!entry.cloudChatId)
      return

    try {
      await wsClient.sendMessages({
        chatId: entry.cloudChatId,
        messages: [{ id: entry.messageId, role: entry.role, content: entry.content }],
      })
      await enqueuePersist(() => chatSessionsRepo.dequeueOutbox(userId, [entry.messageId]))
      await refreshOutboxPendingCount()
    }
    catch (err) {
      const errMsg = errorMessageFrom(err) ?? 'unknown'
      console.warn('[chat-sync] sendMessages failed for', sessionId, errMsg)
      await enqueuePersist(() => chatSessionsRepo.updateOutboxEntries(userId, [{
        messageId: entry.messageId,
        attempts: 1,
        lastError: errMsg,
      }]))
    }
  }

  /**
   * Drain every outbox entry for the current user via batched
   * `sendMessages` calls (one per session). Idempotent and safe to call
   * concurrently — a single-flight guard collapses overlapping triggers.
   *
   * Drain ordering: entries are grouped by sessionId, sorted by `queuedAt`
   * within each session, and sent in a single batch per session. Server
   * accepts client-supplied message ids so retries are idempotent.
   *
   * Entries whose session has no `cloudChatId` yet are skipped (they will
   * land in the next reconcile pass once create / claim binds the id).
   *
   * Entries hitting `OUTBOX_MAX_ATTEMPTS` stay in the outbox so the user
   * can see them via `outboxPendingCount`. They are NOT dropped silently.
   */
  async function drainOutbox(): Promise<void> {
    if (outboxDrainTask)
      return outboxDrainTask
    outboxDrainTask = (async () => {
      const userId = getCurrentUserId()
      if (userId === 'local')
        return
      if (!wsClient || wsClient.status() !== 'open')
        return

      const entries = await chatSessionsRepo.getOutbox(userId)
      if (entries.length === 0)
        return

      // Group by sessionId for batched dispatch; preserve queuedAt order
      // within each session so user-then-assistant turns stay ordered.
      const bySession = new Map<string, ChatSendOutboxEntry[]>()
      for (const entry of entries) {
        if (entry.attempts >= OUTBOX_MAX_ATTEMPTS)
          continue
        const list = bySession.get(entry.sessionId) ?? []
        list.push(entry)
        bySession.set(entry.sessionId, list)
      }

      const succeededIds: string[] = []
      const failedUpdates: Array<Pick<ChatSendOutboxEntry, 'messageId' | 'attempts' | 'lastError'>> = []

      for (const [sessionId, sessionEntries] of bySession) {
        const meta = sessionMetas.value[sessionId]
        const cloudChatId = meta?.cloudChatId
        if (!cloudChatId)
          continue
        if (!wsClient || wsClient.status() !== 'open')
          break

        sessionEntries.sort((a, b) => a.queuedAt - b.queuedAt)
        try {
          await wsClient.sendMessages({
            chatId: cloudChatId,
            messages: sessionEntries.map(e => ({ id: e.messageId, role: e.role, content: e.content })),
          })
          succeededIds.push(...sessionEntries.map(e => e.messageId))
        }
        catch (err) {
          const errMsg = errorMessageFrom(err) ?? 'unknown'
          console.warn('[chat-sync] outbox drain failed for', sessionId, errMsg)
          for (const entry of sessionEntries) {
            failedUpdates.push({
              messageId: entry.messageId,
              attempts: entry.attempts + 1,
              lastError: errMsg,
            })
          }
        }
      }

      if (succeededIds.length > 0)
        await enqueuePersist(() => chatSessionsRepo.dequeueOutbox(userId, succeededIds))
      if (failedUpdates.length > 0)
        await enqueuePersist(() => chatSessionsRepo.updateOutboxEntries(userId, failedUpdates))
      await refreshOutboxPendingCount()
    })().finally(() => {
      outboxDrainTask = undefined
    })
    return outboxDrainTask
  }

  /**
   * Retry every pending tombstone DELETE for the current user. Called from
   * `reconcileCloudSessions` so a sign-back-in after an offline-delete
   * window finishes the soft-delete server-side instead of leaving the
   * row indefinitely (the local tombstone alone only blocks re-adoption).
   *
   * 404 from the server is treated as success — the row is already gone,
   * we just missed the original response.
   */
  async function drainTombstones(): Promise<void> {
    const userId = getCurrentUserId()
    if (userId === 'local')
      return

    const tombstones = await chatSessionsRepo.getTombstones(userId)
    if (tombstones.length === 0)
      return

    const mapper = getCloudMapper()
    const succeeded: string[] = []
    for (const cloudChatId of tombstones) {
      try {
        await mapper.deleteChat(cloudChatId)
        succeeded.push(cloudChatId)
      }
      catch (err) {
        const msg = errorMessageFrom(err) ?? ''
        // 404 = server already cleared it, treat as success so the
        // tombstone gets dropped instead of retried forever.
        if (msg.includes('HTTP 404'))
          succeeded.push(cloudChatId)
        else
          console.warn('[chat-sync] tombstone drain failed for', cloudChatId, msg)
      }
    }
    if (succeeded.length > 0)
      await enqueuePersist(() => chatSessionsRepo.removeTombstones(userId, succeeded))
  }

  async function initialize() {
    if (ready.value) {
      return
    }
    if (initializePromise) {
      return initializePromise
    }
    initializing.value = true
    initializePromise = (async () => {
      await ensureActiveSessionForCharacter()
      ready.value = true
      // Surface any outbox left over from a previous session (closed tab
      // mid-send) before the WS even opens. The drain itself runs after
      // reconcile completes, but the count is observable immediately.
      await refreshOutboxPendingCount()
      ensureCloudWsClient()
    })()

    try {
      await initializePromise
    }
    finally {
      initializePromise = null
      initializing.value = false
    }
  }

  function ensureSession(sessionId: string) {
    ensureGeneration(sessionId)
    if (!sessionMessages.value[sessionId] || sessionMessages.value[sessionId].length === 0) {
      replaceSessionMessages(sessionId, [generateInitialMessage()], { persist: false })
    }
  }

  function hasKnownSession(sessionId: string) {
    return !!sessionMetas.value[sessionId]
      || !!Object.values(index.value?.characters ?? {}).some(character => character.sessions[sessionId])
  }

  const messages = computed<ChatHistoryItem[]>({
    get: () => {
      if (!activeSessionId.value) {
        return []
      }
      if (!loadedSessions.has(activeSessionId.value) && !sessionMessages.value[activeSessionId.value] && hasKnownSession(activeSessionId.value)) {
        return []
      }
      return sessionMessages.value[activeSessionId.value] ?? []
    },
    set: (value) => {
      if (!activeSessionId.value)
        return
      replaceSessionMessages(activeSessionId.value, value)
    },
  })

  function setActiveSession(sessionId: string) {
    activeSessionId.value = sessionId

    const characterId = getCurrentCharacterId()
    const characterIndex = index.value?.characters[characterId]
    if (characterIndex) {
      characterIndex.activeSessionId = sessionId
      void persistIndex()
    }

    if (ready.value) {
      void loadSession(sessionId)
    }
    else if (!hasKnownSession(sessionId)) {
      ensureSession(sessionId)
    }
  }

  function applyRemoteSnapshot(snapshot: {
    activeSessionId: string
    sessionMessages: Record<string, ChatHistoryItem[]>
    sessionMetas: Record<string, ChatSessionMeta>
    index?: ChatSessionsIndex | null
  }) {
    activeSessionId.value = snapshot.activeSessionId
    sessionMessages.value = cloneDeep(snapshot.sessionMessages)
    sessionMetas.value = cloneDeep(snapshot.sessionMetas)
    if (snapshot.index !== undefined) {
      index.value = cloneDeep(snapshot.index)
    }
    sessionGenerations.value = Object.fromEntries(
      Object.keys(snapshot.sessionMessages).map(sessionId => [sessionId, sessionGenerations.value[sessionId] ?? 0]),
    )
    loadedSessions.clear()
    for (const sessionId of Object.keys(snapshot.sessionMessages)) {
      loadedSessions.add(sessionId)
    }
  }

  function getSnapshot() {
    return {
      activeSessionId: activeSessionId.value,
      sessionMessages: cloneDeep(sessionMessages.value),
      sessionMetas: cloneDeep(sessionMetas.value),
      index: cloneDeep(index.value),
    }
  }

  function cleanupMessages(sessionId = activeSessionId.value) {
    ensureGeneration(sessionId)
    sessionGenerations.value[sessionId] += 1
    setSessionMessages(sessionId, [generateInitialMessage()])
  }

  function getAllSessions() {
    return cloneDeep(sessionMessages.value)
  }

  async function resetAllSessions() {
    const currentUserId = getCurrentUserId()
    const characterId = getCurrentCharacterId()
    const sessionIds = new Set<string>()

    if (index.value?.userId === currentUserId) {
      for (const character of Object.values(index.value.characters)) {
        for (const sessionId of Object.keys(character.sessions))
          sessionIds.add(sessionId)
      }
    }

    for (const sessionId of sessionIds)
      await enqueuePersist(() => chatSessionsRepo.deleteSession(sessionId))

    sessionMessages.value = {}
    sessionMetas.value = {}
    sessionGenerations.value = {}
    loadedSessions.clear()
    loadingSessions.clear()

    index.value = {
      userId: currentUserId,
      characters: {},
    }

    await createSession(characterId)
  }

  function getSessionMessages(sessionId: string) {
    ensureSession(sessionId)
    return sessionMessages.value[sessionId] ?? []
  }

  function getSessionGeneration(sessionId: string) {
    ensureGeneration(sessionId)
    return sessionGenerations.value[sessionId] ?? 0
  }

  function bumpSessionGeneration(sessionId: string) {
    ensureGeneration(sessionId)
    sessionGenerations.value[sessionId] += 1
    return sessionGenerations.value[sessionId]
  }

  function getSessionGenerationValue(sessionId?: string) {
    const target = sessionId ?? activeSessionId.value
    return getSessionGeneration(target)
  }

  async function forkSession(options: { fromSessionId: string, atIndex?: number, reason?: string, hidden?: boolean }) {
    const characterId = getCurrentCharacterId()
    await loadSession(options.fromSessionId)
    const parentMessages = getSessionMessages(options.fromSessionId)
    const forkIndex = options.atIndex ?? parentMessages.length
    const nextMessages = parentMessages.slice(0, forkIndex)
    return await createSession(characterId, { setActive: false, messages: nextMessages })
  }

  async function exportSessions(): Promise<ChatSessionsExport> {
    if (!ready.value)
      await initialize()

    if (!index.value) {
      return {
        format: 'chat-sessions-index:v1',
        index: { userId: getCurrentUserId(), characters: {} },
        sessions: {},
      }
    }

    const sessions: Record<string, ChatSessionRecord> = {}
    for (const character of Object.values(index.value.characters)) {
      for (const sessionId of Object.keys(character.sessions)) {
        const stored = await chatSessionsRepo.getSession(sessionId)
        if (stored) {
          sessions[sessionId] = stored
          continue
        }
        const meta = sessionMetas.value[sessionId]
        const messages = sessionMessages.value[sessionId]
        if (meta && messages)
          sessions[sessionId] = { meta, messages }
      }
    }

    return {
      format: 'chat-sessions-index:v1',
      index: cloneDeep(index.value),
      sessions: cloneDeep(sessions),
    }
  }

  async function importSessions(payload: ChatSessionsExport) {
    if (payload.format !== 'chat-sessions-index:v1')
      return

    index.value = cloneDeep(payload.index)
    sessionMessages.value = {}
    sessionMetas.value = {}
    sessionGenerations.value = {}
    loadedSessions.clear()
    loadingSessions.clear()

    await enqueuePersist(() => chatSessionsRepo.saveIndex(cloneDeep(payload.index)))

    for (const [sessionId, record] of Object.entries(payload.sessions)) {
      sessionMetas.value[sessionId] = cloneDeep(record.meta)
      sessionMessages.value[sessionId] = cloneDeep(record.messages)
      ensureGeneration(sessionId)
      await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, {
        meta: cloneDeep(record.meta),
        messages: cloneDeep(record.messages),
      }))
    }

    await ensureActiveSessionForCharacter()
  }

  watch([userId, activeCardId], () => {
    if (!ready.value)
      return
    void ensureActiveSessionForCharacter()
  })

  // Auth toggles drive cloud WS lifecycle independently of activeCardId so
  // a card swap inside a single session does not bounce the socket. The
  // critical invariant: when the auth user changes, every piece of in-memory
  // state from the previous user must be cleared BEFORE the new user's WS
  // and reconcile fire. Otherwise the previous user's sessionMetas would
  // leak into the new user's drawer, exports, and (worst) into the cloud
  // reconcile's `localOwnedMetas` snapshot.
  watch(userId, (next) => {
    teardownCloudWsClient()
    clearInMemoryState()
    if (next && next !== 'local') {
      ensureCloudWsClient()
    }
    // Rehydrate for the new user. We trigger here (instead of relying on the
    // `[userId, activeCardId]` watcher) because that watcher gates on
    // `ready.value` — if the swap happens while initialize() is still
    // awaiting the prior user's hydrate, the gated trigger is dropped and
    // the new user silently sees no sessions. `clearInMemoryState` already
    // bumped `ensureActiveEpoch` and freed the singleflight slot, so this
    // call starts a fresh IIFE that runs alongside (and is unaffected by)
    // any in-flight stale hydrate.
    void ensureActiveSessionForCharacter()
  })

  return {
    ready,
    isReady,
    initialize,

    activeSessionId,
    messages,

    setActiveSession,
    applyRemoteSnapshot,
    getSnapshot,
    cleanupMessages,
    getAllSessions,
    resetAllSessions,

    ensureSession,
    setSessionMessages,
    appendSessionMessage,
    persistSessionMessages,
    getSessionMessages,
    sessionMessages,
    sessionMetas,
    getSessionGeneration,
    bumpSessionGeneration,
    getSessionGenerationValue,

    forkSession,
    exportSessions,
    importSessions,
    createSession,
    loadSession,
    deleteSession,

    cloudSyncReady,
    outboxPendingCount,
    pushMessageToCloud,
  }
})
