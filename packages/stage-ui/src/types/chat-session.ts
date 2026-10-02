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
   * Present when an ACP Client opened this session. `connected` means this
   * session can use that ACP Client's files, terminal, and MCP servers.
   * `disconnected` keeps the chat visible and rejects new messages.
   */
  acpClient?: AcpClientLink
}

/** ACP Client link stored with one chat session. */
export interface AcpClientLink {
  status: 'connected' | 'disconnected'
  readTextFile: boolean
  writeTextFile: boolean
  terminal: boolean
  elicitForm: boolean
  hasMcp: boolean
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
