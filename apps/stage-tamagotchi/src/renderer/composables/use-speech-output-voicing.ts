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
 * @returns `voicing`, and `known`, which turns `true` once the first value
 * arrived or no output host answered. Until then, `voicing` is `false` only
 * because nothing is known yet.
 */
export function useSpeechOutputVoicing() {
  const voicing = shallowRef(false)
  const known = shallowRef(false)
  const context = getSpeechBusContext()

  const stopChanges = context.on(speechOutputPlaybackStateChangedEvent, (event) => {
    if (!event?.body)
      return

    voicing.value = event.body.voicing
    known.value = true
  })
  onScopeDispose(stopChanges)

  const getPlaybackState = defineInvoke(context, speechOutputGetPlaybackState)
  getPlaybackState(undefined, { signal: AbortSignal.timeout(1000) })
    .then((state) => {
      // A change event that arrived first is newer than this answer.
      if (!known.value)
        voicing.value = state.voicing
    })
    .catch(() => {
      // No output host answered, so no speech plays that this window can see.
    })
    .finally(() => {
      known.value = true
    })

  return { voicing, known }
}
