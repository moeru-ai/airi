import type { Conversation, LocalConversation } from '../types/conversation'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../composables/api'
import { createSyncEngine } from '../composables/sync/sync-engine'
import { storage } from '../database/storage'
import { useAuthStore } from './auth'

function conversationsKey(userId: string) {
  return `local:conversations/${userId}`
}

export const useConversationStore = defineStore('conversations', () => {
  const { userId, isAuthenticated } = storeToRefs(useAuthStore())

  const conversations = ref<Record<string, LocalConversation>>({})
  const activeConversationId = ref<string>('')
  const ready = ref(false)

  const syncEngine = createSyncEngine()

  // Sorted conversation list
  const sortedConversations = computed(() => {
    return Object.values(conversations.value)
      .filter(c => !c.deletedAt)
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime()
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime()
        return bTime - aTime
      })
  })

  const activeConversation = computed(() =>
    activeConversationId.value ? conversations.value[activeConversationId.value] : null,
  )

  const totalUnreadCount = computed(() =>
    Object.values(conversations.value).reduce((sum, c) => sum + c.unreadCount, 0),
  )

  // Local persistence
  async function loadConversations() {
    const uid = userId.value || 'local'
    const stored = await storage.getItemRaw<Record<string, LocalConversation>>(conversationsKey(uid))
    if (stored) {
      conversations.value = stored
    }
  }

  async function saveConversations() {
    const uid = userId.value || 'local'
    await storage.setItemRaw(conversationsKey(uid), JSON.parse(JSON.stringify(conversations.value)))
  }

  // Remote fetch
  async function fetchFromServer() {
    if (!isAuthenticated.value)
      return

    try {
      const res = await client.api.conversations.$get()
      if (!res.ok)
        return

      const data = await res.json() as { conversations: Conversation[] }

      for (const conv of data.conversations) {
        const existing = conversations.value[conv.id]
        conversations.value[conv.id] = {
          ...conv,
          lastSyncSeq: existing?.lastSyncSeq ?? 0,
          selectedBranches: existing?.selectedBranches ?? {},
        }
      }

      await saveConversations()
    }
    catch (err) {
      console.warn('Failed to fetch conversations from server', err)
    }
  }

  // Initialize
  async function initialize() {
    if (ready.value)
      return

    await loadConversations()
    await fetchFromServer()

    // Start sync engine if authenticated
    if (isAuthenticated.value) {
      syncEngine.start()

      // Subscribe to all conversation updates
      const chatIds = Object.keys(conversations.value)
      if (chatIds.length > 0) {
        syncEngine.subscribe(chatIds)
      }

      // Register event handlers
      syncEngine.onNewMessage((chatId, message) => {
        const conv = conversations.value[chatId]
        if (conv) {
          conv.maxSeq = Math.max(conv.maxSeq, message.seq)
          conv.lastMessagePreview = message.content?.slice(0, 100) ?? null
          conv.lastMessageAt = message.createdAt
          void saveConversations()
        }
      })
    }

    ready.value = true
  }

  async function createConversation(options: {
    type: 'private' | 'bot' | 'group' | 'channel'
    title?: string
    members?: Array<{
      type: 'user' | 'character' | 'bot'
      userId?: string
      characterId?: string
    }>
  }): Promise<string> {
    if (isAuthenticated.value) {
      const res = await client.api.conversations.$post({
        json: options,
      })
      if (!res.ok)
        throw new Error('Failed to create conversation')

      const data = await res.json() as Conversation
      conversations.value[data.id] = {
        ...data,
        lastSyncSeq: 0,
        selectedBranches: {},
      }

      // Subscribe to new conversation
      syncEngine.subscribe([data.id])

      await saveConversations()
      return data.id
    }

    // Local-only conversation
    const id = nanoid()
    const now = new Date().toISOString()
    conversations.value[id] = {
      id,
      type: options.type,
      title: options.title ?? null,
      maxSeq: 0,
      lastMessageAt: null,
      lastMessagePreview: null,
      createdAt: now,
      updatedAt: now,
      members: [],
      unreadCount: 0,
      lastReadSeq: 0,
      lastSyncSeq: 0,
      selectedBranches: {},
    }

    await saveConversations()
    return id
  }

  function setActiveConversation(id: string) {
    activeConversationId.value = id
  }

  async function markAsRead(chatId: string) {
    const conv = conversations.value[chatId]
    if (!conv)
      return

    conv.lastReadSeq = conv.maxSeq
    conv.unreadCount = 0
    await saveConversations()

    if (isAuthenticated.value) {
      try {
        await syncEngine.markRead(chatId, conv.maxSeq)
      }
      catch {
        // Silently fail, will be retried
      }
    }
  }

  function selectBranch(chatId: string, forkParentId: string, branchIndex: number) {
    const conv = conversations.value[chatId]
    if (!conv)
      return
    conv.selectedBranches[forkParentId] = branchIndex
    void saveConversations()
  }

  return {
    // State
    conversations,
    activeConversationId,
    sortedConversations,
    activeConversation,
    totalUnreadCount,
    ready,

    // Sync engine access
    syncEngine,
    syncStatus: syncEngine.status,
    pendingCount: syncEngine.pendingCount,

    // Actions
    initialize,
    createConversation,
    setActiveConversation,
    markAsRead,
    selectBranch,
    fetchFromServer,
  }
})
