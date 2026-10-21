import type { SpeakerVoiceprint } from '@sherpaw/speaker-diarization'
import type { InferOutput } from 'valibot'

import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { array, literal, number, object, string } from 'valibot'

/**
 * The saved voiceprint of the device owner, as JSON.
 *
 * A voiceprint matches live speech only when the same model computed both from the same microphone input.
 * So the record keeps the model and the input next to the embedding.
 */
export const storedVoiceprintSchema = object({
  modelId: string(),
  modelRevision: string(),
  /**
   * The microphone input that recorded the enrollment. `input` is the speech input of the voice host, with
   * echo cancellation, noise suppression, and automatic gain on.
   */
  source: literal('input'),
  embedding: array(number()),
  seconds: number(),
  /** Unix time in milliseconds. */
  createdAt: number(),
})

export type StoredVoiceprint = InferOutput<typeof storedVoiceprintSchema>

export function toStoredVoiceprint(voiceprint: SpeakerVoiceprint, createdAt: number): StoredVoiceprint {
  return {
    modelId: speakerModel.id,
    modelRevision: speakerModel.revision,
    source: 'input',
    embedding: Array.from(voiceprint.embedding),
    seconds: voiceprint.seconds,
    createdAt,
  }
}

/** Returns the voiceprint for the speaker tracker, or nothing when another model revision computed it. */
export function usableVoiceprint(stored: StoredVoiceprint): SpeakerVoiceprint | undefined {
  if (stored.modelId !== speakerModel.id || stored.modelRevision !== speakerModel.revision)
    return undefined
  return { embedding: new Float32Array(stored.embedding), seconds: stored.seconds }
}
