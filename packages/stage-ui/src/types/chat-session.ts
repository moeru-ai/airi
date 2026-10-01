import type { Audience } from '@proj-airi/core-agent'

import type { ChatHistoryItem } from './chat'

export interface ChatSessionMeta {
  sessionId: string
  userId: string
  characterId: string
  /** External scene identities that recover this session within its user and persona partition. */
  bindings?: string[]
  /** Subjects that this history may reach. It can only narrow. A missing label is derived from bindings. */
  audience?: Audience
  /**
   * Lifecycle state. `active` has a running run. `idle` has none. `dormant` and `retired` follow longer idle periods.
   * A missing state means `idle`.
   */
  status?: ChatSessionStatus
  /** End of the most recent run. Idle thresholds count from it, or from `updatedAt` before the first run. */
  lastRunAt?: number
  /** Short summary for retrieval and cold start. It keeps the audience that its source history had. */
  digest?: ChatSessionDigest
  /** Session from which this conversation branch was copied. */
  parentSessionId?: string
  /** Purpose supplied when the branch was created. */
  forkReason?: string
  /** Excludes task branches from conversation navigation. */
  hidden?: boolean
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
}

export type ChatSessionStatus = 'active' | 'idle' | 'dormant' | 'retired'

export interface ChatSessionDigest {
  text: string
  /** Last message that the summary covers. */
  upToMessageId: string
  updatedAt: number
  /** Session audience when the summary was written. */
  audience: Audience
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
