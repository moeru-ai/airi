import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'

import { useAudioDevice } from '../../composables/audio'
import { listensContinuously, useHearingStore } from '../modules/hearing'

function isAbort(cause: unknown) {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/**
 * Stores microphone preferences and keeps the selected microphone open while it is enabled.
 *
 * Two persisted preferences control the microphone:
 * - `off` is the microphone switch. While `off` is true, no feature in AIRI can open the microphone. Setting it to
 *   true ends every open capture at once. Controls then show the microphone as off and do not start a recording.
 * - `enabled` is the listening preference. It has effect only while `off` is false. Then the Hearing input mode
 *   controls when AIRI listens. `listening` combines the two.
 *
 * `input` is the shared input for the selected device. Consumers subscribe with their own signal.
 * `unprocessedInput` is the same device without browser processing. Only keyword spotting subscribes to it, so the
 * preference does not hold it open.
 * While AIRI listens, the store holds one extra subscription, so later consumers start without waiting for permission.
 * A Hearing input mode that does not listen continuously, such as Push to Talk, skips that subscription.
 * Then the microphone opens only while a speech input or a voice message uses it.
 */
export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const selectedAudioInput = useLocalStorageManualReset<string>('settings/audio/input', '')
  const enabled = useLocalStorageManualReset<boolean>('settings/audio/input/enabled', false)
  const off = useLocalStorageManualReset<boolean>('settings/audio/input/off', false)
  const device = useAudioDevice(selectedAudioInput, { off })
  const hearing = useHearingStore()
  const error = ref<string>()
  let permissionStatus: PermissionStatus | undefined
  let disposed = false
  let initialized = false
  let holding: AbortController | undefined
  /** True while AIRI listens in the Hearing input mode: the microphone is on and the listening preference is on. */
  const listening = computed(() => enabled.value && !off.value)
  /**
   * True while the preference keeps the microphone open in the window that initialized this store.
   * Each window computes it from the same persisted settings. A level meter observes the input only while this is
   * true, so a meter alone never opens the microphone.
   */
  const heldOpen = computed(() => listening.value && listensContinuously(hearing.inputMode))

  /** Holds the current input open. A failure other than release turns the preference off. */
  function hold() {
    holding?.abort('Microphone hold replaced')
    if (!heldOpen.value || !initialized)
      return

    const current = new AbortController()
    holding = current
    error.value = undefined
    void device.input.value.subscribe({ signal: current.signal }).pipeTo(new WritableStream()).catch((cause) => {
      if (holding !== current || current.signal.aborted || isAbort(cause))
        return
      error.value = errorMessageFrom(cause) || 'Could not start the microphone'
      enabled.value = false
    })
  }

  watch([heldOpen, device.input], hold, { flush: 'sync' })

  function initialize() {
    if (initialized || disposed)
      return
    initialized = true
    hold()
    void navigator.permissions?.query({ name: 'microphone' }).then((status) => {
      if (disposed)
        return
      permissionStatus = status
      status.onchange = () => {
        if (status.state !== 'granted')
          enabled.value = false
      }
    }).catch(() => {})
  }

  /**
   * Requests microphone access and reports whether it succeeded.
   *
   * Denial is an expected user choice, so it never rejects. The reason stays in `error`.
   * Controls call this from watchers, where a rejection would reach the app error boundary.
   */
  async function askPermission(): Promise<boolean> {
    error.value = undefined
    try {
      await device.askPermission()
      return true
    }
    catch (cause) {
      if (!isAbort(cause))
        error.value = errorMessageFrom(cause) || 'Could not start the microphone'
      return false
    }
  }

  function resetState() {
    error.value = undefined
    selectedAudioInput.reset()
    enabled.reset()
    off.reset()
  }

  onScopeDispose(() => {
    disposed = true
    holding?.abort('Microphone settings disposed')
    if (permissionStatus)
      permissionStatus.onchange = null
  })

  return {
    error,
    enabled,
    off,
    listening,
    heldOpen,
    selectedAudioInput,
    audioInputs: device.audioInputs,
    audioInputOptions: device.audioInputOptions,
    deviceConstraints: device.deviceConstraints,
    permissionGranted: device.permissionGranted,
    permission: device.permission,
    stream: device.stream,
    input: device.input,
    unprocessedInput: device.unprocessedInput,
    source: device.source,
    askPermission,
    initialize,
    resetState,
  }
})
