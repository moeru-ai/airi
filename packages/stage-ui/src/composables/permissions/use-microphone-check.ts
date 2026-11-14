import type { MaybeRefOrGetter } from 'vue'

import { observeLevel } from '@proj-airi/pipelines-audio'
import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { useSettingsAudioDevice } from '../../stores/settings/audio-device'

/** A level above this value counts as speech. The levels map -60 dBFS to 0 and full scale to 1, so this is about -27 dBFS. */
const SPEECH_LEVEL = 0.55
/** Speech must last this many 50 ms windows in total. A single click or bump does not count. */
const SPEECH_WINDOWS = 6
/** Windows without speech before the page suggests a check, about 3 seconds. */
const QUIET_WINDOWS = 60

/**
 * Listens to the selected microphone until it hears speech.
 *
 * It opens the microphone only while `active` is true, for example after the user allows access.
 * `level` is smoothed for display: it rises fast and falls slowly, so it follows speech without flicker.
 * `heard` stays true after speech, so a pause does not hide the result. It resets when `active` turns false.
 */
export function useMicrophoneCheck(active: MaybeRefOrGetter<boolean>) {
  const audioDevice = useSettingsAudioDevice()
  /** The smoothed level, from 0 to 1. */
  const level = shallowRef(0)
  const heard = shallowRef(false)
  /** True after a few seconds without speech, so the page can suggest a check of mute or the input. */
  const quiet = shallowRef(false)
  let meter: AbortController | undefined

  function stop() {
    meter?.abort('Microphone check stopped')
    meter = undefined
    level.value = 0
  }

  function start() {
    stop()
    const controller = new AbortController()
    meter = controller
    let speechWindows = 0
    let windows = 0
    observeLevel(audioDevice.input, controller.signal, (next) => {
      const rate = next > level.value ? 0.55 : 0.12
      level.value += (next - level.value) * rate
      windows += 1
      if (next > SPEECH_LEVEL)
        speechWindows += 1
      if (speechWindows >= SPEECH_WINDOWS) {
        heard.value = true
        quiet.value = false
        stop()
        return
      }
      quiet.value = windows > QUIET_WINDOWS && speechWindows === 0
    })
  }

  watch([() => toValue(active), () => audioDevice.input], ([isActive]) => {
    if (!isActive) {
      heard.value = false
      quiet.value = false
      stop()
      return
    }
    // A new input device starts a new check, so a working device does not hide a broken one.
    heard.value = false
    quiet.value = false
    start()
  }, { immediate: true })
  onScopeDispose(stop)

  return { level, heard, quiet }
}
