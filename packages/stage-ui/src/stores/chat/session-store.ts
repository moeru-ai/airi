import type { SystemMessage } from '@xsai/shared-chat'

import type { ChatHistoryItem } from '../../types/chat'

import { useLocalStorage } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useCharacterStore } from '../character'
import { ACTIVE_SESSION_STORAGE_KEY, CHAT_STORAGE_KEY } from './constants'
import { createChatDataStore } from './data-store'

export const useChatSessionStore = defineStore('chat-session', () => {
  const { systemPrompt } = storeToRefs(useCharacterStore())

  const activeSessionId = useLocalStorage<string>(ACTIVE_SESSION_STORAGE_KEY, 'default')
  const sessionMessages = useLocalStorage<Record<string, ChatHistoryItem[]>>(CHAT_STORAGE_KEY, {})
  const sessionGenerations = ref<Record<string, number>>({})

  const dataStore = createChatDataStore({
    getActiveSessionId: () => activeSessionId.value,
    setActiveSessionId: sessionId => activeSessionId.value = sessionId,
    getSessions: () => sessionMessages.value,
    setSessions: sessions => sessionMessages.value = sessions,
    getGenerations: () => sessionGenerations.value,
    setGenerations: generations => sessionGenerations.value = generations,
  })

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

  ensureSession(activeSessionId.value)

  const messages = computed<ChatHistoryItem[]>({
    get: () => dataStore.getSessionMessages(activeSessionId.value, generateInitialMessage),
    set: value => dataStore.setSessionMessages(activeSessionId.value, value),
  })

  function setActiveSession(sessionId: string) {
    dataStore.setActiveSession(sessionId, generateInitialMessage)
  }

  function cleanupMessages(sessionId = activeSessionId.value) {
    dataStore.resetSession(sessionId, generateInitialMessage)
  }

  function getAllSessions() {
    return dataStore.getAllSessions()
  }

  function replaceSessions(sessions: Record<string, ChatHistoryItem[]>) {
    dataStore.replaceSessions(sessions, generateInitialMessage)
  }

  function resetAllSessions() {
    dataStore.resetAllSessions(generateInitialMessage)
  }

  watch(systemPrompt, () => {
    dataStore.refreshSystemMessages(generateInitialMessage)
  }, { immediate: true })

  return {
    activeSessionId,
    messages,

    setActiveSession,
    cleanupMessages,
    getAllSessions,
    replaceSessions,
    resetAllSessions,

    ensureSession,
    getSessionMessages: (sessionId: string) => dataStore.getSessionMessages(sessionId, generateInitialMessage),
    getSessionGeneration: (sessionId: string) => dataStore.getSessionGeneration(sessionId),
    bumpSessionGeneration: (sessionId: string) => dataStore.bumpSessionGeneration(sessionId),
    getSessionGenerationValue: (sessionId?: string) => dataStore.getSessionGenerationValue(sessionId),
  }
})
