import type { ChatSessionMeta } from '../../../../types/chat-session'

/** A conversation preview that the session owner prepares for the conversation list. */
export interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  isActive: boolean
  activityAtLabel: string
  /** The name of the character of the conversation. */
  characterName: string
}
