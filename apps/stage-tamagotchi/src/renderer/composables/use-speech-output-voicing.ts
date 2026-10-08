import { defineInvoke } from '@moeru/eventa'
import { getSpeechBusContext, speechOutputGetPlaybackState, speechOutputPlaybackStateChangedEvent } from '@proj-airi/stage-ui/services/speech/bus'
import { onScopeDispose, shallowRef } from 'vue'

/**
 * Follows `voicing` of the speech output, which plays in the main window, from
 * another window of the app.
 *
 * The first value comes from a request to the output host, and later values
 * from its change events. The subscription ends with the calling scope.
 *
 * @returns
 * - `voicing`: the last state that the output host reported. It is `false`
 *   before the first report.
 * - `initialLookupSettled`: `true` once the first report arrived, or the
 *   request failed. When no output host answers within one second, the
 *   request fails, and `voicing` stays `false` until a change event arrives.
 *   A consumer that waits for this value accepts that failure policy.
 */
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
