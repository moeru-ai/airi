import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { onScopeDispose, ref, watch } from 'vue'

import { useAudioDevice } from '../../composables/audio'

/** Stores microphone preferences. The browser adapter owns permission and source lifecycles. */
export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const device = useAudioDevice()
  const selectedAudioInput = useLocalStorageManualReset<string>('settings/audio/input', '')
  const enabled = useLocalStorageManualReset<boolean>('settings/audio/input/enabled', false)
  const error = ref<string>()
  let permissionStatus: PermissionStatus | undefined
  let disposed = false
  let initialized = false
  let enabledInput: ReturnType<typeof device.acquireInput> | undefined

  watch(selectedAudioInput, (id, previous) => {
    device.selectedAudioInput.value = id
    if (previous === undefined || !enabled.value)
      return
    const replaced = enabledInput
    enabledInput = undefined
    void replaced?.release()
    startEnabledInput()
  }, { immediate: true, flush: 'sync' })

  async function borrowInput() {
    error.value = undefined
    try {
      return await device.borrowInput()
    }
    catch (cause) {
      if (!(cause instanceof DOMException) || cause.name !== 'AbortError')
        error.value = errorMessageFrom(cause) ?? 'Could not start the microphone'
      throw cause
    }
  }

  async function askPermission() {
    await device.askPermission()
  }

  function close() {
    return device.close()
  }

  function startEnabledInput() {
    error.value = undefined
    enabledInput ??= device.acquireInput()
    const current = enabledInput
    void current.input.catch((cause) => {
      if (enabledInput === current && (!(cause instanceof DOMException) || cause.name !== 'AbortError')) {
        error.value = errorMessageFrom(cause) ?? 'Could not start the microphone'
        enabled.value = false
      }
    })
  }

  watch(enabled, (value) => {
    if (value) {
      startEnabledInput()
    }
    else {
      const previous = enabledInput
      enabledInput = undefined
      void previous?.release()
    }
  }, { flush: 'sync' })

  function initialize() {
    if (initialized || disposed)
      return
    initialized = true
    if (enabled.value)
      startEnabledInput()
    void navigator.permissions?.query({ name: 'microphone' }).then((status) => {
      if (disposed)
        return
      permissionStatus = status
      status.onchange = () => {
        if (status.state !== 'granted') {
          enabled.value = false
          void close()
        }
      }
    }).catch(() => {})
  }

  function resetState() {
    error.value = undefined
    selectedAudioInput.reset()
    enabled.reset()
    void close()
  }

  onScopeDispose(() => {
    disposed = true
    if (permissionStatus)
      permissionStatus.onchange = null
    void close()
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
    connection: device.connection,
    acquireInput: device.acquireInput,
    borrowInput,
    askPermission,
    initialize,
    resetState,
  }
})
