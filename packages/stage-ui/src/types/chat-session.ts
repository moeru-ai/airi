import type { ChatHistoryItem } from './chat'

export interface ChatCharacterSessionsIndex {
  activeSessionId: string
  sessions: Record<string, ChatSessionMeta>
}

export interface ChatSessionMeta {
  characterId: string
  /**
   * Cloud chat id assigned by the server once this session is mirrored to the
   * `chats` table. Set during cloud reconcile, persisted across reloads. When
   * absent the session is local-only.
   */
  cloudChatId?: string
  /**
   * Highest server-assigned `seq` we have already merged into local messages
   * for this session. Used as `afterSeq` when calling `pullMessages`. Stays
   * undefined for local-only sessions.
   *
   * @default undefined
   */
  cloudMaxSeq?: number
  createdAt: number
  sessionId: string
  title?: string
  updatedAt: number
  userId: string
}

export interface ChatSessionRecord {
  messages: ChatHistoryItem[]
  meta: ChatSessionMeta
}

export interface ChatSessionsExport {
  format: 'chat-sessions-index:v1'
  index: ChatSessionsIndex
  sessions: Record<string, ChatSessionRecord>
}

export interface ChatSessionsIndex {
  characters: Record<string, ChatCharacterSessionsIndex>
  userId: string
}
