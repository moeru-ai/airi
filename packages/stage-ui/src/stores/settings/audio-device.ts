import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useAudioDevice } from '../../composables/audio'

/** Automatic capture is separate from manual recording, which owns its microphone. */
export type HearingInputMode = 'off' | 'push-to-talk' | 'always' | 'wake-word'

let microphonePermissionStatus: PermissionStatus

export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const {
    audioInputs,
    audioInputOptions,
    deviceConstraints,
    permissionGranted,
    selectedAudioInput: selectedAudioInputNonPersist,
    startStream: startAudioInputStream,
    stopStream: stopAudioInputStream,
    stream,
    askPermission: askAudioInputPermission,
  } = useAudioDevice()

  const selectedAudioInputPersist = useLocalStorageManualReset<string>('settings/audio/input', selectedAudioInputNonPersist.value)
  const audioInputEnabled = useLocalStorageManualReset<boolean>('settings/audio/input/enabled', false)
  // Retain device failures after input is disabled so the Stage can explain them.
  const error = ref<string>()
  const mode = useLocalStorageManualReset<HearingInputMode>('settings/audio/input/mode', 'always')
  const wakeWordSetupPrompted = useLocalStorageManualReset('settings/audio/input/wake-setup-prompted', false, { flush: 'sync' })
  const continuousInputEnabled = computed(() => audioInputEnabled.value && (mode.value === 'always' || mode.value === 'wake-word'))
  let audioInputStartGeneration = 0
  let audioInputStart: ReturnType<typeof startAudioInputStream> | undefined
  let stopPendingAudioInput = false

  /** Only the active foreground hearing runtime claims this persisted setup request. */
  function claimWakeWordSetupPrompt() {
    if (mode.value !== 'wake-word' || wakeWordSetupPrompted.value)
      return false
    wakeWordSetupPrompted.value = true
    return true
  }

  /** Allows another setup request after configured words become unavailable again. */
  function resetWakeWordSetupPrompt() {
    wakeWordSetupPrompted.value = false
  }

  watch(mode, (nextMode) => {
    if (nextMode !== 'wake-word')
      resetWakeWordSetupPrompt()
  }, { flush: 'sync' })

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
    error.value = undefined
    try {
      await askAudioInputPermission()
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Could not access the microphone'
      throw cause
    }
    syncSelectedAudioInputFromRuntime()
  }

  function createAudioInputStartGeneration() {
    audioInputStartGeneration += 1
    return audioInputStartGeneration
  }

  function invalidateAudioInputStarts() {
    audioInputStartGeneration += 1
  }

  /** Reuses the active browser request so concurrent consumers cannot allocate duplicate streams. */
  function getOrStartAudioInputStream() {
    if (audioInputStart)
      return audioInputStart

    const currentStart = startAudioInputStream()
    audioInputStart = currentStart
    const clearCurrentStart = () => {
      if (audioInputStart === currentStart)
        audioInputStart = undefined
    }
    void currentStart.then(clearCurrentStart, clearCurrentStart)
    return currentStart
  }

  async function startStreamForGeneration(generation: number) {
    stopPendingAudioInput = false
    syncSelectedAudioInputToRuntime()
    error.value = undefined
    try {
      await getOrStartAudioInputStream()
    }
    catch (cause) {
      if (generation === audioInputStartGeneration)
        error.value = errorMessageFrom(cause) ?? 'Could not start the microphone'
      throw cause
    }

    if (stopPendingAudioInput) {
      stopAudioInputStream()
      return
    }

    if (generation === audioInputStartGeneration)
      syncSelectedAudioInputFromRuntime()
  }

  async function startStream() {
    await startStreamForGeneration(createAudioInputStartGeneration())
  }

  function stopStream() {
    invalidateAudioInputStarts()
    stopPendingAudioInput = true
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

  watch(continuousInputEnabled, (val) => {
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

    if (continuousInputEnabled.value) {
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
    error.value = undefined
    selectedAudioInputPersist.reset()
    selectedAudioInputNonPersist.value = ''
    audioInputEnabled.reset()
    mode.value = 'off'
    resetWakeWordSetupPrompt()
    stopStream()
  }

  return {
    error,
    audioInputs,
    audioInputOptions,
    deviceConstraints,
    permissionGranted,
    selectedAudioInput: selectedAudioInputPersist,
    enabled: audioInputEnabled,
    mode,
    continuousInputEnabled,
    claimWakeWordSetupPrompt,
    resetWakeWordSetupPrompt,

    stream,

    initialize,

    askPermission,
    startStream,
    stopStream,
    resetState,
  }
})
