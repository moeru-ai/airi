import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { MaybeRefOrGetter } from 'vue'

import { getChatHistoryItemCopyText, getChatHistoryItemKey } from '@proj-airi/stage-ui/components/scenarios/chat'
import { computed, onScopeDispose, shallowReactive, shallowRef, toValue, watch } from 'vue'

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * Time to read a text at the reader's speed. Every language counts the same
 * way, by visible characters, and the reader sets the speed. So no language
 * needs its own rule.
 */
function readingTimeOf(text: string, charactersPerSecond: number, minimumSeconds: number) {
  let characters = 0
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (segment.trim())
      characters += 1
  }

  return Math.max(minimumSeconds, characters / charactersPerSecond) * 1000
}

interface ChatFeedExpiryOptions {
  /** Stored messages of the shown session, in history order. */
  messages: MaybeRefOrGetter<ChatHistoryItem[]>
  /** Id of the assistant message that is still generating, if any. */
  generatingMessageId: MaybeRefOrGetter<string | undefined>
  /** `voicing` of the speech output. See `SpeechOutputPlaybackState` in the speech bus. */
  voicing: MaybeRefOrGetter<boolean>
  /**
   * Whether `voicing` holds the real state. A window that opens while a reply
   * is spoken learns it only after a round trip, so no message leaves for good
   * before then.
   */
  voicingKnown: MaybeRefOrGetter<boolean>
  /** Whether messages expire. Without it, every message shows. */
  enabled: MaybeRefOrGetter<boolean>
  /** Reading speed that the reader set, in visible characters per second. */
  charactersPerSecond: MaybeRefOrGetter<number>
  /** Shortest time that a message shows, in seconds, which the reader set. */
  minimumSeconds: MaybeRefOrGetter<number>
}

/**
 * Decides which messages a feed has shown long enough, so a reader who glances
 * at it never faces a growing wall of text.
 *
 * A message expires after the time to read it at the reader's speed, counted
 * from when it was complete. A reply that speech output voiced expires when the
 * speech ends instead. A new speed applies to every message that still shows.
 * Messages expire in history order, so the feed only loses its top message,
 * and a short message never leaves a gap above a long one.
 *
 * State lives as long as the calling scope. Once the speech state is known, a
 * message that expired never returns, even when speech starts again, so a
 * message cannot flicker. Before that, a reply that is still spoken can
 * return, because a new window cannot yet know that it is spoken.
 *
 * @returns `expiredBefore`, the index of the first message that still shows,
 * for the `expiredBefore` prop of `ChatHistory`. It is 0 while disabled.
 */
export function useChatFeedExpiry(options: ChatFeedExpiryOptions) {
  /** Clock of the last evaluation. A timer moves it to the next deadline. */
  const now = shallowRef(Date.now())
  /** When a reply that this window saw generating became complete, by message id. */
  const completedAt = shallowReactive(new Map<string, number>())
  /** Replies that speech output voiced, by message id, with the time the speech ended. `undefined` while it plays. */
  const voicedUntil = shallowReactive(new Map<string, number | undefined>())
  /** When this window first saw a message that has no `createdAt`. */
  const firstSeenAt = shallowReactive(new Map<string | number, number>())
  /** Messages that already left the feed. */
  const expiredKeys = shallowReactive(new Set<string | number>())

  watch(() => toValue(options.generatingMessageId), (generating, previous) => {
    if (previous && previous !== generating)
      completedAt.set(previous, Date.now())
  }, { immediate: true })

  // The session store appends messages in place, so the watch looks one level deep.
  watch(() => toValue(options.messages), (messages) => {
    messages.forEach((message, index) => {
      const key = getChatHistoryItemKey(message, index)
      if (message.createdAt == null && !firstSeenAt.has(key))
        firstSeenAt.set(key, Date.now())
    })
  }, { deep: 1, immediate: true })

  watch(() => toValue(options.voicing), (voicing) => {
    if (!voicing) {
      for (const [id, until] of voicedUntil) {
        if (until === undefined)
          voicedUntil.set(id, Date.now())
      }
      return
    }

    // Speech output plays the newest reply: the one that generates, or else
    // the last complete one. A reply that already left stays gone.
    const messages = toValue(options.messages)
    const voicedId = toValue(options.generatingMessageId) ?? messages.findLast(message => message.role === 'assistant')?.id
    if (!voicedId)
      return

    const voicedIndex = messages.findIndex(message => message.id === voicedId)
    if (voicedIndex !== -1 && expiredKeys.has(getChatHistoryItemKey(messages[voicedIndex], voicedIndex)))
      return

    voicedUntil.set(voicedId, undefined)
  }, { immediate: true })

  function deadlineOf(message: ChatHistoryItem, index: number) {
    const key = getChatHistoryItemKey(message, index)
    // The history never shows a system message.
    if (expiredKeys.has(key) || message.role === 'system')
      return Number.NEGATIVE_INFINITY

    if (message.id && message.id === toValue(options.generatingMessageId))
      return Number.POSITIVE_INFINITY

    if (message.id && voicedUntil.has(message.id))
      return voicedUntil.get(message.id) ?? Number.POSITIVE_INFINITY

    // A reply that this window saw generating counts from its completion. A
    // message from before, such as one in a session that the user opens,
    // counts from when it was sent, so it is already gone.
    const completed = message.id ? completedAt.get(message.id) : undefined
    const start = completed ?? message.createdAt ?? firstSeenAt.get(key)
    // A message without `createdAt` waits for the watch above to record when it appeared.
    if (start === undefined)
      return Number.POSITIVE_INFINITY

    return start + readingTimeOf(getChatHistoryItemCopyText(message), toValue(options.charactersPerSecond), toValue(options.minimumSeconds))
  }

  /** Deadlines in history order. Each is at least the one before it, so messages leave from the top. */
  const deadlines = computed(() => {
    let latest = Number.NEGATIVE_INFINITY
    return toValue(options.messages).map((message, index) => {
      latest = Math.max(latest, deadlineOf(message, index))
      return latest
    })
  })

  const expiredBefore = computed(() => {
    if (!toValue(options.enabled))
      return 0

    const firstShown = deadlines.value.findIndex(deadline => deadline > now.value)
    return firstShown === -1 ? deadlines.value.length : firstShown
  })

  // The message list counts too: another session can expire as many messages
  // as the one before, and its messages still need their lock.
  watch([expiredBefore, () => toValue(options.voicingKnown), () => toValue(options.messages)], ([count, voicingKnown, messages]) => {
    if (!voicingKnown)
      return

    messages.slice(0, count).forEach((message, index) => {
      expiredKeys.add(getChatHistoryItemKey(message, index))
    })
  }, { immediate: true })

  // One timer at a time wakes the clock at the next deadline. A wake, or any
  // change of the deadlines, reads the clock and sets the timer again.
  let wakeTimer: ReturnType<typeof setTimeout> | undefined
  function wakeAtNextDeadline() {
    clearTimeout(wakeTimer)
    now.value = Date.now()
    if (!toValue(options.enabled))
      return

    const next = deadlines.value.find(deadline => deadline > now.value)
    if (next !== undefined && Number.isFinite(next))
      wakeTimer = setTimeout(wakeAtNextDeadline, next - now.value)
  }
  watch([deadlines, () => toValue(options.enabled)], wakeAtNextDeadline, { immediate: true })
  onScopeDispose(() => clearTimeout(wakeTimer))

  return { expiredBefore }
}
