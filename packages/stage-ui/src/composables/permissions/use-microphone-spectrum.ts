import type { MaybeRefOrGetter } from 'vue'

import { observeSpectrum, SPECTRUM_HOP_MS, voiceBands } from '@proj-airi/pipelines-audio'
import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { VoiceBandGate } from '../../libs/voice/band-gate'
import { useSettingsAudioDevice } from '../../stores/settings/audio-device'

/**
 * Follows the voice bands of the selected microphone while `active` is true, for a visual.
 *
 * Each band passes a `VoiceBandGate`, so the levels say how much a voice stands out from the background noise of that
 * band. Steady noise reads 0. The visual eases between the levels. They are 0 while the microphone is not active.
 */
export function useMicrophoneSpectrum(active: MaybeRefOrGetter<boolean>) {
  const audioDevice = useSettingsAudioDevice()
  /** One level for each band of `voiceBands`, from the lowest band to the highest, from 0 to 1. */
  const bands = shallowRef<number[]>(voiceBands.map(() => 0))
  let meter: AbortController | undefined
  const gates = voiceBands.map(() => new VoiceBandGate())

  function stop() {
    meter?.abort('Microphone spectrum stopped')
    meter = undefined
    bands.value = voiceBands.map(() => 0)
  }

  function start() {
    stop()
    const controller = new AbortController()
    meter = controller
    // A new start can be a new device, with its own background noise.
    gates.forEach(gate => gate.reset())
    observeSpectrum(audioDevice.input, controller.signal, (levels) => {
      // Each update is one hop of audio, so the floors follow the audio time.
      bands.value = gates.map((gate, index) => gate.update(levels[index] ?? 0, SPECTRUM_HOP_MS / 1000))
    })
  }

  watch([() => toValue(active), () => audioDevice.input], ([isActive]) => {
    if (isActive)
      start()
    else
      stop()
  }, { immediate: true })
  onScopeDispose(stop)

  return { bands }
}
