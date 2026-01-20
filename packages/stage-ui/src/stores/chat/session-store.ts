import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, SystemMessage } from '@xsai/shared-chat'

import type { ChatHistoryItem } from '../../types/chat'

import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { useCharacterStore } from '../character'
import { useLLM } from '../llm'
import { useConsciousnessStore } from '../modules/consciousness'
import { useProvidersStore } from '../providers'
import { createChatDataStore } from './data-store'

export const useChatSessionStore = defineStore('chat-session', () => {
  const { systemPrompt } = storeToRefs(useCharacterStore())

  const activeSessionId = ref('default')
  const sessionMessages = ref<Record<string, ChatHistoryItem[]>>({})
  const sessionGenerations = ref<Record<string, number>>({})
  const sessionTitles = ref<Record<string, string>>({})
  const titleUpdateMessageCounts = ref<Record<string, number>>({})
  const titleUpdateInFlight = ref<Record<string, boolean>>({})
  const isHydrating = ref(true)

  const llmStore = useLLM()
  const providersStore = useProvidersStore()
  const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())

  const dataStore = createChatDataStore({
    getActiveSessionId: () => activeSessionId.value,
    setActiveSessionId: sessionId => activeSessionId.value = sessionId,
    getSessions: () => sessionMessages.value,
    setSessions: sessions => sessionMessages.value = sessions,
    getGenerations: () => sessionGenerations.value,
    setGenerations: generations => sessionGenerations.value = generations,
  })

  function normalizeContent(content: string | any[] | undefined) {
    if (!content)
      return ''
    if (typeof content === 'string')
      return content
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === 'string')
          return part
        if (part.type === 'text')
          return part.text
        return `[${part.type}]`
      }).join(' ')
    }
    return ''
  }

  function getSummarizableMessages(messages: ChatHistoryItem[]) {
    return messages.filter(message => message.role === 'user' || message.role === 'assistant')
  }

  function buildSessionSummaryInput(messages: ChatHistoryItem[]) {
    const summarizable = getSummarizableMessages(messages)
    if (summarizable.length === 0)
      return ''

    const recent = summarizable.slice(-10)
    return recent.map((message) => {
      const label = message.role === 'user' ? 'User' : 'Assistant'
      const content = normalizeContent(message.content).trim()
      return `${label}: ${content}`
    }).join('\n')
  }

  function sanitizeTitle(title: string) {
    const trimmed = title.trim()
    if (!trimmed)
      return ''

    const firstLine = trimmed.split('\n').find(Boolean)?.trim() ?? ''
    if (!firstLine)
      return ''

    return firstLine
      .replace(/^["'“‘]+/, '')
      .replace(/["'”’]+$/, '')
      .replace(/[.。!！?？]+$/, '')
      .trim()
  }

  function setSessionTitle(sessionId: string, title: string) {
    sessionTitles.value = {
      ...sessionTitles.value,
      [sessionId]: title,
    }
  }

  function getSessionTitle(sessionId: string) {
    return sessionTitles.value[sessionId]
  }

  async function summarizeSessionTitle(sessionId: string, messages: ChatHistoryItem[]) {
    if (!activeProvider.value || !activeModel.value)
      return false

    const summaryInput = buildSessionSummaryInput(messages)
    if (!summaryInput)
      return false

    if (titleUpdateInFlight.value[sessionId])
      return false

    titleUpdateInFlight.value = { ...titleUpdateInFlight.value, [sessionId]: true }

    try {
      const provider = await providersStore.getProviderInstance<ChatProvider>(activeProvider.value)
      if (!provider)
        return false

      let result = ''
      const promptMessages: Message[] = [
        {
          role: 'system',
          content: 'Summarize the conversation into a concise session title. Use the same language as the conversation, keep it under 6 words, and return only the title without quotes.',
        },
        {
          role: 'user',
          content: `Conversation:\n${summaryInput}\n\nTitle:`,
        },
      ]

      await llmStore.stream(activeModel.value, provider, promptMessages, {
        onStreamEvent: (event) => {
          if (event.type === 'text-delta')
            result += event.text
        },
      })

      const cleaned = sanitizeTitle(result)
      if (cleaned) {
        setSessionTitle(sessionId, cleaned)
        return true
      }
      return false
    }
    catch (error) {
      console.warn('[chat-session] Failed to summarize session title.', error)
      return false
    }
    finally {
      titleUpdateInFlight.value = { ...titleUpdateInFlight.value, [sessionId]: false }
    }
  }

  async function updateSessionTitle(sessionId: string, options?: { force?: boolean }) {
    if (isHydrating.value)
      return

    const messages = dataStore.getSessionMessages(sessionId, generateInitialMessage)
    const summarizable = getSummarizableMessages(messages)
    if (summarizable.length < 2)
      return

    const previousCount = titleUpdateMessageCounts.value[sessionId] ?? 0
    const delta = summarizable.length - previousCount
    const hasTitle = !!getSessionTitle(sessionId)

    if (!options?.force) {
      if (hasTitle && delta < 6)
        return
      if (!hasTitle && delta < 2)
        return
    }

    const updated = await summarizeSessionTitle(sessionId, messages)
    if (updated) {
      titleUpdateMessageCounts.value = {
        ...titleUpdateMessageCounts.value,
        [sessionId]: summarizable.length,
      }
    }
  }

  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  function generateInitialMessage() {
    const content = codeBlockSystemPrompt + mathSyntaxSystemPrompt + systemPrompt.value

    return {
      role: 'system',
      content,
    } satisfies SystemMessage
  }

  function ensureSession(sessionId: string) {
    dataStore.ensureSession(sessionId, generateInitialMessage)
  }

  async function hydrateSessions() {
    try {
      const [storedSessions, storedActiveSessionId, storedSessionTitles] = await Promise.all([
        chatSessionsRepo.getSessions(),
        chatSessionsRepo.getActiveSessionId(),
        chatSessionsRepo.getSessionTitles(),
      ])

      if (Object.keys(storedSessions).length > 0)
        sessionMessages.value = storedSessions
      if (storedActiveSessionId)
        activeSessionId.value = storedActiveSessionId
      if (Object.keys(storedSessionTitles).length > 0)
        sessionTitles.value = storedSessionTitles
    }
    catch (error) {
      // NOTICE: Storage access can fail in private mode or locked environments.
      console.warn('[chat-session] Failed to hydrate sessions from storage.', error)
    }
    finally {
      isHydrating.value = false
      ensureSession(activeSessionId.value)
      dataStore.refreshSystemMessages(generateInitialMessage)
    }
  }

  void hydrateSessions()

  ensureSession(activeSessionId.value)

  const messages = computed<ChatHistoryItem[]>({
    get: () => dataStore.getSessionMessages(activeSessionId.value, generateInitialMessage),
    set: value => dataStore.setSessionMessages(activeSessionId.value, value),
  })

  function setActiveSession(sessionId: string) {
    dataStore.setActiveSession(sessionId, generateInitialMessage)
    void updateSessionTitle(sessionId)
  }

  function createNewSession() {
    const sessionId = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`
    setActiveSession(sessionId)
    return sessionId
  }

  function cleanupMessages(sessionId = activeSessionId.value) {
    dataStore.resetSession(sessionId, generateInitialMessage)
  }

  function deleteSession(sessionId: string) {
    if (sessionId === 'default')
      return false

    dataStore.removeSession(sessionId)
    if (sessionTitles.value[sessionId]) {
      const nextTitles = { ...sessionTitles.value }
      delete nextTitles[sessionId]
      sessionTitles.value = nextTitles
    }
    if (sessionId in titleUpdateMessageCounts.value) {
      const nextCounts = { ...titleUpdateMessageCounts.value }
      delete nextCounts[sessionId]
      titleUpdateMessageCounts.value = nextCounts
    }
    if (sessionId in titleUpdateInFlight.value) {
      const nextInflight = { ...titleUpdateInFlight.value }
      delete nextInflight[sessionId]
      titleUpdateInFlight.value = nextInflight
    }

    if (!sessionMessages.value[activeSessionId.value]) {
      activeSessionId.value = 'default'
      ensureSession('default')
    }

    return true
  }

  function getAllSessions() {
    return dataStore.getAllSessions()
  }

  function replaceSessions(sessions: Record<string, ChatHistoryItem[]>) {
    dataStore.replaceSessions(sessions, generateInitialMessage)
    const nextTitles = Object.fromEntries(Object.keys(sessions).map((sessionId) => {
      const title = sessionTitles.value[sessionId]
      return title ? [sessionId, title] : []
    }).filter(entry => entry.length > 0)) as Record<string, string>
    sessionTitles.value = nextTitles
  }

  function resetAllSessions() {
    dataStore.resetAllSessions(generateInitialMessage)
    sessionTitles.value = {}
    titleUpdateMessageCounts.value = {}
    titleUpdateInFlight.value = {}
  }

  watch(systemPrompt, () => {
    dataStore.refreshSystemMessages(generateInitialMessage)
  }, { immediate: true })

  watch(activeSessionId, async (value) => {
    if (isHydrating.value)
      return
    try {
      await chatSessionsRepo.setActiveSessionId(value)
    }
    catch (error) {
      console.warn('[chat-session] Failed to persist active session id.', error)
    }
  }, { flush: 'post' })

  watch(sessionMessages, async (value) => {
    if (isHydrating.value)
      return
    try {
      await chatSessionsRepo.saveSessions(value)
    }
    catch (error) {
      console.warn('[chat-session] Failed to persist sessions.', error)
    }
  }, { deep: true, flush: 'post' })

  watch(sessionTitles, async (value) => {
    if (isHydrating.value)
      return
    try {
      await chatSessionsRepo.saveSessionTitles(value)
    }
    catch (error) {
      console.warn('[chat-session] Failed to persist session titles.', error)
    }
  }, { deep: true, flush: 'post' })

  return {
    activeSessionId,
    messages,
    allSessions: computed(() => dataStore.getAllSessions()),
    sessionTitles,

    setActiveSession,
    createNewSession,
    cleanupMessages,
    deleteSession,
    getAllSessions,
    replaceSessions,
    resetAllSessions,

    ensureSession,
    getSessionMessages: (sessionId: string) => dataStore.getSessionMessages(sessionId, generateInitialMessage),
    getSessionGeneration: (sessionId: string) => dataStore.getSessionGeneration(sessionId),
    bumpSessionGeneration: (sessionId: string) => dataStore.bumpSessionGeneration(sessionId),
    getSessionGenerationValue: (sessionId?: string) => dataStore.getSessionGenerationValue(sessionId),
    getSessionTitle,
    setSessionTitle,
    updateSessionTitle,
  }
})
