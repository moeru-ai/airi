import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { useAudioDevice } from '../../composables/audio'

let microphonePermissionStatus: PermissionStatus

export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const {
    audioInputs,
    deviceConstraints,
    selectedAudioInput: selectedAudioInputNonPersist,
    startStream: startAudioInputStream,
    stopStream: stopAudioInputStream,
    stream,
    askPermission: askAudioInputPermission,
  } = useAudioDevice()

  const selectedAudioInputPersist = useLocalStorageManualReset<string>('settings/audio/input', selectedAudioInputNonPersist.value)
  const audioInputEnabled = useLocalStorageManualReset<boolean>('settings/audio/input/enabled', false)
  let audioInputStartGeneration = 0

  function syncSelectedAudioInputFromRuntime() {
    if (selectedAudioInputPersist.value !== selectedAudioInputNonPersist.value)
      selectedAudioInputPersist.value = selectedAudioInputNonPersist.value
  }

  function syncSelectedAudioInputToRuntime() {
    if (selectedAudioInputPersist.value && selectedAudioInputPersist.value !== selectedAudioInputNonPersist.value)
      selectedAudioInputNonPersist.value = selectedAudioInputPersist.value
  }

  async function askPermission() {
    syncSelectedAudioInputToRuntime()
    await askAudioInputPermission()
    syncSelectedAudioInputFromRuntime()
  }

  function createAudioInputStartGeneration() {
    audioInputStartGeneration += 1
    return audioInputStartGeneration
  }

  function invalidateAudioInputStarts() {
    audioInputStartGeneration += 1
  }

  async function startStreamForGeneration(generation: number) {
    syncSelectedAudioInputToRuntime()
    await startAudioInputStream()

    if (generation === audioInputStartGeneration)
      syncSelectedAudioInputFromRuntime()
  }

  async function startStream() {
    await startStreamForGeneration(createAudioInputStartGeneration())
  }

  function stopStream() {
    invalidateAudioInputStarts()
    stopAudioInputStream()
  }

  function handleStartStreamError(generation: number, error: unknown, message: string) {
    console.error(message, error)

    if (generation === audioInputStartGeneration)
      audioInputEnabled.value = false
  }

  watch(selectedAudioInputPersist, (newValue) => {
    selectedAudioInputNonPersist.value = newValue
  })

  watch(audioInputEnabled, (val) => {
    if (val) {
      const generation = createAudioInputStartGeneration()
      startStreamForGeneration(generation).catch((error) => {
        handleStartStreamError(generation, error, 'Unable to start audio input stream:')
      })
    }
    else {
      stopStream()
    }
  })

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

    if (hasSelectedInput)
      syncSelectedAudioInputToRuntime()

    if (audioInputEnabled.value && hasSelectedInput) {
      const generation = createAudioInputStartGeneration()
      startStreamForGeneration(generation).catch((error) => {
        handleStartStreamError(generation, error, 'Unable to initialize audio input stream:')
      })
    }
    else if (selectedAudioInputPersist.value && audioInputs.value.length > 0 && !hasSelectedInput) {
      selectedAudioInputPersist.value = selectedAudioInputNonPersist.value
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
