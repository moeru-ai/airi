import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { useAudioDevice } from '../../composables/audio'

// eslint-disable-next-line complexity
export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const {
    audioInputs,
    deviceConstraints,
    selectedAudioInput: selectedAudioInputNonPersist,
    startStream,
    stopStream,
    stream,
    askPermission,
  } = useAudioDevice()

  const selectedAudioInputPersist = useLocalStorageManualReset<string>(
    'settings/audio/input',
    selectedAudioInputNonPersist.value,
  )
  const audioInputEnabled = useLocalStorageManualReset<boolean>('settings/audio/input/enabled', false)

  watch(selectedAudioInputPersist, (newValue) => {
    selectedAudioInputNonPersist.value = newValue
  })

  watch(audioInputEnabled, (val) => {
    if (val) {
      startStream()
    } else {
      stopStream()
    }
  })

  // permissionGranted from vueuse does not track revocation yet.
  // implement it manually.
  try {
    void navigator?.permissions?.query({ name: 'microphone' }).then((status) => {
      status.onchange = () => {
        if (status.state === 'denied' || status.state === 'prompt') audioInputEnabled.value = false
      }
    })
  } catch (e) {
    console.info(`Unable to track microphone permission: ${e}`)
  }
  function initialize() {
    const hasSelectedInput =
      selectedAudioInputPersist.value &&
      audioInputs.value.some((device) => device.deviceId === selectedAudioInputPersist.value)

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
