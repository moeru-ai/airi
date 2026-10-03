import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** User-configurable shaping applied to Live2D lipsync from system audio. */
export interface SystemAudioLipSyncOptions {
  /**
   * Minimum normalized input level that can drive mouth movement.
   * @default 0.08
   */
  inputVolumeThreshold: number
  /**
   * Maximum delay before an eligible short mouth closure, in milliseconds.
   * @default 300
   */
  randomCloseDelayMs: number
  /**
   * Chance from 0 to 1 that an eligible short mouth closure runs.
   * @default 1
   */
  randomCloseProbability: number
}

/** One visualization and motion-control sample produced from system audio. */
export interface SystemAudioLipSyncOutput {
  /** Peak frequency-bin amplitude normalized to the range from 0 to 1. */
  inputLevel: number
  /** Live2D mouth-open parameter normalized to the range from 0 to 1. */
  mouthOpen: number
}

/** Notifications emitted by a platform-specific system audio lipsync driver. */
export interface SystemAudioLipSyncCallbacks {
  onOutput: (output: SystemAudioLipSyncOutput) => void
  onEnded: () => void
}

/**
 * Platform boundary used by the shared Live2D controls.
 * Implementations own capture and audio processing; the store owns only UI state and options.
 */
export interface SystemAudioLipSyncDriver {
  start: (options: SystemAudioLipSyncOptions, callbacks: SystemAudioLipSyncCallbacks) => Promise<void>
  updateOptions: (options: SystemAudioLipSyncOptions) => void
  stop: () => void
  dispose: () => void
}

/** Owns Live2D system audio lipsync configuration and visualization state. */
export const useSystemAudioLipSyncStore = defineStore('system-audio-lipsync', () => {
  let driver: SystemAudioLipSyncDriver | undefined

  const available = shallowRef(false)
  const isActive = shallowRef(false)
  const isRequested = shallowRef(false)
  const isStarting = shallowRef(false)
  const error = shallowRef<string>()
  const inputLevel = shallowRef(0)
  const inputVolumeThreshold = shallowRef(0.08)
  const mouthOpen = shallowRef(0)
  const randomCloseDelayMs = shallowRef(300)
  const randomCloseProbability = shallowRef(1)

  function currentOptions(): SystemAudioLipSyncOptions {
    return {
      inputVolumeThreshold: inputVolumeThreshold.value,
      randomCloseDelayMs: randomCloseDelayMs.value,
      randomCloseProbability: randomCloseProbability.value,
    }
  }

  /** Installs the renderer-specific runtime without placing it in Pinia state. */
  function setDriver(nextDriver: SystemAudioLipSyncDriver): void {
    if (driver === nextDriver)
      return

    if (driver) {
      stop()
      driver.dispose()
    }
    driver = nextDriver
    available.value = true
  }

  /** Removes a renderer-specific runtime if it is still the current owner. */
  function clearDriver(currentDriver: SystemAudioLipSyncDriver): void {
    if (driver !== currentDriver)
      return

    stop()
    driver = undefined
    available.value = false
  }

  /** Starts this Live2D consumer without affecting other system audio consumers. */
  async function start(): Promise<void> {
    if (isRequested.value || isStarting.value)
      return
    if (!driver)
      throw new Error('System audio lipsync is not available in this runtime')

    isStarting.value = true
    error.value = undefined
    try {
      await driver.start(currentOptions(), {
        onOutput(output) {
          inputLevel.value = output.inputLevel
          mouthOpen.value = output.mouthOpen
        },
        onEnded() {
          isActive.value = false
          isRequested.value = false
          inputLevel.value = 0
          mouthOpen.value = 0
        },
      })
      isActive.value = true
      isRequested.value = true
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to start system audio input'
      isActive.value = false
      isRequested.value = false
      inputLevel.value = 0
      mouthOpen.value = 0
      throw cause
    }
    finally {
      isStarting.value = false
    }
  }

  /** Stops only the Live2D consumer owned by this store. */
  function stop(): void {
    driver?.stop()
    isActive.value = false
    isRequested.value = false
    inputLevel.value = 0
    mouthOpen.value = 0
  }

  function updateOptions(): void {
    driver?.updateOptions(currentOptions())
  }

  return {
    available,
    isActive,
    isRequested,
    isStarting,
    error,
    inputLevel,
    inputVolumeThreshold,
    mouthOpen,
    randomCloseDelayMs,
    randomCloseProbability,
    setDriver,
    clearDriver,
    start,
    stop,
    updateOptions,
  }
})
