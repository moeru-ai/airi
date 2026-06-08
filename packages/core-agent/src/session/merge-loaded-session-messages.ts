import type { ChatHistoryItem } from '../types/chat'

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

/**
 * Reconcile a session's persisted (disk) messages with the live in-memory list
 * on hydrate from IndexedDB, keeping every message once and in time order.
 *
 * Returns `storedMessages` itself (same reference) when nothing needs merging,
 * so the caller's `merged !== stored` check can skip a re-persist. Otherwise a
 * new array: the deduped union, system message pinned first, the rest ordered by
 * `createdAt` so a re-hydrated orphan lands in its slot rather than at the tail.
 */
export function mergeLoadedSessionMessages(storedMessages: ChatHistoryItem[], currentMessages: ChatHistoryItem[]) {
  if (currentMessages.length === 0)
    return storedMessages

  const currentNonSystemMessages = currentMessages.filter((message, index) => index !== 0 || message.role !== 'system')
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

  // Pin the system message at the head: stored[0] when it is the system message,
  // else current[0] only when storage is empty and it is the system message.
  const storedHasSystemHead = storedMessages[0]?.role === 'system'
  const head = storedHasSystemHead
    ? [storedMessages[0]]
    : storedMessages.length === 0 && currentMessages[0]?.role === 'system'
      ? [currentMessages[0]]
      : []

  const restBase = storedHasSystemHead ? storedMessages.slice(1) : storedMessages
  const rest = restBase.concat(extraMessages)

  // Order the body by createdAt. It is optional (some error rows lack one), so
  // carry the previous key forward instead of coercing missing to 0, which would
  // jump keyless rows to the front and persist that as a reorder. The index
  // tiebreak keeps equal-createdAt pairs in arrival order deterministically.
  const sortKeys: number[] = []
  let carry = head[0]?.createdAt ?? 0
  for (const message of rest) {
    if (typeof message.createdAt === 'number')
      carry = message.createdAt
    sortKeys.push(carry)
  }

  const order = rest.map((_, index) => index)
  order.sort((a, b) => (sortKeys[a] - sortKeys[b]) || (a - b))

  return [...head, ...order.map(index => rest[index])]
}
