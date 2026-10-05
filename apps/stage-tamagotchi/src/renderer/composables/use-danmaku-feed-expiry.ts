import type { EffectScope, MaybeRefOrGetter } from 'vue'

import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { storeToRefs } from 'pinia'
import { effectScope, onScopeDispose, shallowRef, toValue, watch } from 'vue'

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
 * @param danmaku Whether the window shows the danmaku style.
 * @param expire Whether read messages hide now, such as while the composer is folded.
 * @returns The index of the first message that shows. It is 0 outside the danmaku style.
 */
export function useDanmakuFeedExpiry(danmaku: MaybeRefOrGetter<boolean>, expire: MaybeRefOrGetter<boolean>) {
  const expiredBefore = shallowRef(0)
  let scope: EffectScope | undefined

  function start() {
    scope = effectScope()
    scope.run(() => {
      const { activeSessionId, messages } = storeToRefs(useChatSessionStore())
      const { streamingMessage } = storeToRefs(useChatStreamStore())
      const { activeTurns } = storeToRefs(useChatStore())
      const { charactersPerSecond, minimumSeconds } = useDanmakuFeedSettings()
      const { voicing, initialLookupSettled } = useSpeechOutputVoicing()

      const feed = useChatFeedExpiry({
        messages,
        generatingMessageId: () => activeTurns.value.some(turn => turn.sessionId === activeSessionId.value)
          ? streamingMessage.value?.id
          : undefined,
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
  }

  function stop() {
    scope?.stop()
    scope = undefined
    expiredBefore.value = 0
  }

  watch(() => toValue(danmaku), (active) => {
    stop()
    if (active)
      start()
  }, { immediate: true })
  onScopeDispose(stop)

  return expiredBefore
}
