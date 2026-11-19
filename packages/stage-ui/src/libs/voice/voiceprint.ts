import type { SpeakerVoiceprint } from '@sherpaw/speaker-diarization'
import type { InferOutput } from 'valibot'

import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { array, boolean, literal, number, object, string } from 'valibot'

/**
 * Sherpaw's speaker tracker adds speech to an enrolled speaker only at this cosine or more (its `enrollThreshold`).
 * A new voiceprint below it to every saved voiceprint probably comes from another voice or another setting.
 */
export const SAME_SPEAKER_SIMILARITY = 0.4

/**
 * The fields of a voiceprint record that the enrollment sets. The user does not change them.
 *
 * A voiceprint matches live speech only when the same model computed both from the same microphone input.
 * So the record keeps the model and the input next to the embedding.
 */
export const voiceprintFields = {
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
}

/**
 * One saved voiceprint, as JSON. The user can save several, for example one for each language that they speak,
 * because a voiceprint matches speech in its own language best.
 */
export const storedVoiceprintSchema = object({
  id: string(),
  /** The user's name for the voiceprint, for example a language, a microphone, or a person. Empty when the user gave none. */
  label: string(),
  /** Speaker recognition compares voice inputs only with enabled voiceprints. */
  enabled: boolean(),
  ...voiceprintFields,
})

export type StoredVoiceprint = InferOutput<typeof storedVoiceprintSchema>

export function toStoredVoiceprint(voiceprint: SpeakerVoiceprint, record: Pick<StoredVoiceprint, 'id' | 'label' | 'createdAt'>): StoredVoiceprint {
  return {
    ...record,
    enabled: true,
    modelId: speakerModel.id,
    modelRevision: speakerModel.revision,
    source: 'input',
    embedding: Array.from(voiceprint.embedding),
    seconds: voiceprint.seconds,
  }
}

/** Returns the voiceprint for the speaker tracker, or nothing when another model revision computed it. */
export function usableVoiceprint(stored: StoredVoiceprint): SpeakerVoiceprint | undefined {
  if (stored.modelId !== speakerModel.id || stored.modelRevision !== speakerModel.revision)
    return undefined
  return { embedding: new Float32Array(stored.embedding), seconds: stored.seconds }
}

/**
 * The highest cosine between the voiceprint and the others, or undefined without others.
 * Speaker embeddings have unit length, so the cosine is their dot product.
 */
export function closestSimilarity(voiceprint: SpeakerVoiceprint, others: readonly SpeakerVoiceprint[]): number | undefined {
  let closest: number | undefined
  for (const other of others) {
    let dot = 0
    for (let index = 0; index < voiceprint.embedding.length; index++)
      dot += voiceprint.embedding[index] * other.embedding[index]
    closest = Math.max(closest ?? -1, dot)
  }
  return closest
}
