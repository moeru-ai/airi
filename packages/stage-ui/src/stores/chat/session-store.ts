import type { SystemMessage } from '@xsai/shared-chat'

import type { ChatHistoryItem } from '../../types/chat'
import type { ChatSessionMeta, ChatSessionRecord, ChatSessionsExport, ChatSessionsIndex } from '../../types/chat-session'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { useAuthStore } from '../auth'
import { useAiriCardStore } from '../modules/airi-card'

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

  function snapshotMessages(messages: ChatHistoryItem[]) {
    return JSON.parse(JSON.stringify(messages)) as ChatHistoryItem[]
  }

  function generateInitialMessageFromPrompt(prompt: string) {
    const content = codeBlockSystemPrompt + mathSyntaxSystemPrompt + prompt

    return {
      role: 'system',
      content,
    } satisfies SystemMessage
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
  }

  function getCharacterIndex(characterId: string) {
    if (!index.value)
      return null
    return index.value.characters[characterId] ?? null
  }

  async function persistIndex() {
    if (!index.value)
      return
    const snapshot = JSON.parse(JSON.stringify(index.value)) as ChatSessionsIndex
    await enqueuePersist(() => chatSessionsRepo.saveIndex(snapshot))
  }

  async function persistSession(sessionId: string) {
    const meta = sessionMetas.value[sessionId]
    if (!meta)
      return
    const messages = snapshotMessages(sessionMessages.value[sessionId] ?? [])
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

    await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, record))
    await persistIndex()
  }

  async function loadSession(sessionId: string) {
    if (loadedSessions.has(sessionId))
      return
    if (loadingSessions.has(sessionId)) {
      await loadingSessions.get(sessionId)
      return
    }

    const loadPromise = (async () => {
      const stored = await chatSessionsRepo.getSession(sessionId)
      if (stored) {
        sessionMetas.value[sessionId] = stored.meta
        sessionMessages.value[sessionId] = stored.messages
        ensureGeneration(sessionId)
      }
      loadedSessions.add(sessionId)
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

    const initialMessages = options?.messages?.length ? options.messages : [generateInitialMessage()]

    sessionMetas.value[sessionId] = meta
    sessionMessages.value[sessionId] = initialMessages
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

    await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, { meta, messages: initialMessages }))
    await persistIndex()

    if (options?.setActive !== false)
      activeSessionId.value = sessionId

    return sessionId
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

  async function initialize() {
    if (ready.value)
      return
    if (initializePromise)
      return initializePromise
    initializing.value = true
    initializePromise = (async () => {
      await ensureActiveSessionForCharacter()
      ready.value = true
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
      sessionMessages.value[sessionId] = [generateInitialMessage()]
      void persistSession(sessionId)
    }
  }

  const messages = computed<ChatHistoryItem[]>({
    get: () => {
      if (!activeSessionId.value)
        return []
      ensureSession(activeSessionId.value)
      if (ready.value)
        void loadSession(activeSessionId.value)
      return sessionMessages.value[activeSessionId.value] ?? []
    },
    set: (value) => {
      if (!activeSessionId.value)
        return
      sessionMessages.value[activeSessionId.value] = value
      void persistSession(activeSessionId.value)
    },
  })

  function setActiveSession(sessionId: string) {
    activeSessionId.value = sessionId
    ensureSession(sessionId)

    const characterId = getCurrentCharacterId()
    const characterIndex = index.value?.characters[characterId]
    if (characterIndex) {
      characterIndex.activeSessionId = sessionId
      void persistIndex()
    }

    if (ready.value)
      void loadSession(sessionId)
  }

  function cleanupMessages(sessionId = activeSessionId.value) {
    ensureGeneration(sessionId)
    sessionGenerations.value[sessionId] += 1
    sessionMessages.value[sessionId] = [generateInitialMessage()]
    void persistSession(sessionId)
  }

  function getAllSessions() {
    return JSON.parse(JSON.stringify(sessionMessages.value)) as Record<string, ChatHistoryItem[]>
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
    if (ready.value)
      void loadSession(sessionId)
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
      index: index.value,
      sessions,
    }
  }

  async function importSessions(payload: ChatSessionsExport) {
    if (payload.format !== 'chat-sessions-index:v1')
      return

    index.value = payload.index
    sessionMessages.value = {}
    sessionMetas.value = {}
    sessionGenerations.value = {}
    loadedSessions.clear()
    loadingSessions.clear()

    await enqueuePersist(() => chatSessionsRepo.saveIndex(payload.index))

    for (const [sessionId, record] of Object.entries(payload.sessions)) {
      sessionMetas.value[sessionId] = record.meta
      sessionMessages.value[sessionId] = record.messages
      ensureGeneration(sessionId)
      await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, record))
    }

    await ensureActiveSessionForCharacter()
  }

  watch([userId, activeCardId], () => {
    if (!ready.value)
      return
    void ensureActiveSessionForCharacter()
  })

  return {
    ready,
    isReady,
    initialize,

    activeSessionId,
    messages,

    setActiveSession,
    cleanupMessages,
    getAllSessions,
    resetAllSessions,

    ensureSession,
    getSessionMessages,
    getSessionGeneration,
    bumpSessionGeneration,
    getSessionGenerationValue,

    forkSession,
    exportSessions,
    importSessions,
  }
})
