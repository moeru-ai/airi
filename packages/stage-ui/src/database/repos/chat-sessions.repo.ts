import type { ChatSessionRecord, ChatSessionsIndex } from '../../types/chat-session'

import { storage } from '../storage'

export const chatSessionsRepo = {
  async getIndex(userId: string) {
    const key = `local:chat/index/${userId}`
    return await storage.getItemRaw<ChatSessionsIndex>(key)
  },

  async saveIndex(index: ChatSessionsIndex) {
    const key = `local:chat/index/${index.userId}`
    await storage.setItemRaw(key, index)
  },

  async getSession(sessionId: string) {
    const key = `local:chat/sessions/${sessionId}`
    return await storage.getItemRaw<ChatSessionRecord>(key)
  },

  async saveSession(sessionId: string, record: ChatSessionRecord) {
    const key = `local:chat/sessions/${sessionId}`
    await storage.setItemRaw(key, record)
  },

  // Cleanup
  async deleteSession(sessionId: string) {
    await storage.removeItem(`local:chat/sessions/${sessionId}`)
  },

  async clear(userId: string) {
    const index = await this.getIndex(userId)
    if (index) {
      for (const charIndex of Object.values(index.characters)) {
        for (const sessionId of Object.keys(charIndex.sessions)) {
          await this.deleteSession(sessionId)
        }
      }
      await storage.removeItem(`local:chat/index/${userId}`)
    }
  },
}
