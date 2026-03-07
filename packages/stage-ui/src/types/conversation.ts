export type ConversationType = 'private' | 'bot' | 'group' | 'channel'
export type ConversationMemberType = 'user' | 'character' | 'bot'
export type ConversationMemberRole = 'owner' | 'admin' | 'member'

export interface ConversationMember {
  id: string
  chatId: string
  memberType: ConversationMemberType
  userId?: string | null
  characterId?: string | null
  role: ConversationMemberRole
  joinedAt: string
  lastReadSeq: number
}

export interface Conversation {
  id: string
  type: ConversationType
  title?: string | null
  maxSeq: number
  lastMessageAt?: string | null
  lastMessagePreview?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  members: ConversationMember[]
  unreadCount: number
  lastReadSeq: number
}

export interface LocalConversation extends Conversation {
  lastSyncSeq: number
  selectedBranches: Record<string, number> // forkPointId → selected branch index
}
