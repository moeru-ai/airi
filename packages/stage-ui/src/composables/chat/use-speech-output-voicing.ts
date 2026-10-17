import { defineInvoke } from '@moeru/eventa'
import { onScopeDispose, shallowRef } from 'vue'

import { getSpeechBusContext, speechOutputGetPlaybackState, speechOutputPlaybackStateChangedEvent } from '../../services/speech/bus'

export function useSpeechOutputVoicing() {
  const voicing = shallowRef(false)
  const initialLookupSettled = shallowRef(false)
  const context = getSpeechBusContext()
  let reported = false

  const stopChanges = context.on(speechOutputPlaybackStateChangedEvent, (event) => {
    if (!event?.body)
      return

    reported = true
    voicing.value = event.body.voicing
    initialLookupSettled.value = true
  })
  onScopeDispose(stopChanges)

  const getPlaybackState = defineInvoke(context, speechOutputGetPlaybackState)
  getPlaybackState(undefined, { signal: AbortSignal.timeout(1000) })
    .then((state) => {
      // A change event that arrived first is newer than this answer.
      if (!reported)
        voicing.value = state.voicing
    })
    .catch((error) => {
      console.warn('[chat-window] The speech output state was not available:', error)
    })
    .finally(() => {
      initialLookupSettled.value = true
    })

  return { voicing, initialLookupSettled }
}
