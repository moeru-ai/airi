import type { NewMessagesPayload } from '@proj-airi/server-sdk-shared'

import type { ChatWsClient } from '../../libs/chat-sync'
import type { ChatHistoryItem } from '../../types/chat'
import type { ChatSessionMeta, ChatSessionRecord, ChatSessionsExport, ChatSessionsIndex } from '../../types/chat-session'

import { errorMessageFrom } from '@moeru/std'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { getAuthToken } from '../../libs/auth'
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

  let persistQueue = Promise.resolve()
  const loadedSessions = new Set<string>()
  const loadingSessions = new Map<string, Promise<void>>()

  // Cloud sync state. The WS client is constructed lazily so anonymous
  // (`userId === 'local'`) users never open a socket. `cloudSyncReady` is a
  // UI-facing readiness flag (true after a successful reconcile); it does
  // NOT gate `pushMessageToCloud`, which only requires `meta.cloudChatId` —
  // that way the very first message in a session does not get dropped while
  // reconcile completes.
  const cloudSyncReady = ref(false)
  let wsClient: ChatWsClient | undefined
  let cloudReconcileTask: Promise<void> | undefined

  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  function getCurrentUserId() {
    return userId.value || 'local'
  }

  function getCurrentCharacterId() {
    return activeCardId.value || 'default'
  }

  function enqueuePersist(task: () => Promise<void>) {
    persistQueue = persistQueue.then(task, task)
    return persistQueue
  }

  function cloneDeep<T>(value: T): T {
    try {
      return structuredClone(value)
    }
    catch {
      return JSON.parse(JSON.stringify(value)) as T
    }
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

  async function loadSession(sessionId: string) {
    if (loadedSessions.has(sessionId)) {
      return
    }
    if (loadingSessions.has(sessionId)) {
      await loadingSessions.get(sessionId)
      return
    }

    const loadPromise = (async () => {
      const stored = await chatSessionsRepo.getSession(sessionId)
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

      // Cloud gap fill: when the session is mapped to a cloud chat, ask the
      // server for everything past our highest known seq. Best effort —
      // failures are logged and the local view stays usable.
      const meta = sessionMetas.value[sessionId]
      if (meta?.cloudChatId)
        await pullCloudMessages(sessionId)
    })()

    loadingSessions.set(sessionId, loadPromise)
    await loadPromise
    loadingSessions.delete(sessionId)
  }

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
   *   a "ghost" session after the click.
   */
  async function deleteSession(sessionId: string) {
    const meta = sessionMetas.value[sessionId]
    if (!meta)
      return

    const wasActive = activeSessionId.value === sessionId
    const characterId = meta.characterId
    const cloudChatId = meta.cloudChatId
    const isCloudUser = getCurrentUserId() !== 'local'

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
    await persistIndex()

    if (cloudChatId && isCloudUser) {
      const mapper = createCloudChatMapper({ serverUrl: SERVER_URL, getToken: getAuthToken })
      mapper.deleteChat(cloudChatId).catch((err) => {
        console.warn('[chat-sync] DELETE /api/v1/chats failed for', sessionId, errorMessageFrom(err))
      })
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

  async function ensureActiveSessionForCharacter() {
    const currentUserId = getCurrentUserId()
    const characterId = getCurrentCharacterId()

    if (!index.value || index.value.userId !== currentUserId)
      await loadIndexForUser(currentUserId)

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
    ensureSession(characterIndex.activeSessionId)
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
  function mergeCloudMessagesIntoSession(sessionId: string, payload: NewMessagesPayload | { messages: NewMessagesPayload['messages'], toSeq?: number }) {
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
      if (result.messages.length === 0 && result.seq === (meta.cloudMaxSeq ?? 0))
        return
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
   *
   * Reentrant: a single in-flight task is shared across concurrent callers.
   */
  async function reconcileCloudSessions() {
    if (cloudReconcileTask)
      return cloudReconcileTask

    cloudReconcileTask = (async () => {
      const currentUserId = getCurrentUserId()
      if (currentUserId === 'local') {
        console.info('[chat-sync] reconcile skipped: anonymous user')
        return
      }

      console.info('[chat-sync] reconcile start', { userId: currentUserId, serverUrl: SERVER_URL })
      const mapper = createCloudChatMapper({ serverUrl: SERVER_URL, getToken: getAuthToken })

      let remoteChats
      try {
        remoteChats = await mapper.listChats()
      }
      catch (err) {
        console.warn('[chat-sync] listChats failed; skipping reconcile this round:', errorMessageFrom(err))
        return
      }
      console.info('[chat-sync] listChats →', remoteChats.length, 'remote chats')

      // Snapshot local metas owned by this user. Anonymous-era sessions are
      // not promoted to the cloud automatically — the user can re-open them
      // after signing in and the server is unaware of them.
      const localOwnedMetas = Object.values(sessionMetas.value).filter(meta => meta.userId === currentUserId)
      const plan = reconcileLocalAndRemote(localOwnedMetas, remoteChats)

      // claim: remote chat already exists with the same id; just bind.
      for (const action of plan.claim) {
        const meta = sessionMetas.value[action.sessionId]
        if (!meta)
          continue
        sessionMetas.value[action.sessionId] = { ...meta, cloudChatId: action.cloudChatId }
        void persistSession(action.sessionId)
      }

      // create: POST /api/v1/chats and bind. Bounded concurrency keeps the
      // server happy when the user has many local sessions queued.
      const createResults = await applyCreateActions(mapper, plan.create, { concurrency: 4 })
      for (const result of createResults) {
        if (!result.cloudChatId)
          continue
        const meta = sessionMetas.value[result.sessionId]
        if (!meta)
          continue
        sessionMetas.value[result.sessionId] = { ...meta, cloudChatId: result.cloudChatId }
        void persistSession(result.sessionId)

        // Backfill any pre-existing local messages so the new cloud chat
        // is not born empty. Without this, anonymous-era messages and any
        // typed during the connect handshake would only live on this
        // device. Best-effort: failures are logged inside pushMessage.
        if (wsClient && wsClient.status() === 'open') {
          const localMessages = sessionMessages.value[result.sessionId] ?? []
          for (const message of localMessages) {
            if (!message.id || !isCloudSyncableMessage(message))
              continue
            const text = extractMessageText(message)
            if (!text)
              continue
            try {
              await wsClient.sendMessages({
                chatId: result.cloudChatId,
                messages: [{ id: message.id, role: message.role, content: text }],
              })
            }
            catch (err) {
              console.warn('[chat-sync] backfill sendMessages failed for', result.sessionId, errorMessageFrom(err))
            }
          }
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

        await enqueuePersist(() => chatSessionsRepo.saveSession(remote.id, {
          meta: adoptedMeta,
          messages: sessionMessages.value[remote.id],
        }))
      }
      await persistIndex()

      // After reconcile, fan out a catch-up pull for every session that has
      // a cloudChatId now (claimed + created + previously-mapped). This
      // closes the window between offline writes on other devices and the
      // moment the WS push begins delivering live updates.
      const cloudMappedIds = Object.values(sessionMetas.value)
        .filter(meta => meta.cloudChatId)
        .map(meta => meta.sessionId)
      await Promise.all(cloudMappedIds.map(sessionId => pullCloudMessages(sessionId)))

      cloudSyncReady.value = true
    })().finally(() => {
      cloudReconcileTask = undefined
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
    if (wsClient) {
      wsClient.disconnect()
      wsClient = undefined
    }
  }

  /**
   * Ship a message up to the cloud for a session that already has a
   * `cloudChatId`. No-op when offline or for unmapped sessions; failures
   * are logged but do not throw, because the reconnect catch-up flow will
   * surface server-side discrepancies on the next pull.
   */
  async function pushMessageToCloud(sessionId: string, message: { id: string, role: string, content: string }) {
    if (!wsClient || wsClient.status() !== 'open')
      return
    const meta = sessionMetas.value[sessionId]
    if (!meta?.cloudChatId)
      return

    try {
      await wsClient.sendMessages({
        chatId: meta.cloudChatId,
        messages: [message],
      })
    }
    catch (err) {
      console.warn('[chat-sync] sendMessages failed for', sessionId, errorMessageFrom(err))
    }
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
  // a card swap inside a single session does not bounce the socket.
  watch(userId, (next) => {
    if (next && next !== 'local') {
      // Swap to a different signed-in account → tear down the previous
      // socket so its handlers do not see the new user's mappings.
      teardownCloudWsClient()
      ensureCloudWsClient()
    }
    else {
      teardownCloudWsClient()
    }
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
    pushMessageToCloud,
  }
})
