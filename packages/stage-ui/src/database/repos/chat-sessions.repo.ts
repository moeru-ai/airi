import type { ChatSessionRecord, ChatSessionsIndex } from '../../types/chat-session'

import { storage } from '../storage'

export const chatSessionsRepo = {
  async getIndex(userId: string) {
    const key = `local:chat/index/${userId}`
    return await storage.getItem<ChatSessionsIndex>(key)
  },

  async saveIndex(index: ChatSessionsIndex) {
    const key = `local:chat/index/${index.userId}`
    await storage.setItem(key, index)
  },

  async getSession(sessionId: string) {
    const key = `local:chat/sessions/${sessionId}`
    return await storage.getItem<ChatSessionRecord>(key)
  },

  async saveSession(sessionId: string, record: ChatSessionRecord) {
    const key = `local:chat/sessions/${sessionId}`
    await storage.setItem(key, record)
  },

  // Cleanup
  async deleteSession(sessionId: string) {
    await storage.removeItem(`local:chat/sessions/${sessionId}`)
  },
}
