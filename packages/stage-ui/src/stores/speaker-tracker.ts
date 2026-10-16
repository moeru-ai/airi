import type { SpeakerTracker } from '@sherpaw/speaker-diarization'

import type { SpeakerTrackerPreparation } from '../libs/voice/speaker-tracker'

import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'

import { loadSpeakerTracker } from '../libs/voice/speaker-model'
import { SpeakerTrackerRuntime } from '../libs/voice/speaker-tracker'
import { useVoiceprintStore } from './voiceprint'

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

  return { preparation, error, acquire, release }
})
