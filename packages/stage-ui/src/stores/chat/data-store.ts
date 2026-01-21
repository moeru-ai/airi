import type { SystemMessage } from '@xsai/shared-chat'

import type { ChatHistoryItem } from '../../types/chat'

export interface ChatDataAccess {
  getActiveSessionId: () => string
  setActiveSessionId: (sessionId: string) => void
  getSessions: () => Record<string, ChatHistoryItem[]>
  setSessions: (sessions: Record<string, ChatHistoryItem[]>) => void
  getGenerations: () => Record<string, number>
  setGenerations: (generations: Record<string, number>) => void
}

export interface ChatDataStore {
  ensureSession: (sessionId: string, createInitialMessage: () => SystemMessage) => void
  getSessionMessages: (sessionId: string, createInitialMessage: () => SystemMessage) => ChatHistoryItem[]
  setSessionMessages: (sessionId: string, next: ChatHistoryItem[]) => void
  setActiveSession: (sessionId: string, createInitialMessage: () => SystemMessage) => void
  getActiveSessionId: () => string
  resetSession: (sessionId: string, createInitialMessage: () => SystemMessage) => void
  refreshSystemMessages: (createInitialMessage: () => SystemMessage) => void
  replaceSessions: (sessions: Record<string, ChatHistoryItem[]>, createInitialMessage: () => SystemMessage) => void
  resetAllSessions: (createInitialMessage: () => SystemMessage) => void
  getAllSessions: () => Record<string, ChatHistoryItem[]>
  getSessionGeneration: (sessionId: string) => number
  bumpSessionGeneration: (sessionId: string) => number
  getSessionGenerationValue: (sessionId?: string) => number
}

export function createChatDataStore(access: ChatDataAccess): ChatDataStore {
  function ensureGeneration(sessionId: string) {
    const generations = access.getGenerations()
    if (generations[sessionId] === undefined)
      access.setGenerations({ ...generations, [sessionId]: 0 })
  }

  function getSessionGeneration(sessionId: string) {
    ensureGeneration(sessionId)
    return access.getGenerations()[sessionId] ?? 0
  }

  function bumpSessionGeneration(sessionId: string) {
    const nextGeneration = getSessionGeneration(sessionId) + 1
    access.setGenerations({ ...access.getGenerations(), [sessionId]: nextGeneration })
    return nextGeneration
  }

  function ensureSession(sessionId: string, createInitialMessage: () => SystemMessage) {
    ensureGeneration(sessionId)

    const sessions = access.getSessions()
    if (!sessions[sessionId] || sessions[sessionId].length === 0) {
      access.setSessions({
        ...sessions,
        [sessionId]: [createInitialMessage()],
      })
    }
  }

  function getSessionMessages(sessionId: string, createInitialMessage: () => SystemMessage) {
    ensureSession(sessionId, createInitialMessage)
    return access.getSessions()[sessionId]!
  }

  function setSessionMessages(sessionId: string, next: ChatHistoryItem[]) {
    access.setSessions({
      ...access.getSessions(),
      [sessionId]: next,
    })
  }

  function setActiveSession(sessionId: string, createInitialMessage: () => SystemMessage) {
    access.setActiveSessionId(sessionId)
    ensureSession(sessionId, createInitialMessage)
  }

  function getActiveSessionId() {
    return access.getActiveSessionId()
  }

  function resetSession(sessionId: string, createInitialMessage: () => SystemMessage) {
    bumpSessionGeneration(sessionId)
    setSessionMessages(sessionId, [createInitialMessage()])
  }

  function refreshSystemMessages(createInitialMessage: () => SystemMessage) {
    const sessions = access.getSessions()
    const nextSessions: Record<string, ChatHistoryItem[]> = {}

    for (const [sessionId, history] of Object.entries(sessions)) {
      if (history.length > 0 && history[0].role === 'system') {
        nextSessions[sessionId] = [createInitialMessage(), ...history.slice(1)]
      }
      else {
        nextSessions[sessionId] = history
      }
    }

    access.setSessions(nextSessions)
  }

  function replaceSessions(sessions: Record<string, ChatHistoryItem[]>, createInitialMessage: () => SystemMessage) {
    access.setSessions(sessions)
    access.setGenerations(Object.fromEntries(Object.keys(sessions).map(sessionId => [sessionId, 0])))

    const [firstSessionId] = Object.keys(sessions)
    if (!sessions[access.getActiveSessionId()] && firstSessionId)
      access.setActiveSessionId(firstSessionId)

    ensureSession(access.getActiveSessionId(), createInitialMessage)
  }

  function resetAllSessions(createInitialMessage: () => SystemMessage) {
    access.setSessions({})
    access.setGenerations({})
    access.setActiveSessionId('default')
    ensureSession('default', createInitialMessage)
  }

  function getAllSessions() {
    return JSON.parse(JSON.stringify(access.getSessions())) as Record<string, ChatHistoryItem[]>
  }

  function getSessionGenerationValue(sessionId?: string) {
    const targetSessionId = sessionId ?? access.getActiveSessionId()
    return getSessionGeneration(targetSessionId)
  }

  return {
    ensureSession,
    getSessionMessages,
    setSessionMessages,
    setActiveSession,
    getActiveSessionId,
    resetSession,
    refreshSystemMessages,
    replaceSessions,
    resetAllSessions,
    getAllSessions,
    getSessionGeneration,
    bumpSessionGeneration,
    getSessionGenerationValue,
  }
}
