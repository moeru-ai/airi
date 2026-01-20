import type { ChatHistoryItem } from '../../types/chat'

import { storage } from '../storage'

const CHAT_SESSIONS_STORAGE_KEY = 'local:chat/sessions/v1'
const CHAT_ACTIVE_SESSION_ID_STORAGE_KEY = 'local:chat/active-session-id/v1'
const CHAT_SESSION_TITLES_STORAGE_KEY = 'local:chat/session-titles/v1'

export const chatSessionsRepo = {
  async getSessions() {
    return await storage.getItem<Record<string, ChatHistoryItem[]>>(CHAT_SESSIONS_STORAGE_KEY) || {}
  },

  async saveSessions(sessions: Record<string, ChatHistoryItem[]>) {
    await storage.setItem(CHAT_SESSIONS_STORAGE_KEY, sessions)
  },

  async getSessionTitles() {
    return await storage.getItem<Record<string, string>>(CHAT_SESSION_TITLES_STORAGE_KEY) || {}
  },

  async saveSessionTitles(titles: Record<string, string>) {
    await storage.setItem(CHAT_SESSION_TITLES_STORAGE_KEY, titles)
  },

  async getActiveSessionId() {
    return await storage.getItem<string>(CHAT_ACTIVE_SESSION_ID_STORAGE_KEY) || 'default'
  },

  async setActiveSessionId(sessionId: string) {
    await storage.setItem(CHAT_ACTIVE_SESSION_ID_STORAGE_KEY, sessionId)
  },
}
