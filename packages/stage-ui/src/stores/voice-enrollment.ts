import type { VoiceEnrollmentState } from '../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, shallowRef } from 'vue'

import { computeVoiceprint } from '../libs/voice/speaker-model'
import { VoiceEnrollment } from '../libs/voice/voice-enrollment'
import { getSpeechBusContext, voiceEnrollmentChanged, voiceEnrollmentCommand, voiceRequestEnrollment } from '../services/speech/bus'
import { SileroVad } from '../workers/vad/silero-vad'
import { useSettingsAudioDevice } from './settings/audio-device'
import { useVoiceprintStore } from './voiceprint'

/**
 * Runs one voiceprint enrollment from the window's speech input, and saves the voiceprint.
 *
 * The voice host calls `connect`, so other windows control the enrollment through the speech bus, and the host
 * pauses its automatic speech input while `isRecording` is true. A window without a connected voice host,
 * such as the stage-web settings page, calls `begin`, `finish`, and `cancel` directly. No other code in that
 * window listens to the microphone then.
 */
export const useVoiceEnrollmentStore = defineStore('voice-enrollment', () => {
  const devices = useSettingsAudioDevice()
  const voiceprints = useVoiceprintStore()
  const state = shallowRef<VoiceEnrollmentState>({ phase: 'idle' })
  const isRecording = computed(() => state.value.phase === 'recording')
  let enrollment: VoiceEnrollment | undefined
  let connected = false

  function publish() {
    if (connected)
      getSpeechBusContext().emit(voiceEnrollmentChanged, state.value)
  }

  /** Starts recording. Returns false while another enrollment records or enrolls. */
  function begin(): boolean {
    if (state.value.phase === 'recording' || state.value.phase === 'enrolling')
      return false

    const vad = new SileroVad()
    const current = new VoiceEnrollment(devices.input, {
      detect: (window, signal) => vad.score(window, signal),
      enroll: async (speech, sampleRate, signal) => {
        const voiceprint = await computeVoiceprint(speech, sampleRate, signal)
        signal.throwIfAborted()
        voiceprints.save(voiceprint)
      },
    })
    enrollment = current
    const stop = current.subscribe(() => {
      state.value = current.snapshot
      publish()
    })
    void current.done.finally(() => {
      stop()
      void vad.close()
      if (enrollment === current)
        enrollment = undefined
    })
    state.value = current.snapshot
    publish()
    return true
  }

  function finish(): boolean {
    if (!enrollment || state.value.phase !== 'recording')
      return false
    enrollment.finish()
    return true
  }

  function cancel(): boolean {
    if (!enrollment)
      return false
    enrollment.cancel()
    return true
  }

  /** Serves the enrollment commands of other windows. The returned function disconnects and cancels the enrollment. */
  function connect() {
    const context = getSpeechBusContext()
    connected = true
    const stops = [
      context.on(voiceRequestEnrollment, publish),
      defineInvokeHandler(context, voiceEnrollmentCommand, async (command) => {
        const accepted = command.type === 'begin' ? begin() : command.type === 'finish' ? finish() : cancel()
        return { status: accepted ? 'accepted' : 'closed' }
      }),
    ]
    publish()
    return () => {
      stops.forEach(stop => stop())
      cancel()
      connected = false
    }
  }

  onScopeDispose(() => {
    enrollment?.cancel()
  })

  return { state, isRecording, begin, finish, cancel, connect }
})
