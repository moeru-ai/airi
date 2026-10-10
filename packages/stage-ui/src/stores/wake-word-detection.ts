import type { WakeTarget, WakeWordPreparation } from '../libs/voice/wake-word-detector'

import { defineStore } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { createKwsSpotter, kwsModel } from '../libs/voice/kws-model'
import { WakeWordDetector } from '../libs/voice/wake-word-detector'
import { useWakeWordsStore } from './wake-words'

/** Inputs that the voice listener supplies when it starts wake word detection. */
export interface WakeWordDetectionOptions {
  /** Selects the matched character's session. The voice store supplies `resolveWakeTarget`. */
  readonly resolveTarget: (characterId: string, signal: AbortSignal) => Promise<WakeTarget>
  readonly onError?: (error: unknown) => void
}

/**
 * Owns the device's running wake word detector and exposes its preparation for UI.
 *
 * The voice listener starts one detection when it starts listening and stops it when the listener is disposed.
 * While no detection runs, `preparation` is `unconfigured`, because no detector needs a model.
 */
export const useWakeWordDetectionStore = defineStore('wake-word-detection', () => {
  const wakeWords = useWakeWordsStore()
  const preparation = shallowRef<WakeWordPreparation>('unconfigured')
  const error = shallowRef<string>()
  /** Pronunciations of other models are not in the pinned vocabulary. They stay on their cards but do not run. */
  const pronunciations = computed(() => wakeWords.catalog.active.filter(pronunciation => pronunciation.modelId === kwsModel.id))
  let running: { detector: WakeWordDetector, stopWatch: () => void } | undefined

  function stop() {
    const current = running
    running = undefined
    current?.stopWatch()
    current?.detector.stop()
    preparation.value = 'unconfigured'
    error.value = undefined
  }

  /**
   * Starts detection for the active catalog and replaces an earlier detection.
   * The model loads only when the catalog has a pronunciation for the pinned model. Catalog changes rebuild the keywords.
   * The returned `detect` returns undefined until the model is ready, so the listener can call it for every window.
   */
  function start(options: WakeWordDetectionOptions) {
    stop()
    const detector = new WakeWordDetector({
      modelId: kwsModel.id,
      createSpotter: createKwsSpotter,
      resolveTarget: options.resolveTarget,
      onError: options.onError,
      onPreparationChange: (value, message) => {
        // A replaced detection can still settle a model load. Only the running detector updates the UI state.
        if (running?.detector !== detector)
          return
        preparation.value = value
        error.value = message
      },
    })
    const stopWatch = watch(pronunciations, (value) => {
      // The detector reports a failed update as `error`. The next catalog change or restart retries.
      void detector.setPronunciations(value).catch(() => {})
    }, { immediate: true })
    running = { detector, stopWatch }

    return {
      detect: detector.detect.bind(detector),
      stop: () => {
        if (running?.detector === detector)
          stop()
      },
    }
  }

  return { preparation, error, pronunciations, start, stop }
})
