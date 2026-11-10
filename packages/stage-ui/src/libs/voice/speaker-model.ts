import type { SpeakerTracker, SpeakerVoiceprint } from '@sherpaw/speaker-diarization'

import { speakerModel } from '@proj-airi/stage-shared/speaker-model'

import { fetchSherpawModelPack } from '../providers/providers/sherpaw/model-assets'

export { speakerModel } from '@proj-airi/stage-shared/speaker-model'

/**
 * Creates a speaker tracker Worker with the pinned CAM++ pack. The caller owns the returned tracker and must dispose it.
 *
 * The Sherpaw client and its Worker load on first use, so hosts without speaker tracking do not load the runtime.
 * The tracker copies the pack into its Worker, so the renderer does not keep the 28 MB pack after creation.
 * Aborting `signal` cancels the creation, or disposes the tracker after creation.
 */
export async function loadSpeakerTracker(signal: AbortSignal): Promise<SpeakerTracker> {
  const [model, { createSpeakerTracker }, { default: SpeakerWorker }] = await Promise.all([
    fetchSherpawModelPack(speakerModel.id, 'voiceprint model', signal),
    import('@sherpaw/speaker-diarization'),
    import('@sherpaw/speaker-diarization/worker?worker'),
  ])
  signal.throwIfAborted()

  return createSpeakerTracker({ model, signal }, { worker: new SpeakerWorker() })
}

/**
 * Computes the voiceprint of one person from their speech, in a tracker Worker of its own.
 *
 * Pass speech only, at least 5 s of it. The tracker rejects audio with more than one voice.
 * The Worker ends when this function settles, so enrollment does not keep the model in memory.
 */
export async function computeVoiceprint(speech: Float32Array, sampleRate: number, signal: AbortSignal): Promise<SpeakerVoiceprint> {
  const tracker = await loadSpeakerTracker(signal)
  try {
    const speaker = await tracker.enroll(speech, sampleRate)
    return await tracker.voiceprint(speaker)
  }
  finally {
    tracker.dispose()
  }
}
