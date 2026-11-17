import { defineInvoke } from '@moeru/eventa'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '@proj-airi/stage-ui/services/speech/bus'

/**
 * Creates a reader of whether the renderer that plays speech speaks now.
 *
 * A mute control in a window without playback passes it to `useStopSpeakingButton`, which records the result in analytics.
 */
export function createPlaybackSpeakingReader() {
  const getOutputPlaybackState = defineInvoke(getSpeechBusContext(), speechOutputGetPlaybackState)
  return async () => {
    // A BroadcastChannel round trip is normally immediate. Bound the
    // analytics-only lookup so a reloading output renderer cannot stall mute.
    const state = await getOutputPlaybackState(undefined, {
      signal: AbortSignal.timeout(1000),
    })
    return state.speaking
  }
}
