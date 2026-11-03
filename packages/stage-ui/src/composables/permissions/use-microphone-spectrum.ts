import type { MaybeRefOrGetter } from 'vue'

import { observeSpectrum, voiceBands } from '@proj-airi/pipelines-audio'
import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { useSettingsAudioDevice } from '../../stores/settings/audio-device'

/**
 * Follows the voice bands of the selected microphone while `active` is true, for a visual.
 *
 * The levels are the raw band levels of `observeSpectrum`. The visual eases between them. They are 0 while the microphone
 * is not active.
 */
export function useMicrophoneSpectrum(active: MaybeRefOrGetter<boolean>) {
  const audioDevice = useSettingsAudioDevice()
  /** One level for each band of `voiceBands`, from the lowest band to the highest. */
  const bands = shallowRef<number[]>(voiceBands.map(() => 0))
  let meter: AbortController | undefined

  function stop() {
    meter?.abort('Microphone spectrum stopped')
    meter = undefined
    bands.value = voiceBands.map(() => 0)
  }

  function start() {
    stop()
    const controller = new AbortController()
    meter = controller
    observeSpectrum(audioDevice.input, controller.signal, (levels) => {
      bands.value = levels
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
