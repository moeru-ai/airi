import type { AudioWindow } from '@proj-airi/pipelines-audio'

import type { WakeActivity, WakeTarget, WakeWordPreparation } from '../libs/voice/wake-word-detector'

import { beginSpan, trackPath } from '@proj-airi/trace-kit'
import { VoiceAttributes, VoiceIdKeys, VoiceNames, VoiceTracks } from '@proj-airi/trace-kit/voice'
import { defineStore } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { getTraceSink, runInTraceSpan } from '../composables/use-trace'
import { LOCAL_USER_ACTOR } from '../composables/voice-input-trace'
import { createKwsSpotter, kwsModel, kwsSearch, kwsToneVariants } from '../libs/voice/kws-model'
import { WakeWordDetector } from '../libs/voice/wake-word-detector'
import { useSettingsAudioDevice } from './settings/audio-device'
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
  const devices = useSettingsAudioDevice()
  const preparation = shallowRef<WakeWordPreparation>('unconfigured')
  const error = shallowRef<string>()
  /** Pronunciations of other models are not in the pinned vocabulary. They stay on their cards but do not run. */
  const pronunciations = computed(() => wakeWords.catalog.active.filter(pronunciation => pronunciation.modelId === kwsModel.id))
  let running: { detector: WakeWordDetector, stopWatches: readonly (() => void)[] } | undefined
  /**
   * The span ID of the newest resolved wake, until an input claims it as its cause.
   * A wake that starts no input, for example because that session already listens, leaves a span that nothing claims.
   */
  let unclaimedWake: { spanId: string, resolvedAt: number } | undefined

  function stop() {
    const current = running
    running = undefined
    current?.stopWatches.forEach(stopWatch => stopWatch())
    current?.detector.stop()
    preparation.value = 'unconfigured'
    error.value = undefined
  }

  /**
   * Starts detection for the active catalog and replaces an earlier detection.
   * The model loads only when the catalog has a pronunciation for the pinned model. Catalog changes rebuild the keywords.
   * The detector listens to the unprocessed microphone input only while the catalog has such a pronunciation,
   * so a device without wake words never opens the second capture. A device change moves the listen to the new input.
   * The returned `detect` returns undefined until a wake resolves, so the listener can call it for every window.
   */
  function start(options: WakeWordDetectionOptions) {
    stop()
    const detector = new WakeWordDetector({
      modelId: kwsModel.id,
      createSpotter: createKwsSpotter,
      search: { score: kwsSearch.score, threshold: kwsSearch.threshold },
      variants: kwsToneVariants,
      // The span covers the match and the session selection. The voice input that the wake starts links to it.
      resolveTarget: (characterId, signal, pronunciation) => {
        const span = beginSpan(getTraceSink(), {
          track: trackPath(VoiceTracks.Wake, { actor: LOCAL_USER_ACTOR }),
          name: VoiceNames.WakeWord,
          ids: { [VoiceIdKeys.Actor]: LOCAL_USER_ACTOR },
          attrs: {
            [VoiceAttributes.WakeCharacterId]: characterId,
            [VoiceAttributes.WakeText]: pronunciation.text,
            [VoiceAttributes.WakeTokens]: pronunciation.tokens.join(' '),
          },
        })
        return runInTraceSpan(span, signal, async () => {
          const target = await options.resolveTarget(characterId, signal)
          unclaimedWake = { spanId: span.spanId, resolvedAt: performance.now() }
          return target
        })
      },
      onError: options.onError,
      onPreparationChange: (value, message) => {
        // A replaced detection can still settle a model load. Only the running detector updates the UI state.
        if (running?.detector !== detector)
          return
        preparation.value = value
        error.value = message
      },
    })
    const stopCatalog = watch(pronunciations, (value) => {
      // The detector reports a failed update as `error`. The next catalog change or restart retries.
      void detector.setPronunciations(value).catch(() => {})
    }, { immediate: true })
    const stopInput = watch([() => pronunciations.value.length > 0, () => devices.unprocessedInput], ([active, input], _previous, onCleanup) => {
      if (!active)
        return
      const listening = new AbortController()
      // A failed capture, for example a denied permission, stops recognition until the input or the catalog changes.
      void detector.listen(input, listening.signal).done.then((outcome) => {
        if (outcome.status === 'failed')
          options.onError?.(outcome.error)
      })
      onCleanup(() => listening.abort('Wake word input changed'))
    }, { immediate: true })
    running = { detector, stopWatches: [stopCatalog, stopInput] }

    return {
      detect: async (_window: AudioWindow, signal: AbortSignal, activity?: WakeActivity) => detector.take(signal, activity),
      stop: () => {
        if (running?.detector === detector)
          stop()
      },
    }
  }

  /**
   * Returns the span ID of the newest resolved wake, once. Call it only for an input that a wake began.
   * A wake that started no input stays unclaimed until a newer wake replaces it.
   * The second limit drops a wake that resolved long before, for example while the plugin was paused.
   */
  function claimWakeSpan(): string | undefined {
    const wake = unclaimedWake
    unclaimedWake = undefined
    return wake && performance.now() - wake.resolvedAt < 1000 ? wake.spanId : undefined
  }

  return { preparation, error, pronunciations, start, stop, claimWakeSpan }
})
