import type { ChatHistoryItem } from '../../../types/chat'

import { getChatHistoryItemCopyText } from './utils'

/** Keeps the composer preview readable without changing the selected message. */
const REPLY_PREVIEW_CHARACTER_LIMIT = 160

/** Identifies the chat message selected by a reply action. */
export interface ChatHistoryReplyPayload {
  /** Visible author name at the time that the user selects the message. */
  label: string
  /** Selected message used to build the preview and the outgoing quote. */
  message: ChatHistoryItem
}

/**
 * Normalizes message text for the compact reply preview.
 *
 * @example
 * normalizeChatReplyPreview('First line\n\nSecond line')
 * // => 'First line Second line'
 */
export function normalizeChatReplyPreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= REPLY_PREVIEW_CHARACTER_LIMIT)
    return normalized

  return `${normalized.slice(0, REPLY_PREVIEW_CHARACTER_LIMIT - 1).trimEnd()}…`
}

/** Returns the text shown in the composer for a selected reply target. */
export function getChatReplyPreview(target: ChatHistoryReplyPayload): string {
  return normalizeChatReplyPreview(getChatHistoryItemCopyText(target.message))
}

/** Returns true when a history message is the selected reply target. */
export function isChatReplyTargetMessage(target: ChatHistoryReplyPayload | undefined, message: ChatHistoryItem): boolean {
  if (!target)
    return false

  if (target.message.id != null || message.id != null)
    return target.message.id != null && target.message.id === message.id

  return target.message === message
}
