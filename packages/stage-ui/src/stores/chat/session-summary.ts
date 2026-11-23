import type { ListedRemoteChat } from '../../libs/chat-sync'
import type { ChatHistoryItem } from '../../types/chat'
import type { ChatSessionSummary } from '../../types/chat-session'

import { isValid, parseISO } from 'date-fns'

import { extractMessageText } from '../../libs/chat-sync'

/** The longest text that a summary keeps. A row of the conversation list shows less. */
const SUMMARY_TEXT_LENGTH = 120

function shortenSummaryText(value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > SUMMARY_TEXT_LENGTH ? `${text.slice(0, SUMMARY_TEXT_LENGTH)}…` : text
}

function summaryTextOf(message: ChatHistoryItem) {
  return shortenSummaryText(extractMessageText(message))
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
 * The summary of a chat that the server lists, for a session whose messages are not on this device yet.
 *
 * @example
 * summaryOfRemoteChat({ firstMessageText: 'Hi', lastMessageText: 'Hello', lastMessageRole: 'assistant', lastMessageAt: '2026-01-01T00:00:00.000Z', ...chat })
 * // => { firstText: 'Hi', lastText: 'Hello', lastFromUser: false, lastAt: 1767225600000 }
 */
export function summaryOfRemoteChat(chat: ListedRemoteChat): ChatSessionSummary {
  const summary: ChatSessionSummary = {}
  const firstText = shortenSummaryText(chat.firstMessageText ?? '')
  if (firstText)
    summary.firstText = firstText
  const lastText = shortenSummaryText(chat.lastMessageText ?? '')
  if (lastText) {
    summary.lastText = lastText
    summary.lastFromUser = chat.lastMessageRole === 'user'
  }
  const lastAt = chat.lastMessageAt ? parseISO(chat.lastMessageAt) : undefined
  if (lastAt && isValid(lastAt))
    summary.lastAt = lastAt.getTime()
  return summary
}
