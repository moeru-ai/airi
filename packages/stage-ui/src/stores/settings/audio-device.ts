import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { onScopeDispose, ref, watch } from 'vue'

import { useAudioDevice } from '../../composables/audio'

function isAbort(cause: unknown) {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/**
 * Stores microphone preferences and keeps the selected microphone open while it is enabled.
 *
 * `input` is the shared input for the selected device. Consumers subscribe with their own signal.
 * The enabled preference holds one extra subscription, so later consumers start without waiting for permission.
 */
export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const device = useAudioDevice()
  const selectedAudioInput = useLocalStorageManualReset<string>('settings/audio/input', '')
  const enabled = useLocalStorageManualReset<boolean>('settings/audio/input/enabled', false)
  const error = ref<string>()
  let permissionStatus: PermissionStatus | undefined
  let disposed = false
  let initialized = false
  let holding: AbortController | undefined

  /** Holds the current input open. A failure other than release turns the preference off. */
  function hold() {
    holding?.abort('Microphone hold replaced')
    if (!enabled.value || !initialized)
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

  watch(selectedAudioInput, id => void (device.selectedAudioInput.value = id), { immediate: true, flush: 'sync' })
  watch([enabled, device.input], hold, { flush: 'sync' })

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

  async function askPermission() {
    error.value = undefined
    try {
      await device.askPermission()
    }
    catch (cause) {
      if (!isAbort(cause))
        error.value = errorMessageFrom(cause) || 'Could not start the microphone'
      throw cause
    }
  }

  function resetState() {
    error.value = undefined
    selectedAudioInput.reset()
    enabled.reset()
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
    selectedAudioInput,
    audioInputs: device.audioInputs,
    audioInputOptions: device.audioInputOptions,
    deviceConstraints: device.deviceConstraints,
    permissionGranted: device.permissionGranted,
    stream: device.stream,
    input: device.input,
    source: device.source,
    askPermission,
    initialize,
    resetState,
  }
})
