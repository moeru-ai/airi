import type { ChatHistoryItem } from './chat'

export interface ChatSessionMeta {
  sessionId: string
  userId: string
  characterId: string
  title?: string
  createdAt: number
  updatedAt: number
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
  /**
   * Monotonically increasing counter bumped each time the session messages
   * are cleared (reset). Persisted alongside the session so it survives
   * reloads — used by memory plugins to distinguish conversation versions.
   *
   * @default undefined
   */
  generation?: number
}

export interface ChatSessionRecord {
  meta: ChatSessionMeta
  messages: ChatHistoryItem[]
}

export interface ChatCharacterSessionsIndex {
  activeSessionId: string
  sessions: Record<string, ChatSessionMeta>
}

export interface ChatSessionsIndex {
  userId: string
  characters: Record<string, ChatCharacterSessionsIndex>
}

export interface ChatSessionsExport {
  format: 'chat-sessions-index:v1'
  index: ChatSessionsIndex
  sessions: Record<string, ChatSessionRecord>
}
