import type { SystemMessage } from '@xsai/shared-chat'

import type { ChatHistoryItem } from '../../types/chat'
import type { ChatPromptVersion, ChatSessionGraph, ChatSessionGraphNode, ChatSessionMeta, ChatSessionsExport, ChatUserCharacterRoot } from '../../types/chat-session'

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
  const sessionGenerations = ref<Record<string, number>>({})

  const activeRoot = ref<ChatUserCharacterRoot | null>(null)
  const activeVersion = ref<ChatPromptVersion | null>(null)
  const ready = ref(false)
  const isReady = computed(() => ready.value)
  const initializing = ref(false)
  let initializePromise: Promise<void> | null = null

  let persistQueue = Promise.resolve()
  const pendingSessionMessages = new Map<string, ChatHistoryItem[]>()
  const pendingSessionMetas = new Map<string, ChatSessionMeta>()
  const pendingVersions = new Map<string, { userId: string, characterId: string, version: ChatPromptVersion }>()
  const pendingRoots = new Map<string, ChatUserCharacterRoot>()

  const loadedSessions = new Set<string>()
  const loadingSessions = new Map<string, Promise<void>>()

  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  function hashString(value: string) {
    let hash = 2166136261
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i)
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }
    return (hash >>> 0).toString(16)
  }

  function getRootId(user: string, character: string) {
    return `${user}:${character}`
  }

  function enqueuePersist(task: () => Promise<void>) {
    persistQueue = persistQueue.then(task, task)
    return persistQueue
  }

  function snapshotMessages(messages: ChatHistoryItem[]) {
    return JSON.parse(JSON.stringify(messages)) as ChatHistoryItem[]
  }

  async function flushPendingWrites() {
    if (!pendingRoots.size && !pendingVersions.size && !pendingSessionMessages.size && !pendingSessionMetas.size)
      return

    const roots = [...pendingRoots.values()]
    const versions = [...pendingVersions.values()]
    const sessionMessages = [...pendingSessionMessages.entries()]
    const metas = [...pendingSessionMetas.values()]

    pendingRoots.clear()
    pendingVersions.clear()
    pendingSessionMessages.clear()
    pendingSessionMetas.clear()

    await enqueuePersist(async () => {
      for (const root of roots)
        await chatSessionsRepo.saveRoot(root)

      for (const { userId, characterId, version } of versions)
        await chatSessionsRepo.saveVersion(userId, characterId, version)

      for (const [sessionId, messages] of sessionMessages)
        await chatSessionsRepo.saveSessionMessages(sessionId, messages)

      for (const meta of metas)
        await chatSessionsRepo.saveSessionMeta(meta)
    })
  }

  function generateInitialMessageFromPrompt(prompt: string) {
    const content = codeBlockSystemPrompt + mathSyntaxSystemPrompt + prompt

    return {
      role: 'system',
      content,
    } satisfies SystemMessage
  }

  function generateInitialMessage() {
    const prompt = activeVersion.value?.systemPrompt ?? systemPrompt.value
    return generateInitialMessageFromPrompt(prompt)
  }

  function ensureGeneration(sessionId: string) {
    if (sessionGenerations.value[sessionId] === undefined)
      sessionGenerations.value[sessionId] = 0
  }

  async function persistSessionMessages(sessionId: string) {
    const messagesSnapshot = snapshotMessages(sessionMessages.value[sessionId] ?? [])
    if (ready.value) {
      void enqueuePersist(() => chatSessionsRepo.saveSessionMessages(sessionId, messagesSnapshot))
    }
    else {
      pendingSessionMessages.set(sessionId, messagesSnapshot)
    }

    const versionId = activeVersion.value?.id ?? 'v1'
    const rootId = activeVersion.value?.rootId ?? getRootId(userId.value, activeCardId.value)
    const meta = {
      sessionId,
      versionId,
      rootId,
      updatedAt: Date.now(),
    }

    if (ready.value) {
      void enqueuePersist(() => chatSessionsRepo.saveSessionMeta(meta))
    }
    else {
      pendingSessionMetas.set(sessionId, meta)
    }
  }

  function ensureSessionNode(sessionId: string) {
    if (!activeVersion.value)
      return
    if (!activeVersion.value.graph.nodes[sessionId]) {
      activeVersion.value.graph.nodes[sessionId] = {
        id: sessionId,
        createdAt: Date.now(),
      }
    }
  }

  async function persistActiveVersion() {
    const root = activeRoot.value
    const version = activeVersion.value
    if (!version || !root)
      return
    const versionKey = `${root.userId}:${root.characterId}:${version.id}`
    if (ready.value) {
      void enqueuePersist(() => chatSessionsRepo.saveVersion(root.userId, root.characterId, version))
      void enqueuePersist(() => chatSessionsRepo.saveRoot(root))
    }
    else {
      pendingVersions.set(versionKey, {
        userId: root.userId,
        characterId: root.characterId,
        version,
      })
      pendingRoots.set(getRootId(root.userId, root.characterId), root)
    }
  }

  async function loadSessionMessages(sessionId: string) {
    if (loadedSessions.has(sessionId))
      return
    if (loadingSessions.has(sessionId)) {
      await loadingSessions.get(sessionId)
      return
    }

    const loadPromise = (async () => {
      const stored = await chatSessionsRepo.getSessionMessages(sessionId)
      if (stored.length > 0)
        sessionMessages.value[sessionId] = stored
      loadedSessions.add(sessionId)
    })()

    loadingSessions.set(sessionId, loadPromise)
    await loadPromise
    loadingSessions.delete(sessionId)
  }

  async function createVersion(root: ChatUserCharacterRoot, prompt: string, promptHash: string) {
    const versionId = `v${root.versions.length + 1}`
    const sessionId = nanoid()
    const rootId = getRootId(root.userId, root.characterId)
    const node: ChatSessionGraphNode = {
      id: sessionId,
      createdAt: Date.now(),
    }
    const graph: ChatSessionGraph = {
      nodes: { [sessionId]: node },
      activeSessionId: sessionId,
    }
    const version: ChatPromptVersion = {
      id: versionId,
      rootId,
      systemPrompt: prompt,
      systemPromptHash: promptHash,
      createdAt: Date.now(),
      graph,
    }

    root.versions = [...root.versions, versionId]
    root.activeVersionId = versionId

    activeRoot.value = root
    activeVersion.value = version
    activeSessionId.value = sessionId

    sessionMessages.value[sessionId] = [generateInitialMessageFromPrompt(prompt)]
    ensureGeneration(sessionId)
    await persistSessionMessages(sessionId)
    await persistActiveVersion()
  }

  async function ensureRootAndVersion() {
    const currentUserId = userId.value || 'local'
    const currentCharacterId = activeCardId.value || 'default'
    const prompt = systemPrompt.value
    const promptHash = hashString(prompt)

    let root = await chatSessionsRepo.getRoot(currentUserId, currentCharacterId)
    if (!root) {
      root = {
        userId: currentUserId,
        characterId: currentCharacterId,
        activeVersionId: 'v1',
        versions: [],
      }
    }

    let matchedVersion: ChatPromptVersion | null = null
    for (const versionId of root.versions) {
      const version = await chatSessionsRepo.getVersion(currentUserId, currentCharacterId, versionId)
      if (version && version.systemPromptHash === promptHash) {
        matchedVersion = version
        break
      }
    }

    if (!matchedVersion) {
      await createVersion(root, prompt, promptHash)
      return
    }

    if (root.activeVersionId !== matchedVersion.id) {
      root.activeVersionId = matchedVersion.id
      await chatSessionsRepo.saveRoot(root)
    }

    activeRoot.value = root
    activeVersion.value = matchedVersion
    activeSessionId.value = matchedVersion.graph.activeSessionId

    ensureSession(activeSessionId.value)
    if (ready.value)
      void loadSessionMessages(activeSessionId.value)
  }

  async function initialize() {
    if (ready.value)
      return
    if (initializePromise)
      return initializePromise
    initializing.value = true
    initializePromise = (async () => {
      await ensureRootAndVersion()
      if (activeSessionId.value)
        await loadSessionMessages(activeSessionId.value)
      await flushPendingWrites()
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
    ensureSessionNode(sessionId)

    if (!sessionMessages.value[sessionId] || sessionMessages.value[sessionId].length === 0) {
      sessionMessages.value[sessionId] = [generateInitialMessage()]
      void persistSessionMessages(sessionId)
    }
  }

  const messages = computed<ChatHistoryItem[]>({
    get: () => {
      if (!activeSessionId.value)
        return []
      ensureSession(activeSessionId.value)
      if (ready.value)
        void loadSessionMessages(activeSessionId.value)
      return sessionMessages.value[activeSessionId.value] ?? []
    },
    set: (value) => {
      if (!activeSessionId.value)
        return
      sessionMessages.value[activeSessionId.value] = value
      void persistSessionMessages(activeSessionId.value)
    },
  })

  function setActiveSession(sessionId: string) {
    activeSessionId.value = sessionId
    ensureSession(sessionId)
    if (activeVersion.value) {
      activeVersion.value.graph.activeSessionId = sessionId
      void persistActiveVersion()
    }
    if (ready.value)
      void loadSessionMessages(sessionId)
  }

  function cleanupMessages(sessionId = activeSessionId.value) {
    ensureGeneration(sessionId)
    sessionGenerations.value[sessionId] += 1
    sessionMessages.value[sessionId] = [generateInitialMessage()]
    void persistSessionMessages(sessionId)
  }

  function getAllSessions() {
    return JSON.parse(JSON.stringify(sessionMessages.value)) as Record<string, ChatHistoryItem[]>
  }

  function replaceSessions(sessions: Record<string, ChatHistoryItem[]>) {
    sessionMessages.value = sessions
    sessionGenerations.value = Object.fromEntries(Object.keys(sessions).map(sessionId => [sessionId, 0]))
    for (const sessionId of Object.keys(sessions)) {
      ensureSessionNode(sessionId)
      void persistSessionMessages(sessionId)
    }
    const [firstSessionId] = Object.keys(sessions)
    if (firstSessionId)
      setActiveSession(firstSessionId)
  }

  function resetAllSessions() {
    sessionMessages.value = {}
    sessionGenerations.value = {}
    const newSessionId = nanoid()
    if (activeVersion.value) {
      activeVersion.value.graph = {
        nodes: {
          [newSessionId]: {
            id: newSessionId,
            createdAt: Date.now(),
          },
        },
        activeSessionId: newSessionId,
      }
      void persistActiveVersion()
    }
    activeSessionId.value = newSessionId
    ensureSession(newSessionId)
  }

  function getSessionMessages(sessionId: string) {
    ensureSession(sessionId)
    if (ready.value)
      void loadSessionMessages(sessionId)
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

  async function setActiveVersion(versionId: string) {
    if (!activeRoot.value)
      return
    const version = await chatSessionsRepo.getVersion(activeRoot.value.userId, activeRoot.value.characterId, versionId)
    if (!version)
      return
    activeRoot.value.activeVersionId = versionId
    activeVersion.value = version
    activeSessionId.value = version.graph.activeSessionId
    await persistActiveVersion()
    ensureSession(activeSessionId.value)
    if (ready.value)
      await loadSessionMessages(activeSessionId.value)
  }

  function forkSession(options: { fromSessionId: string, atIndex?: number, reason?: string, hidden?: boolean, versionId?: string }) {
    const version = activeVersion.value
    if (!version)
      return ''
    if (options.versionId && options.versionId !== version.id)
      return ''
    const parentMessages = getSessionMessages(options.fromSessionId)
    const forkIndex = options.atIndex ?? parentMessages.length
    const newSessionId = nanoid()
    const nextMessages = parentMessages.slice(0, forkIndex)
    version.graph.nodes[newSessionId] = {
      id: newSessionId,
      parentId: options.fromSessionId,
      forkAtIndex: forkIndex,
      reason: options.reason,
      hidden: options.hidden ?? true,
      createdAt: Date.now(),
    }
    sessionMessages.value[newSessionId] = nextMessages.length > 0 ? nextMessages : [generateInitialMessage()]
    ensureGeneration(newSessionId)
    void persistSessionMessages(newSessionId)
    void persistActiveVersion()
    return newSessionId
  }

  function getActiveSessionGraph() {
    return activeVersion.value?.graph
  }

  async function exportSessionGraph(): Promise<ChatSessionsExport | null> {
    if (!ready.value)
      await initialize()
    if (!activeRoot.value)
      return null

    const versions: Record<string, ChatPromptVersion> = {}
    for (const versionId of activeRoot.value.versions) {
      const version = await chatSessionsRepo.getVersion(activeRoot.value.userId, activeRoot.value.characterId, versionId)
      if (version)
        versions[versionId] = version
    }

    const sessionIds = new Set<string>()
    for (const version of Object.values(versions)) {
      for (const sessionId of Object.keys(version.graph.nodes)) {
        sessionIds.add(sessionId)
      }
    }

    const sessions: Record<string, ChatHistoryItem[]> = {}
    const metas: Record<string, ChatSessionMeta> = {}
    for (const sessionId of sessionIds) {
      sessions[sessionId] = await chatSessionsRepo.getSessionMessages(sessionId)
      const meta = await chatSessionsRepo.getSessionMeta(sessionId)
      if (meta)
        metas[sessionId] = meta
    }

    return {
      format: 'chat-session-graph:v2',
      root: activeRoot.value,
      versions,
      sessions,
      metas,
    }
  }

  async function importSessionGraph(payload: ChatSessionsExport) {
    if (payload.format !== 'chat-session-graph:v2')
      return

    const root = payload.root
    await enqueuePersist(() => chatSessionsRepo.saveRoot(root))
    for (const version of Object.values(payload.versions)) {
      await enqueuePersist(() => chatSessionsRepo.saveVersion(root.userId, root.characterId, version))
    }
    for (const [sessionId, messages] of Object.entries(payload.sessions)) {
      sessionMessages.value[sessionId] = messages
      await enqueuePersist(() => chatSessionsRepo.saveSessionMessages(sessionId, messages))
    }
    for (const meta of Object.values(payload.metas ?? {})) {
      await enqueuePersist(() => chatSessionsRepo.saveSessionMeta(meta))
    }

    activeRoot.value = root
    activeVersion.value = payload.versions[root.activeVersionId] ?? null
    if (activeVersion.value) {
      activeSessionId.value = activeVersion.value.graph.activeSessionId
      ensureSession(activeSessionId.value)
    }
  }

  watch([systemPrompt, activeCardId, userId], () => {
    if (!ready.value)
      return
    void ensureRootAndVersion()
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
    replaceSessions,
    resetAllSessions,

    ensureSession,
    getSessionMessages,
    getSessionGeneration,
    bumpSessionGeneration,
    getSessionGenerationValue,

    setActiveVersion,
    forkSession,
    getActiveSessionGraph,
    exportSessionGraph,
    importSessionGraph,
  }
})
