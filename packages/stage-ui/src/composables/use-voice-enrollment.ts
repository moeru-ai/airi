import type { VoiceEnrollmentSnapshot } from '../libs/voice/voice-enrollment'

import { computed, onScopeDispose, shallowRef } from 'vue'

import { holdCaptureLease } from '../libs/voice/capture-lease'
import { computeVoiceprint } from '../libs/voice/speaker-model'
import { VoiceEnrollment } from '../libs/voice/voice-enrollment'
import { useSettingsAudioDevice } from '../stores/settings/audio-device'
import { useVoiceprintStore } from '../stores/voiceprint'
import { SileroVad } from '../workers/vad/silero-vad'

/** `idle` means that no enrollment ran in this scope. A settled enrollment keeps its last state until the next `begin`. */
export type VoiceEnrollmentState = { readonly phase: 'idle' } | VoiceEnrollmentSnapshot

/**
 * Runs voiceprint enrollments from the speech input of this window, and saves the voiceprint.
 *
 * The enrollment belongs to the calling component. When the component unmounts, the enrollment ends and saves nothing.
 * While it records, it holds a capture lease, so the voice host in another window begins no input and records no
 * voice message. When the window closes, the lease ends by itself.
 */
export function useVoiceEnrollment() {
  const devices = useSettingsAudioDevice()
  const voiceprints = useVoiceprintStore()
  const state = shallowRef<VoiceEnrollmentState>({ phase: 'idle' })
  const busy = computed(() => state.value.phase === 'recording' || state.value.phase === 'enrolling')
  let enrollment: VoiceEnrollment | undefined

  /** Starts recording. Returns false while an enrollment records or enrolls. */
  function begin(): boolean {
    if (busy.value)
      return false

    const startedAt = Date.now()
    const lease = new AbortController()
    holdCaptureLease(lease.signal)
    const vad = new SileroVad()
    const current = new VoiceEnrollment(devices.input, {
      detect: (window, signal) => vad.score(window, signal),
      enroll: async (speech, sampleRate, signal) => {
        const voiceprint = await computeVoiceprint(speech, sampleRate, signal)
        signal.throwIfAborted()
        if (!voiceprints.save(voiceprint, startedAt))
          throw new Error('The voiceprint was deleted during the enrollment')
      },
    })
    enrollment = current
    const stop = current.subscribe(() => {
      state.value = current.snapshot
      // The voiceprint model does not use the microphone, so the voice host can resume when the recording ends.
      if (current.snapshot.phase !== 'recording')
        lease.abort('Voice enrollment recording ended')
    })
    void current.done.finally(() => {
      stop()
      lease.abort('Voice enrollment ended')
      void vad.close()
      if (enrollment === current)
        enrollment = undefined
    })
    state.value = current.snapshot
    return true
  }

  /** Ends the recording. The recorded speech then enrolls. */
  function finish(): boolean {
    if (!enrollment || state.value.phase !== 'recording')
      return false
    enrollment.finish()
    return true
  }

  /** Stops the recording or the voiceprint computation without a change to the saved voiceprint. */
  function cancel(): boolean {
    if (!enrollment || !busy.value)
      return false
    enrollment.cancel()
    return true
  }

  onScopeDispose(() => {
    enrollment?.cancel()
  })

  return { state, busy, begin, finish, cancel }
}
