import type { VoiceInterruptionEvent } from '@proj-airi/core-agent'

import type { ChatHistoryItem } from './chat'

/** Storage and cross-window transport contain text diagnostics instead of live Error objects. */
export interface StoredVoiceInterruption extends Omit<VoiceInterruptionEvent, 'playback'> {
  playback: Omit<VoiceInterruptionEvent['playback'], 'error'> & { errorMessage?: string }
}

/**
 * Where a background task stands. `interrupted` means the owner stopped it or the app closed while it ran.
 */
export type ChatSessionTaskStatus = 'running' | 'done' | 'failed' | 'interrupted'

export interface ChatSessionTask {
  status: ChatSessionTaskStatus
  /** When the task started. */
  startedAt: number
  endedAt?: number
}

export interface ChatSessionMeta {
  sessionId: string
  userId: string
  characterId: string
  /** External scene identities that recover this session within its user and persona partition. */
  bindings?: string[]
  /** Session from which this conversation branch was copied. */
  parentSessionId?: string
  /** Excludes task branches from conversation navigation. */
  hidden?: boolean
  /** The recipe whose own space this session is. Its runs read the recipe's steps, and only the host starts them. */
  recipeId?: string
  /** The background task that this session runs. Each task has its own session, so the status stays after the task ends. */
  task?: ChatSessionTask
  title?: string
  /** Title waiting for cloud delivery. An empty string means clear the title. */
  cloudTitlePending?: string
  createdAt: number
  updatedAt: number
  /** Control events inform later agent requests without adding user messages. */
  controlEvents?: StoredVoiceInterruption[]
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
  /** When the owner pinned the conversation. The conversation list shows pinned conversations first. This device only. */
  pinnedAt?: number
  /** When the owner archived the conversation. The conversation list moves it to its archive. This device only. */
  archivedAt?: number
  /** The folder of the conversation, a key of {@link ChatSessionsIndex.folders}. This device only. */
  folderId?: string
}

/** A folder that groups conversations of any character in the conversation list. */
export interface ChatSessionFolder {
  id: string
  name: string
  createdAt: number
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
  /** Folders of the conversation list, by ID. A folder holds conversations of every character, so the index of the user owns it. */
  folders?: Record<string, ChatSessionFolder>
}

export interface ChatSessionsExport {
  format: 'chat-sessions-index:v1'
  index: ChatSessionsIndex
  sessions: Record<string, ChatSessionRecord>
}
