import type { ChatSessionMeta } from '../../../../types/chat-session'

/** A conversation preview that the session owner prepares for the conversation list. */
export interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  isActive: boolean
  activityAtLabel: string
  /** The name of the character of the conversation. */
  characterName: string
  /** The preview image of the default model of the character. Without it, the avatar shows its fallback. */
  characterPreview?: string
}
