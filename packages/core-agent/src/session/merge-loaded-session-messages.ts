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
  ].join('')
}

/**
 * Reconcile a session's persisted (disk) messages with the live in-memory list
 * on hydrate from IndexedDB, keeping every message exactly once and never
 * reordering the stored rows.
 *
 * Stored order is canonical: rows can carry timestamps from different clocks
 * (local rows are stamped by the device, cloud-pulled rows by the server), so
 * sorting the body by `createdAt` can transpose a prompt/reply pair whenever
 * the clocks disagree. In-memory extras are instead placed structurally: each
 * extra lands right after the nearest preceding in-memory message that also
 * exists on disk (its anchor). That keeps an older orphan in its
 * conversational slot while plain in-flight extras still append at the tail
 * (no anchor follows them, and when memory shares nothing with disk the
 * anchor seeds at the tail).
 *
 * Returns `storedMessages` itself (same reference) when nothing needs merging,
 * so the caller's `merged !== stored` check can skip a re-persist.
 */
export function mergeLoadedSessionMessages(storedMessages: ChatHistoryItem[], currentMessages: ChatHistoryItem[]) {
  if (currentMessages.length === 0)
    return storedMessages

  const currentNonSystemMessages = currentMessages.filter((message, index) => index !== 0 || message.role !== 'system')
  if (currentNonSystemMessages.length === 0)
    return storedMessages

  // Pin the system message at the head: stored[0] when it is the system message,
  // else current[0] only when storage is empty and it is the system message.
  const storedHasSystemHead = storedMessages[0]?.role === 'system'
  const head = storedHasSystemHead
    ? [storedMessages[0]]
    : storedMessages.length === 0 && currentMessages[0]?.role === 'system'
      ? [currentMessages[0]]
      : []
  const body = storedHasSystemHead ? storedMessages.slice(1) : storedMessages

  const bodyIndexByFingerprint = new Map<string, number>()
  body.forEach((message, index) => {
    bodyIndexByFingerprint.set(getMessageFingerprint(message), index)
  })

  // Fingerprints are content-length proportional to compute, so derive each
  // in-memory one exactly once for the two walks below.
  const currentFingerprints = currentNonSystemMessages.map(getMessageFingerprint)

  // Anchor walk: extras attach to the body index of the nearest preceding
  // shared message. Before any shared message is seen, the anchor sits one
  // slot ahead of the first shared message (so leading extras precede it),
  // or at the tail when memory and disk share nothing.
  let anchor = body.length - 1
  for (const fingerprint of currentFingerprints) {
    const bodyIndex = bodyIndexByFingerprint.get(fingerprint)
    if (bodyIndex !== undefined) {
      anchor = bodyIndex - 1
      break
    }
  }

  const headFingerprint = head.length > 0 ? getMessageFingerprint(head[0]) : undefined
  const insertedFingerprints = new Set<string>()
  // Keyed by body index; -1 holds extras that precede the first stored row.
  const insertionsAfter = new Map<number, ChatHistoryItem[]>()
  currentNonSystemMessages.forEach((message, index) => {
    const fingerprint = currentFingerprints[index]
    const bodyIndex = bodyIndexByFingerprint.get(fingerprint)
    if (bodyIndex !== undefined) {
      anchor = bodyIndex
      return
    }
    if (fingerprint === headFingerprint || insertedFingerprints.has(fingerprint))
      return
    insertedFingerprints.add(fingerprint)
    const slot = insertionsAfter.get(anchor) ?? []
    slot.push(message)
    insertionsAfter.set(anchor, slot)
  })

  if (insertionsAfter.size === 0)
    return storedMessages

  const mergedBody: ChatHistoryItem[] = [...(insertionsAfter.get(-1) ?? [])]
  body.forEach((message, index) => {
    mergedBody.push(message)
    const slot = insertionsAfter.get(index)
    if (slot)
      mergedBody.push(...slot)
  })

  return [...head, ...mergedBody]
}
