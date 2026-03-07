/**
 * Migration: Convert old ChatSessionsIndex format to new Conversations format.
 *
 * Old format (per character):
 *   local:chat/index/{userId} → ChatSessionsIndex
 *   local:chat/sessions/{sessionId} → ChatSessionRecord
 *
 * New format (group-first):
 *   local:conversations/{userId} → Record<id, LocalConversation>
 *   local:sync-cursors/{chatId} → { chatId, lastSyncSeq }
 *
 * Migration strategy:
 * 1. Each old session becomes a new conversation (type='bot')
 * 2. Session messages get parentId assigned (linear chain: msg[n].parentId = msg[n-1].id)
 * 3. Seq numbers assigned in order (1, 2, 3...)
 * 4. Old data is NOT deleted (kept for backward compat)
 */
import type { ChatSessionRecord } from '../../types/chat-session'
import type { LocalConversation } from '../../types/conversation'

import { nanoid } from 'nanoid'

import { chatSessionsRepo } from '../repos/chat-sessions.repo'
import { storage } from '../storage'

const MIGRATION_KEY = 'local:migration/conversations-v1'

export async function migrateToConversations(userId: string): Promise<boolean> {
  // Check if already migrated
  const migrated = await storage.getItemRaw<boolean>(MIGRATION_KEY)
  if (migrated)
    return false

  const index = await chatSessionsRepo.getIndex(userId)
  if (!index) {
    await storage.setItemRaw(MIGRATION_KEY, true)
    return false
  }

  const conversations: Record<string, LocalConversation> = {}

  for (const [characterId, characterIndex] of Object.entries(index.characters)) {
    for (const [sessionId, meta] of Object.entries(characterIndex.sessions)) {
      const record = await chatSessionsRepo.getSession(sessionId)
      if (!record)
        continue

      // Create conversation from session
      const now = new Date()
      conversations[sessionId] = {
        id: sessionId,
        type: 'bot',
        title: meta.title ?? null,
        maxSeq: record.messages.length,
        lastMessageAt: meta.updatedAt ? new Date(meta.updatedAt).toISOString() : now.toISOString(),
        lastMessagePreview: getLastMessagePreview(record),
        createdAt: meta.createdAt ? new Date(meta.createdAt).toISOString() : now.toISOString(),
        updatedAt: meta.updatedAt ? new Date(meta.updatedAt).toISOString() : now.toISOString(),
        deletedAt: null,
        members: [
          {
            id: nanoid(),
            chatId: sessionId,
            memberType: 'user',
            userId: meta.userId,
            characterId: null,
            role: 'owner',
            joinedAt: now.toISOString(),
            lastReadSeq: record.messages.length,
          },
          ...(meta.characterId && meta.characterId !== 'default'
            ? [{
                id: nanoid(),
                chatId: sessionId,
                memberType: 'character' as const,
                userId: null,
                characterId: meta.characterId,
                role: 'member' as const,
                joinedAt: now.toISOString(),
                lastReadSeq: 0,
              }]
            : []),
        ],
        unreadCount: 0,
        lastReadSeq: record.messages.length,
        lastSyncSeq: 0, // Will be synced on next server connection
        selectedBranches: {},
      }

      // Assign parentId to messages (linear chain)
      const messagesWithParent = record.messages.map((msg, i) => {
        const id = msg.id || nanoid()
        return {
          ...msg,
          id,
          parentId: i > 0 ? (record.messages[i - 1].id || undefined) : undefined,
        }
      })

      // Save updated messages back
      await chatSessionsRepo.saveSession(sessionId, {
        meta: record.meta,
        messages: messagesWithParent,
      })
    }
  }

  // Save new conversations format
  const conversationsKey = `local:conversations/${userId}`
  await storage.setItemRaw(conversationsKey, conversations)

  // Mark migration complete
  await storage.setItemRaw(MIGRATION_KEY, true)

  return true
}

/**
 * Claim anonymous sessions: when user logs in, transfer local sessions to their account.
 */
export async function claimAnonymousSessions(realUserId: string): Promise<string[]> {
  const localConversationsKey = `local:conversations/local`
  const localConversations = await storage.getItemRaw<Record<string, LocalConversation>>(localConversationsKey)

  if (!localConversations || Object.keys(localConversations).length === 0)
    return []

  // Load user's existing conversations
  const userConversationsKey = `local:conversations/${realUserId}`
  const userConversations = await storage.getItemRaw<Record<string, LocalConversation>>(userConversationsKey) ?? {}

  const claimedIds: string[] = []

  for (const [id, conv] of Object.entries(localConversations)) {
    // Update member userId from 'local' to real userId
    for (const member of conv.members) {
      if (member.memberType === 'user' && (!member.userId || member.userId === 'local')) {
        member.userId = realUserId
      }
    }

    userConversations[id] = conv
    claimedIds.push(id)
  }

  // Save updated user conversations
  await storage.setItemRaw(userConversationsKey, userConversations)

  // Clear local conversations
  await storage.removeItem(localConversationsKey)

  // Also migrate the old ChatSessionsIndex if it exists
  const localIndex = await chatSessionsRepo.getIndex('local')
  if (localIndex) {
    const userIndex = await chatSessionsRepo.getIndex(realUserId) ?? {
      userId: realUserId,
      characters: {},
    }

    // Merge local index into user index
    for (const [charId, charIndex] of Object.entries(localIndex.characters)) {
      if (!userIndex.characters[charId]) {
        userIndex.characters[charId] = charIndex
      }
      else {
        Object.assign(userIndex.characters[charId].sessions, charIndex.sessions)
      }
    }

    await chatSessionsRepo.saveIndex(userIndex)
  }

  return claimedIds
}

function getLastMessagePreview(record: ChatSessionRecord): string | null {
  if (record.messages.length === 0)
    return null
  const lastMsg = record.messages[record.messages.length - 1]
  const content = typeof lastMsg.content === 'string'
    ? lastMsg.content
    : Array.isArray(lastMsg.content)
      ? lastMsg.content.map(p => typeof p === 'string' ? p : (p as any)?.text ?? '').join('')
      : ''
  return content.slice(0, 100) || null
}
