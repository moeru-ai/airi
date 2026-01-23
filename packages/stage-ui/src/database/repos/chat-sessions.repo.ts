import type { ChatHistoryItem } from '../../types/chat'
import type { ChatPromptVersion, ChatSessionMeta, ChatUserCharacterRoot } from '../../types/chat-session'

import { storage } from '../storage'

export const chatSessionsRepo = {
  // Root management
  async getRoot(userId: string, characterId: string) {
    const key = `local:chat/roots/${userId}/${characterId}`
    return await storage.getItem<ChatUserCharacterRoot>(key)
  },

  async saveRoot(root: ChatUserCharacterRoot) {
    const key = `local:chat/roots/${root.userId}/${root.characterId}`
    await storage.setItem(key, root)
  },

  // Version management
  async getVersion(userId: string, characterId: string, versionId: string) {
    const key = `local:chat/roots/${userId}/${characterId}/versions/${versionId}`
    return await storage.getItem<ChatPromptVersion>(key)
  },

  async saveVersion(userId: string, characterId: string, version: ChatPromptVersion) {
    const key = `local:chat/roots/${userId}/${characterId}/versions/${version.id}`
    await storage.setItem(key, version)
  },

  // Session data management
  async getSessionMessages(sessionId: string) {
    const key = `local:chat/sessions/${sessionId}/messages`
    return await storage.getItem<ChatHistoryItem[]>(key) || []
  },

  async saveSessionMessages(sessionId: string, messages: ChatHistoryItem[]) {
    const key = `local:chat/sessions/${sessionId}/messages`
    await storage.setItem(key, messages)
  },

  async getSessionMeta(sessionId: string) {
    const key = `local:chat/sessions/${sessionId}/meta`
    return await storage.getItem<ChatSessionMeta>(key)
  },

  async saveSessionMeta(meta: ChatSessionMeta) {
    const key = `local:chat/sessions/${meta.sessionId}/meta`
    await storage.setItem(key, meta)
  },

  // Cleanup
  async deleteSession(sessionId: string) {
    await storage.removeItem(`local:chat/sessions/${sessionId}/messages`)
    await storage.removeItem(`local:chat/sessions/${sessionId}/meta`)
  },
}
