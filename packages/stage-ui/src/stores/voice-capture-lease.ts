import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { CaptureLeases } from '../libs/voice/capture-lease'
import { getSpeechBusContext, voiceCaptureLease } from '../services/speech/bus'

/**
 * Tells the voice host when another window holds a capture lease, for example during a voiceprint enrollment.
 *
 * The voice host calls `connect`. While `held` is true, speech input and voice messages do not record.
 */
export const useVoiceCaptureLeaseStore = defineStore('voice-capture-lease', () => {
  const held = shallowRef(false)

  /** Follows the leases on the speech bus. The returned function stops, and `held` becomes false. */
  function connect() {
    const leases = new CaptureLeases(value => held.value = value)
    const stop = getSpeechBusContext().on(voiceCaptureLease, ({ body }) => {
      if (body)
        leases.update(body.id, body.until)
    })
    return () => {
      stop()
      leases.dispose()
      held.value = false
    }
  }

  return { held, connect }
})
