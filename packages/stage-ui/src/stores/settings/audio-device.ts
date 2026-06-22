import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { useAudioDevice } from '../../composables/audio'

let microphonePermissionStatus: PermissionStatus

export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const { audioInputs, deviceConstraints, selectedAudioInput: selectedAudioInputNonPersist, startStream, stopStream, stream, askPermission } = useAudioDevice()

  const selectedAudioInputPersist = useLocalStorageManualReset<string>('settings/audio/input', selectedAudioInputNonPersist.value)
  const audioInputEnabled = useLocalStorageManualReset<boolean>('settings/audio/input/enabled', false)

  watch(selectedAudioInputPersist, (newValue) => {
    selectedAudioInputNonPersist.value = newValue
  })

  watch(audioInputEnabled, (val) => {
    if (val) {
      startStream()
    }
    else {
      stopStream()
    }
  })

  // Self-heal a stale/empty persisted device selection.
  //
  // Browsers and Electron can rotate non-"default" deviceIds across sessions, so a previously saved id
  // may no longer match any enumerated device — leaving the picker stuck on the "Select microphone"
  // placeholder and forcing the user to re-pick every launch. Once devices are *really* enumerated
  // (a label is present, i.e. permission was granted), ensure the selection points at a live device,
  // preferring the system "default" so a specific choice is only needed when the user wants one.
  watch(audioInputs, (inputs) => {
    const usable = inputs.filter(device => device.deviceId)
    if (usable.length === 0 || !usable.some(device => device.label))
      return

    const current = selectedAudioInputPersist.value
    if (current && usable.some(device => device.deviceId === current))
      return

    selectedAudioInputPersist.value = usable.find(device => device.deviceId === 'default')?.deviceId || usable[0].deviceId
  }, { immediate: true })

  // permissionGranted from vueuse does not track revocation yet.
  // implement it manually.
  try {
    navigator?.permissions?.query({ name: 'microphone' }).then((status) => {
      microphonePermissionStatus = status // existing one cleaned up by GC
      status.onchange = () => {
        if (status.state === 'denied' || status.state === 'prompt')
          audioInputEnabled.value = false
      }
    })
  }
  catch (e) { console.info(`Unable to track microphone permission: ${e}`) }
  void microphonePermissionStatus // suppress unused variable lint
  function initialize() {
    const hasSelectedInput = selectedAudioInputPersist.value
      && audioInputs.value.some(device => device.deviceId === selectedAudioInputPersist.value)

    if (audioInputEnabled.value && hasSelectedInput) {
      startStream()
    }
    if (selectedAudioInputNonPersist.value && !audioInputEnabled.value) {
      selectedAudioInputPersist.value = selectedAudioInputNonPersist.value
    }
  }

  function resetState() {
    selectedAudioInputPersist.reset()
    selectedAudioInputNonPersist.value = ''
    audioInputEnabled.reset()
    stopStream()
  }

  return {
    audioInputs,
    deviceConstraints,
    selectedAudioInput: selectedAudioInputPersist,
    enabled: audioInputEnabled,

    stream,

    initialize,

    askPermission,
    startStream,
    stopStream,
    resetState,
  }
})
