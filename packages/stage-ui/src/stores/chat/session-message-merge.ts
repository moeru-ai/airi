import type { ChatHistoryItem } from '../../types/chat'

function extractMessageContent(message: ChatHistoryItem) {
  if (typeof message.content === 'string')
    return message.content

  if (Array.isArray(message.content)) {
    return message.content.map((part) => {
      if (typeof part === 'string')
        return part
      if (part && typeof part === 'object' && 'text' in part)
        return String(part.text ?? '')
      return ''
    }).join('')
  }

  return ''
}

function getMessageFingerprint(message: ChatHistoryItem) {
  return [
    message.id ?? '',
    message.role,
    message.createdAt ?? '',
    extractMessageContent(message),
  ].join('\u001F')
}

export function mergeLoadedSessionMessages(storedMessages: ChatHistoryItem[], currentMessages: ChatHistoryItem[]) {
  if (currentMessages.length === 0)
    return storedMessages

  const currentNonSystemMessages = currentMessages.filter((message, index) => !(index === 0 && message.role === 'system'))
  if (currentNonSystemMessages.length === 0)
    return storedMessages

  const seen = new Set(storedMessages.map(getMessageFingerprint))
  const extraMessages = currentNonSystemMessages.filter((message) => {
    const fingerprint = getMessageFingerprint(message)
    if (seen.has(fingerprint))
      return false
    seen.add(fingerprint)
    return true
  })

  if (extraMessages.length === 0)
    return storedMessages

  const systemMessage = storedMessages[0]?.role === 'system'
    ? storedMessages[0]
    : currentMessages[0]?.role === 'system'
      ? currentMessages[0]
      : undefined

  if (storedMessages.length === 0 && systemMessage)
    return [systemMessage, ...extraMessages]

  return [...storedMessages, ...extraMessages]
}
