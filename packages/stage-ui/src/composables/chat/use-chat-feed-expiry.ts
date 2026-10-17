import type { MaybeRefOrGetter } from 'vue'

import type { ChatHistoryItem } from '../../types/chat'

import { computed, onScopeDispose, shallowReactive, shallowRef, toValue, watch } from 'vue'

import { getChatHistoryItemCopyText } from '../../components/scenarios/chat/utils'

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function readingTimeOf(text: string, charactersPerSecond: number, minimumSeconds: number) {
  let characters = 0
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (segment.trim())
      characters += 1
  }

  return Math.max(minimumSeconds, characters / charactersPerSecond) * 1000
}

interface ChatFeedExpiryOptions {
  messages: MaybeRefOrGetter<ChatHistoryItem[]>
  voicing: MaybeRefOrGetter<boolean>
  voicingLookupSettled: MaybeRefOrGetter<boolean>
  enabled: MaybeRefOrGetter<boolean>
  charactersPerSecond: MaybeRefOrGetter<number>
  minimumSeconds: MaybeRefOrGetter<number>
}

export function useChatFeedExpiry(options: ChatFeedExpiryOptions) {
  const now = shallowRef(Date.now())
  const speechEndedAt = shallowReactive(new Map<string, number>())
  const expiredIds = shallowReactive(new Set<string>())

  const newestReplyId = computed(() => toValue(options.messages).findLast(message => message.role === 'assistant')?.id)
  watch(() => toValue(options.voicing), (voicing, wasVoicing) => {
    if (wasVoicing && !voicing && newestReplyId.value)
      speechEndedAt.set(newestReplyId.value, Date.now())
  })

  function deadlineOf(message: ChatHistoryItem) {
    // The history never shows a system message.
    if ((message.id && expiredIds.has(message.id)) || message.role === 'system')
      return Number.NEGATIVE_INFINITY

    if (message.id && message.id === newestReplyId.value && toValue(options.voicing))
      return Number.POSITIVE_INFINITY

    // A reply counts from when it was complete, and other messages from when
    // they were sent. Messages of an older session are therefore already gone.
    const start = message.completedAt ?? message.createdAt
    if (start === undefined)
      return Number.NEGATIVE_INFINITY

    // A reply that another window generated joins the history only when it is
    // complete, which can be just before its speech ends.
    const speechEnded = message.id ? speechEndedAt.get(message.id) : undefined
    if (speechEnded !== undefined)
      return Math.max(speechEnded, start + toValue(options.minimumSeconds) * 1000)

    return start + readingTimeOf(getChatHistoryItemCopyText(message), toValue(options.charactersPerSecond), toValue(options.minimumSeconds))
  }

  const deadlines = computed(() => {
    let latest = Number.NEGATIVE_INFINITY
    return toValue(options.messages).map((message) => {
      latest = Math.max(latest, deadlineOf(message))
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
  watch([expiredBefore, () => toValue(options.voicingLookupSettled), () => toValue(options.messages)], ([count, voicingLookupSettled, messages]) => {
    if (!voicingLookupSettled)
      return

    for (const message of messages.slice(0, count)) {
      if (message.id)
        expiredIds.add(message.id)
    }
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
