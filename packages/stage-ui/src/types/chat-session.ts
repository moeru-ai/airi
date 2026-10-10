import type { Automation, VoiceInterruptionEvent } from '@proj-airi/core-agent'

import type { ChatHistoryItem } from './chat'

/** Storage and cross-window transport contain text diagnostics instead of live Error objects. */
export interface StoredVoiceInterruption extends Omit<VoiceInterruptionEvent, 'playback'> {
  playback: Omit<VoiceInterruptionEvent['playback'], 'error'> & { errorMessage?: string }
}

/**
 * Where a background task stands. `armed` waits for the automation that the model set. It survives a restart.
 * `interrupted` means the owner stopped it or the app closed while it waited in the queue or ran.
 */
export type ChatSessionTaskStatus = 'armed' | 'queued' | 'running' | 'done' | 'failed' | 'interrupted'

export interface ChatSessionTask {
  status: ChatSessionTaskStatus
  /** When the task was queued, or set for an armed task. */
  startedAt: number
  endedAt?: number
  /** For an armed task: when it runs, once, and the note that the model left for that run. */
  armed?: { automation: Automation, note: string }
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
