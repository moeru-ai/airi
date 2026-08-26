import { errorMessageFrom } from '@moeru/std'
import {
  listenBeatSyncAudioOutput,
  listenBeatSyncStateChange,
  setBeatSyncConsumer,
  updateBeatSyncLipSyncOptions,
} from '@proj-airi/stage-shared/beat-sync'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Exposes the shared desktop system-audio feed owned by the Beat Sync renderer. */
export const useSystemAudioInputStore = defineStore('system-audio-input', () => {
  const isActive = shallowRef(false)
  const isRequested = shallowRef(false)
  const isStarting = shallowRef(false)
  const error = shallowRef<string>()
  const inputLevel = shallowRef(0)
  const inputVolumeThreshold = shallowRef(0.08)
  const mouthOpen = shallowRef(0)
  const randomCloseDelayMs = shallowRef(300)
  const randomCloseProbability = shallowRef(1)
  listenBeatSyncStateChange(state => isActive.value = state.isActive)
  listenBeatSyncAudioOutput((output) => {
    inputLevel.value = output.inputLevel
    mouthOpen.value = output.mouthOpen
  })

  /** Requests the shared capture owner for the Live2D lipsync consumer. */
  async function start(): Promise<void> {
    if (isStarting.value)
      throw new Error('System audio input is already starting')

    isStarting.value = true
    error.value = undefined
    try {
      await updateLipSyncOptions()
      await setBeatSyncConsumer('live2d-lipsync', true)
      isRequested.value = true
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to start system audio input'
      stop()
      throw cause
    }
    finally {
      isStarting.value = false
    }
  }

  /** Releases the Live2D consumer without stopping other capture consumers. */
  function stop(): void {
    isRequested.value = false
    void setBeatSyncConsumer('live2d-lipsync', false)
  }

  async function updateLipSyncOptions(): Promise<void> {
    await updateBeatSyncLipSyncOptions({
      inputVolumeThreshold: inputVolumeThreshold.value,
      randomCloseDelayMs: randomCloseDelayMs.value,
      randomCloseProbability: randomCloseProbability.value,
    })
  }

  return {
    isActive,
    isRequested,
    isStarting,
    error,
    inputLevel,
    inputVolumeThreshold,
    mouthOpen,
    randomCloseDelayMs,
    randomCloseProbability,
    start,
    stop,
    updateLipSyncOptions,
  }
})
