import type { MaybeRefOrGetter } from 'vue'

import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { storeToRefs } from 'pinia'
import { effectScope, shallowRef, toValue, watch } from 'vue'

import { useChatFeedExpiry } from './use-chat-feed-expiry'
import { useDanmakuFeedSettings } from './use-danmaku-feed-settings'
import { useSpeechOutputVoicing } from './use-speech-output-voicing'

/**
 * Hides the read messages of the danmaku feed, for the `expiredBefore` prop of
 * the chat.
 *
 * The danmaku chat window owns this, not the chat component, so other chat
 * surfaces never follow the speech output or count reading time. The work
 * runs only while `danmaku` holds: the speech subscription, the message
 * watches, and the timers start with it and stop without it.
 *
 * @param expire Whether read messages hide now, such as while the composer is folded.
 * @returns The index of the first message that shows. It is 0 outside the danmaku style.
 */
export function useDanmakuFeedExpiry(danmaku: MaybeRefOrGetter<boolean>, expire: MaybeRefOrGetter<boolean>) {
  const expiredBefore = shallowRef(0)

  // The cleanup stops the scope when the style changes and when the caller's
  // scope ends, so one run of the work exists at most.
  watch(() => toValue(danmaku), (active, _previous, onCleanup) => {
    if (!active)
      return

    const scope = effectScope()
    scope.run(() => {
      const { messages } = storeToRefs(useChatSessionStore())
      const { charactersPerSecond, minimumSeconds } = useDanmakuFeedSettings()
      const { voicing, initialLookupSettled } = useSpeechOutputVoicing()

      const feed = useChatFeedExpiry({
        messages,
        voicing,
        voicingLookupSettled: initialLookupSettled,
        enabled: expire,
        charactersPerSecond,
        minimumSeconds,
      })
      watch(feed.expiredBefore, (count) => {
        expiredBefore.value = count
      }, { immediate: true })
    })
    onCleanup(() => {
      scope.stop()
      expiredBefore.value = 0
    })
  }, { immediate: true })

  return expiredBefore
}
