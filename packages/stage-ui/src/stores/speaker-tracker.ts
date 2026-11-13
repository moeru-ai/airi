import type { AudioWindow } from '@proj-airi/pipelines-audio'
import type { SpeakerTracker } from '@sherpaw/speaker-diarization'

import type { SpeakerCandidate } from '../libs/voice/speaker-evidence-plugin'
import type { SpeakerTrackerPreparation } from '../libs/voice/speaker-tracker'

import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'

import { toMonoSamples } from '../libs/voice/mono-samples'
import { NO_SPEAKER_CANDIDATES } from '../libs/voice/speaker-evidence-plugin'
import { loadSpeakerTracker } from '../libs/voice/speaker-model'
import { SpeakerTrackerRuntime } from '../libs/voice/speaker-tracker'
import { useVoiceprintStore } from './voiceprint'

/**
 * Owns the voice host's speaker tracker Worker and exposes its preparation for UI.
 *
 * The CAM++ model downloads and the Worker starts only when a feature calls `acquire`.
 * The tracker enrolls the enabled voiceprints as speakers 0, 1, ... in their saved order, and follows each change of them.
 * `release` terminates the Worker. The next `acquire` enrolls the voiceprints again.
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

  /** The voiceprint id of each enrolled speaker number. It changes together with the voiceprints that the runtime enrolls. */
  let enrolledIds: readonly string[] = []
  /** Counts the changes of `enrolledIds`, so a comparison can tell that the speaker numbers changed while it ran. */
  let enrollments = 0
  // A failed enrollment releases the tracker and reports `error` through `onPreparationChange`.
  // A voiceprint id never gets another embedding, so the same ids need no new enrollment, for example after a rename.
  watch(() => voiceprints.matching, (matching) => {
    const ids = matching.map(item => item.record.id)
    if (ids.length === enrolledIds.length && ids.every((id, index) => id === enrolledIds[index]))
      return
    enrolledIds = ids
    enrollments++
    runtime.setVoiceprints(matching.map(item => item.voiceprint)).catch(() => {})
  }, { immediate: true })

  /** Resolves to the shared tracker after it has enrolled the current voiceprints. */
  function acquire(): Promise<SpeakerTracker> {
    return runtime.acquire()
  }

  /** Counts releases, so a comparison can tell that a release ended it. */
  let releases = 0

  function release(): void {
    releases++
    runtime.dispose()
  }

  /**
   * The cosine between each enabled voiceprint and the audio window, compared as one window, in the saved order.
   * A score is NaN when the window has no embedding, for example digital silence.
   * The comparison uses the window as mono PCM clamped to [-1, 1], because the tracker rejects other samples.
   * Uses only a ready tracker, so a comparison never loads a released tracker again. Before `ready`, the result is empty.
   * While the tracker enrolls changed voiceprints, the comparison waits. A comparison that `release` ends is empty.
   * A comparison that runs during a voiceprint change is empty, because the new enrollment numbers the speakers again.
   * Each voiceprint is one more embedding of the window, because Sherpaw `similarity` compares with one speaker.
   */
  async function compare(window: Pick<AudioWindow, 'channels' | 'sampleRate'>): Promise<readonly SpeakerCandidate[]> {
    if (preparation.value !== 'ready')
      return NO_SPEAKER_CANDIDATES
    const released = releases
    const enrolled = enrollments
    try {
      const tracker = await runtime.acquire()
      // The runtime enrolled these ids when `acquire` resolved, unless a voiceprint change started after that.
      const ids = enrolledIds
      const samples = toMonoSamples(window)
      const seconds = samples.length / window.sampleRate
      const candidates: SpeakerCandidate[] = []
      for (const [speaker, speakerId] of ids.entries()) {
        const [cosine] = await tracker.similarity(samples, window.sampleRate, speaker, { windowSeconds: seconds, stepSeconds: seconds })
        // After a voiceprint change, this speaker number and the next ones can belong to other voiceprints.
        if (enrollments !== enrolled)
          return NO_SPEAKER_CANDIDATES
        // One window gives one value. An empty result compared nothing, so it has no score.
        candidates.push({ speakerId, score: cosine ?? Number.NaN })
      }
      return candidates
    }
    catch (error) {
      // `dispose` of the tracker rejects the calls that still run. A release, for example when listening stops, is not a failure.
      // During a new enrollment, the tracker rejects a speaker number that it has not enrolled again. That is not a failure.
      if (releases !== released || enrollments !== enrolled)
        return NO_SPEAKER_CANDIDATES
      throw error
    }
  }

  return { preparation, error, acquire, release, compare }
})
