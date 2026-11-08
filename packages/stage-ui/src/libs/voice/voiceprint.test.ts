import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { storedVoiceprintSchema, toStoredVoiceprint, usableVoiceprint } from './voiceprint'

describe('voiceprint record', () => {
  it('restores the embedding after a JSON round trip', () => {
    const stored = toStoredVoiceprint({ embedding: new Float32Array([0.5, -0.25, 0]), seconds: 12 }, 1_000)
    const restored = usableVoiceprint(parse(storedVoiceprintSchema, JSON.parse(JSON.stringify(stored))))

    expect(stored.modelId).toBe(speakerModel.id)
    expect(stored.modelRevision).toBe(speakerModel.revision)
    expect(restored?.embedding).toEqual(new Float32Array([0.5, -0.25, 0]))
    expect(restored?.seconds).toBe(12)
  })

  it('does not use a voiceprint from another model revision', () => {
    const stored = toStoredVoiceprint({ embedding: new Float32Array([1]), seconds: 5 }, 1_000)

    expect(usableVoiceprint({ ...stored, modelRevision: 'another-revision' })).toBeUndefined()
  })
})
