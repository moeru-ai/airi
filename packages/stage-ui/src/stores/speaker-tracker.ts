import type { AudioWindow } from '@proj-airi/pipelines-audio'
import type { SpeakerTracker } from '@sherpaw/speaker-diarization'

import type { SpeakerTrackerPreparation } from '../libs/voice/speaker-tracker'

import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'

import { toMonoSamples } from '../libs/voice/mono-samples'
import { loadSpeakerTracker } from '../libs/voice/speaker-model'
import { SpeakerTrackerRuntime } from '../libs/voice/speaker-tracker'
import { useVoiceprintStore } from './voiceprint'

/** The tracker enrolls only the saved voiceprint, so the owner is speaker 0. */
const OWNER_SPEAKER = 0

/**
 * Owns the voice host's speaker tracker Worker and exposes its preparation for UI.
 *
 * The CAM++ model downloads and the Worker starts only when a feature calls `acquire`.
 * The tracker enrolls the saved voiceprint as speaker 0, and follows each change of it.
 * `release` terminates the Worker. The next `acquire` enrolls the voiceprint again.
 */
export const useSpeakerTrackerStore = defineStore('speaker-tracker', () => {
  const preparation = shallowRef<SpeakerTrackerPreparation>('idle')
  const error = shallowRef<string>()
  const voiceprints = useVoiceprintStore()
  const runtime = new SpeakerTrackerRuntime({
    createTracker: loadSpeakerTracker,
    onPreparationChange: (value, message) => {
      preparation.value = value
      error.value = message
    },
  })

  // A failed enrollment releases the tracker and reports `error` through `onPreparationChange`.
  watch(() => voiceprints.voiceprint, voiceprint => runtime.setVoiceprints(voiceprint ? [voiceprint] : []).catch(() => {}), { immediate: true })

  /** Resolves to the shared tracker after it has enrolled the current voiceprint. */
  function acquire(): Promise<SpeakerTracker> {
    return runtime.acquire()
  }

  function release(): void {
    runtime.dispose()
  }

  /**
   * The cosine between the saved voiceprint and the audio window, compared as one window.
   * NaN when the window has no embedding, for example digital silence.
   * The comparison uses the window as mono PCM clamped to [-1, 1], because the tracker rejects other samples.
   * Uses only a ready tracker, so a comparison never loads a released tracker again. Before `ready`, the result is NaN.
   * Rejects when no voiceprint is enrolled.
   */
  async function compareOwner(window: Pick<AudioWindow, 'channels' | 'sampleRate'>): Promise<number> {
    if (preparation.value !== 'ready')
      return Number.NaN
    const tracker = await runtime.acquire()
    const samples = toMonoSamples(window)
    const seconds = samples.length / window.sampleRate
    const [cosine] = await tracker.similarity(samples, window.sampleRate, OWNER_SPEAKER, { windowSeconds: seconds, stepSeconds: seconds })
    // One window gives one value. An empty result compared nothing, so it has no score.
    return cosine ?? Number.NaN
  }

  return { preparation, error, acquire, release, compareOwner }
})
