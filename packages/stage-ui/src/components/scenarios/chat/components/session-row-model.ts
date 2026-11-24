import type { ChatSessionMeta } from '../../../../types/chat-session'

/** A conversation preview that the session owner prepares for the conversation list. */
export interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  /** The last message, for the second line of the row. Missing until the messages of the conversation load. */
  lastMessage?: string
  isActive: boolean
  activityAtLabel: string
  /** The name of the character of the conversation. */
  characterName: string
}
