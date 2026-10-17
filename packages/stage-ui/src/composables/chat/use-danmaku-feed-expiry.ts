import type { MaybeRefOrGetter } from 'vue'

import { storeToRefs } from 'pinia'
import { computed, effectScope, shallowRef, toValue, watch } from 'vue'

import { useChatSessionStore } from '../../stores/chat/session-store'
import { useChatFeedExpiry } from './use-chat-feed-expiry'
import { useDanmakuFeedSettings } from './use-danmaku-feed-settings'
import { useSpeechOutputVoicing } from './use-speech-output-voicing'

/**
 * Supplies the message-feed history cutoff to both desktop apps.
 * Its child scope owns speech subscriptions and reading timers only while the message-feed style hides read messages.
 */
export function useDanmakuFeedExpiry(danmaku: MaybeRefOrGetter<boolean>, expire: MaybeRefOrGetter<boolean>) {
  const { hideReadMessages, charactersPerSecond, minimumSeconds } = useDanmakuFeedSettings()
  const feed = shallowRef<ReturnType<typeof useChatFeedExpiry>>()

  // The cleanup stops the scope when the work stops and when the caller's
  // scope ends, so one run of the work exists at most.
  watch(() => toValue(danmaku) && hideReadMessages.value, (active, _previous, onCleanup) => {
    if (!active)
      return

    const scope = effectScope()
    feed.value = scope.run(() => {
      const { messages } = storeToRefs(useChatSessionStore())
      const { voicing, initialLookupSettled } = useSpeechOutputVoicing()

      return useChatFeedExpiry({
        messages,
        voicing,
        voicingLookupSettled: initialLookupSettled,
        enabled: expire,
        charactersPerSecond,
        minimumSeconds,
      })
    })
    onCleanup(() => {
      scope.stop()
      feed.value = undefined
    })
  }, { immediate: true })

  return computed(() => feed.value?.expiredBefore.value ?? 0)
}
