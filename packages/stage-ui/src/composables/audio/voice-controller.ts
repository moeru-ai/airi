import type { SpeechInputAttemptState, SpeechSnapshot, VoiceControllerOptions } from '@proj-airi/core-agent'

import { errorMessageFrom } from '@moeru/std'
import { VoiceController } from '@proj-airi/core-agent'
import { storeToRefs } from 'pinia'
import { markRaw, onScopeDispose, shallowRef, watch } from 'vue'

import { useSettingsAudioDevice } from '../../stores/settings/audio-device'

/** Binds controller observations to Vue. The shared device store keeps microphone ownership. */
export function useVoiceController(options: Omit<VoiceControllerOptions, 'audio' | 'audioOwnership'>) {
  const devices = useSettingsAudioDevice()
  const { connection } = storeToRefs(devices)
  const state = shallowRef<SpeechInputAttemptState>()
  const snapshot = shallowRef<SpeechSnapshot>()
  const error = shallowRef<string>()
  let inputId: string | undefined
  let stopState: (() => void) | undefined
  const controller = markRaw(new VoiceController({ ...options, audio: () => devices.borrowInput(), audioOwnership: 'borrowed' }))
  controller.onInput((attempt) => {
    const audio = devices.acquireInput()
    void audio.input.catch((cause) => {
      if (inputId === attempt.id && (!(cause instanceof DOMException) || cause.name !== 'AbortError'))
        error.value = errorMessageFrom(cause) ?? 'Microphone startup failed'
    })
    void attempt.done.then(() => audio.release()).catch(cause => console.error('Input microphone release failed', cause))
    inputId = attempt.id
    error.value = undefined
    snapshot.value = undefined
    stopState?.()
    stopState = attempt.subscribe((next) => {
      state.value = next
      if (next.phase === 'settled' && next.outcome.status === 'failed')
        error.value = errorMessageFrom(next.outcome.error)
    })
  })
  controller.use({ name: 'vue-snapshot', setup(scope) {
    scope.onSpeechInput((input) => {
      input.subscribe({ transcript: 'corrected', speakers: true, scheduling: 'latest' }, async (ctx) => {
        if (ctx.snapshot.inputId === inputId)
          snapshot.value = ctx.snapshot
      })
      return undefined
    })
    return undefined
  } })
  watch(connection, (audio, previous) => {
    if (audio === previous || !previous)
      return
    void controller.replaceAudio(() => devices.borrowInput()).catch((cause) => {
      error.value = errorMessageFrom(cause) ?? 'Audio source replacement failed'
    })
  }, { flush: 'sync' })
  onScopeDispose(() => {
    stopState?.()
    void controller.close().catch(cause => console.error('Voice controller cleanup failed', cause))
  })
  return { controller, state, snapshot, error }
}
