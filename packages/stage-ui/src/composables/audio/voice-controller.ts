import type { SpeechInputAttemptState, TranscriptDocument, VoiceControllerOptions } from '@proj-airi/core-agent'

import { errorMessageFrom } from '@moeru/std'
import { VoiceController } from '@proj-airi/core-agent'
import { markRaw, onScopeDispose, shallowRef, watch } from 'vue'

import { useRealtimeAudioStore } from '../../stores/realtime-audio'
import { useSettingsAudioDevice } from '../../stores/settings/audio-device'

/**
 * Binds controller observations to Vue.
 *
 * The controller subscribes to the selected microphone input, or to the endpoint of a realtime call that this
 * device hosts. A change of the input moves future inputs and
 * plugin observations to the new input, and the old device closes once nothing subscribes to it.
 * The playback of the speech is a Web Audio graph, so output plugins can connect `AudioNode` consumers to it.
 */
export function useVoiceController(options: Omit<VoiceControllerOptions<AudioNode>, 'audio'>) {
  const devices = useSettingsAudioDevice()
  const state = shallowRef<SpeechInputAttemptState>()
  const snapshot = shallowRef<TranscriptDocument>()
  const error = shallowRef<string>()
  let inputId: string | undefined
  let stopState: (() => void) | undefined
  const realtimeAudio = useRealtimeAudioStore()
  // A realtime call that this device hosts replaces the microphone with the audio of the endpoint.
  const selectedInput = () => realtimeAudio.input ?? devices.input
  const controller = markRaw(new VoiceController<AudioNode>({ ...options, audio: selectedInput() }))
  watch(selectedInput, input => controller.replaceAudio(input), { flush: 'sync' })

  controller.onInput((attempt) => {
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

  // Each document version reaches the view. A document of a replaced input is ignored.
  controller.use({ name: 'vue-snapshot', setup(scope) {
    scope.onInput((input) => {
      input.watch((document) => {
        if (document.inputId === inputId)
          snapshot.value = document
      })
    })
    return undefined
  } })

  onScopeDispose(() => {
    stopState?.()
    void controller.close().catch(cause => console.error('Voice controller cleanup failed', cause))
  })

  return { controller, state, snapshot, error }
}
