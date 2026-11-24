import type { ChatSessionMeta } from '../../../../types/chat-session'

/** A conversation preview that the session owner prepares for the conversation list. */
export interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  /** The last message, for the second line of the row. Missing until the messages of the conversation load. */
  lastMessage?: string
  isActive: boolean
  /** The time of the last message, or the creation time of an empty conversation, in Unix milliseconds. */
  activityAt: number
  /** The short time of the row, for example `09:05` today or `yesterday`. See `formatSessionRowTime`. */
  activityAtLabel: string
  /** The full date and time, for the tooltip of the row time and the menu of a touch row. */
  activityAtTitle: string
  /** The name of the character of the conversation. */
  characterName: string
}
