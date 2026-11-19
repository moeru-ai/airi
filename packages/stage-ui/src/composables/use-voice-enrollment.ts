import type { VoiceEnrollmentSnapshot } from '../libs/voice/voice-enrollment'

import { computed, onScopeDispose, shallowRef } from 'vue'

import { holdCaptureLease } from '../libs/voice/capture-lease'
import { computeVoiceprint } from '../libs/voice/speaker-model'
import { VoiceEnrollment } from '../libs/voice/voice-enrollment'
import { closestSimilarity, SAME_SPEAKER_SIMILARITY } from '../libs/voice/voiceprint'
import { useSettingsAudioDevice } from '../stores/settings/audio-device'
import { useVoiceprintStore } from '../stores/voiceprint'
import { SileroVad } from '../workers/vad/silero-vad'

/**
 * State of the enrollment in this scope.
 *
 * - `idle`: no enrollment ran in this scope.
 * - `review`: the new voiceprint is below {@link SAME_SPEAKER_SIMILARITY} to every usable saved one. It waits until
 *   the user keeps it with `keep`, or discards it with `discard`.
 * - The other phases come from the enrollment. A settled enrollment keeps its last state until the next `begin`.
 */
export type VoiceEnrollmentState
  = | { readonly phase: 'idle' }
    | { readonly phase: 'review', readonly speechSeconds: number }
    | VoiceEnrollmentSnapshot

/**
 * Runs voiceprint enrollments from the speech input of this window, and adds each voiceprint to the saved ones.
 *
 * The enrollment belongs to the calling component. When the component unmounts, the enrollment ends and saves nothing.
 * While it records, it holds a capture lease, so the voice host in another window begins no input and records no
 * voice message. When the window closes, the lease ends by itself.
 */
export function useVoiceEnrollment() {
  const devices = useSettingsAudioDevice()
  const voiceprints = useVoiceprintStore()
  const state = shallowRef<VoiceEnrollmentState>({ phase: 'idle' })
  const busy = computed(() => state.value.phase === 'recording' || state.value.phase === 'enrolling' || state.value.phase === 'review')
  let enrollment: VoiceEnrollment | undefined
  /** Resolves the review of the current enrollment: true keeps the voiceprint. */
  let decide: ((keep: boolean) => void) | undefined

  /** Starts recording. Returns false while an enrollment records, enrolls, or waits for a review. */
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
        // Compare with every usable voiceprint, also the disabled ones: each one is a voice that the user enrolled.
        const similarity = closestSimilarity(voiceprint, voiceprints.usable.map(item => item.voiceprint))
        if (similarity !== undefined && similarity < SAME_SPEAKER_SIMILARITY && !await review(signal))
          return
        if (!voiceprints.add(voiceprint, startedAt))
          throw new Error('The voiceprints were deleted during the enrollment')
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

    /**
     * Waits for the user to keep or discard the voiceprint. A discard cancels the enrollment, so it settles as
     * `cancelled` and saves nothing. A cancel during the review aborts `signal`, and the enrollment settles the same way.
     */
    function review(signal: AbortSignal): Promise<boolean> {
      const decision = Promise.withResolvers<boolean>()
      decide = decision.resolve
      state.value = { phase: 'review', speechSeconds: current.snapshot.speechSeconds }
      const onAbort = () => decision.reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      return decision.promise.then((keep) => {
        if (keep)
          state.value = current.snapshot
        else
          current.cancel()
        return keep
      }).finally(() => {
        decide = undefined
        signal.removeEventListener('abort', onAbort)
      })
    }

    return true
  }

  /** Ends the recording. The recorded speech then enrolls. */
  function finish(): boolean {
    if (!enrollment || state.value.phase !== 'recording')
      return false
    enrollment.finish()
    return true
  }

  /** Stops the recording, the voiceprint computation, or the review without a change to the saved voiceprints. */
  function cancel(): boolean {
    if (!enrollment || !busy.value)
      return false
    enrollment.cancel()
    return true
  }

  /** Saves the voiceprint that waits for a review. */
  function keep(): boolean {
    if (!decide)
      return false
    decide(true)
    return true
  }

  /** Drops the voiceprint that waits for a review. The enrollment settles as `cancelled`. */
  function discard(): boolean {
    if (!decide)
      return false
    decide(false)
    return true
  }

  onScopeDispose(() => {
    enrollment?.cancel()
  })

  return { state, busy, begin, finish, cancel, keep, discard }
}
