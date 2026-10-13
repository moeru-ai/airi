import type { SpeakerTracker, SpeakerVoiceprint } from '@sherpaw/speaker-diarization'

import type { SpeakerTrackerPreparation } from '../libs/voice/speaker-tracker'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { loadSpeakerTracker } from '../libs/voice/speaker-model'
import { SpeakerTrackerRuntime } from '../libs/voice/speaker-tracker'

/**
 * Owns the voice host's speaker tracker Worker and exposes its preparation for UI.
 *
 * The CAM++ model downloads and the Worker starts only when a feature calls `acquire`.
 * `release` terminates the Worker. The voiceprints stay, and the next `acquire` enrolls them again.
 */
export const useSpeakerTrackerStore = defineStore('speaker-tracker', () => {
  const preparation = shallowRef<SpeakerTrackerPreparation>('idle')
  const error = shallowRef<string>()
  const runtime = new SpeakerTrackerRuntime({
    createTracker: loadSpeakerTracker,
    onPreparationChange: (value, message) => {
      preparation.value = value
      error.value = message
    },
  })

  /** Resolves to the shared tracker after it has enrolled the current voiceprints. */
  function acquire(): Promise<SpeakerTracker> {
    return runtime.acquire()
  }

  /** Replaces the enrolled speakers. They get the speaker numbers 0, 1, ... in this order. */
  function setVoiceprints(voiceprints: readonly SpeakerVoiceprint[]): Promise<void> {
    return runtime.setVoiceprints(voiceprints)
  }

  function release(): void {
    runtime.dispose()
  }

  return { preparation, error, acquire, setVoiceprints, release }
})
