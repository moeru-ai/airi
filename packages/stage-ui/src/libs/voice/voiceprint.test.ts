import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { closestSimilarity, storedVoiceprintSchema, toStoredVoiceprint, usableVoiceprint } from './voiceprint'

const record = { id: 'voiceprint-1', label: 'English', createdAt: 1_000 }

describe('voiceprint record', () => {
  it('restores the embedding after a JSON round trip', () => {
    const stored = toStoredVoiceprint({ embedding: new Float32Array([0.5, -0.25, 0]), seconds: 12 }, record)
    const restored = usableVoiceprint(parse(storedVoiceprintSchema, JSON.parse(JSON.stringify(stored))))

    expect(stored.modelId).toBe(speakerModel.id)
    expect(stored.modelRevision).toBe(speakerModel.revision)
    expect(stored.label).toBe('English')
    expect(stored.enabled).toBe(true)
    expect(restored?.embedding).toEqual(new Float32Array([0.5, -0.25, 0]))
    expect(restored?.seconds).toBe(12)
  })

  it('does not use a voiceprint from another model revision', () => {
    const stored = toStoredVoiceprint({ embedding: new Float32Array([1]), seconds: 5 }, record)

    expect(usableVoiceprint({ ...stored, modelRevision: 'another-revision' })).toBeUndefined()
  })
})

describe('closest similarity', () => {
  it('returns the highest cosine to the other voiceprints', () => {
    const voiceprint = { embedding: new Float32Array([0.6, 0.8]), seconds: 8 }
    const others = [
      { embedding: new Float32Array([1, 0]), seconds: 8 },
      { embedding: new Float32Array([0, 1]), seconds: 8 },
    ]

    expect(closestSimilarity(voiceprint, others)).toBeCloseTo(0.8)
  })
})
