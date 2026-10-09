import type { MaybeRefOrGetter } from 'vue'

import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { storeToRefs } from 'pinia'
import { computed, effectScope, shallowRef, toValue, watch } from 'vue'

import { useChatFeedExpiry } from './use-chat-feed-expiry'
import { useDanmakuFeedSettings } from './use-danmaku-feed-settings'
import { useSpeechOutputVoicing } from './use-speech-output-voicing'

/**
 * Hides the read messages of the danmaku feed, for the `expiredBefore` prop of
 * the chat.
 *
 * The danmaku chat window owns this, not the chat component, so other chat
 * surfaces never follow the speech output or count reading time. The work
 * runs only in the danmaku style with read messages hidden: the speech
 * subscription, the message watches, and the timers start and stop with it.
 *
 * @param danmaku Whether the chat shows the danmaku style.
 * @param expire Whether read messages hide now, such as while the composer is folded.
 * @returns The index of the first message that shows. It is 0 while the work does not run.
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
