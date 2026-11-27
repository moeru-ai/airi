import type { ChatHistoryItem } from '../../types/chat'
import type { ChatSessionMeta, ChatSessionSummary } from '../../types/chat-session'

import { extractMessageText } from '../../libs/chat-sync'

/** The longest text that a summary keeps. A row of the conversation list shows less. */
const SUMMARY_TEXT_LENGTH = 120

function summaryTextOf(message: ChatHistoryItem) {
  const text = extractMessageText(message).replace(/\s+/g, ' ').trim()
  return text.length > SUMMARY_TEXT_LENGTH ? `${text.slice(0, SUMMARY_TEXT_LENGTH)}…` : text
}

function isConversationMessage(message: ChatHistoryItem) {
  return message.role === 'user' || message.role === 'assistant'
}

/**
 * Summarizes the messages of a session for the conversation list: the first and the last message with text, and the
 * time of the last message. The list reads the summary from the session metadata, so it needs no message records.
 *
 * @example
 * summarizeSessionMessages([{ role: 'user', content: 'Hi', createdAt: 1 }])
 * // => { firstText: 'Hi', lastText: 'Hi', lastFromUser: true, lastAt: 1 }
 */
export function summarizeSessionMessages(messages: readonly ChatHistoryItem[]): ChatSessionSummary {
  const summary: ChatSessionSummary = {}
  for (const message of messages) {
    if (!isConversationMessage(message))
      continue
    const text = summaryTextOf(message)
    if (text && summary.firstText === undefined)
      summary.firstText = text
    if (text) {
      summary.lastText = text
      summary.lastFromUser = message.role === 'user'
    }
    const at = message.createdAt
    if (at != null && Number.isFinite(at))
      summary.lastAt = Math.max(summary.lastAt ?? at, at)
  }
  return summary
}

/**
 * The summary of a chat for its row and its title. Loaded messages give the newest summary, for example while a reply
 * streams in. A chat that is not loaded uses the summary that its metadata stores.
 */
export function chatSummaryOf(meta: ChatSessionMeta, loaded?: readonly ChatHistoryItem[]): ChatSessionSummary {
  return loaded?.length ? summarizeSessionMessages(loaded) : meta.summary ?? {}
}

/**
 * The name of a chat: its title, else its first message. A chat with neither has no name yet, and the caller shows a
 * fallback such as "New chat".
 *
 * @example
 * chatNameOf({ title: '', ...meta }, { firstText: 'Moon notes' })
 * // => 'Moon notes'
 */
export function chatNameOf(meta: ChatSessionMeta, summary: ChatSessionSummary): string | undefined {
  return meta.title?.trim() || summary.firstText || undefined
}
