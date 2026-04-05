import type { ChatHistoryItem } from '../../../types/chat'

export type ChatHistoryEntry = {
  type: 'timestamp'
  timestamp: number
} | {
  type: 'message'
  message: ChatHistoryItem
  index: number
}

export function getChatHistoryItemTimestamp(message: ChatHistoryItem | undefined) {
  return message?.createdAt ?? message?.context?.createdAt
}

function areSameDay(leftTimestamp: number, rightTimestamp: number) {
  const left = new Date(leftTimestamp)
  const right = new Date(rightTimestamp)
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

export function shouldShowChatTimestampHeader(messages: ChatHistoryItem[], index: number, message: ChatHistoryItem) {
  const currentTimestamp = getChatHistoryItemTimestamp(message)
  if (currentTimestamp == null)
    return false

  if (index === 0)
    return true

  const previousTimestamp = getChatHistoryItemTimestamp(messages[index - 1])
  if (previousTimestamp == null)
    return true

  if (!areSameDay(currentTimestamp, previousTimestamp))
    return true

  return currentTimestamp - previousTimestamp >= 30 * 60 * 1000
}

export function buildChatHistoryEntries(messages: ChatHistoryItem[]): ChatHistoryEntry[] {
  const entries: ChatHistoryEntry[] = []

  messages.forEach((message, index) => {
    const timestamp = getChatHistoryItemTimestamp(message)

    if (timestamp != null && shouldShowChatTimestampHeader(messages, index, message)) {
      entries.push({
        type: 'timestamp',
        timestamp,
      })
    }

    entries.push({
      type: 'message',
      message,
      index,
    })
  })

  return entries
}
