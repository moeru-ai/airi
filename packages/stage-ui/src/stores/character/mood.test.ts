import type { Classifier, ClassifierAnswer } from '@proj-airi/core-agent'

import { DEFAULT_MOOD_PROFILE } from '@proj-airi/core-agent'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCharacterMoodStore } from './mood'

const triage = vi.hoisted(() => ({ classifier: undefined as Classifier | undefined }))

vi.mock('../modules/triage', () => ({ useTriageStore: () => triage }))

function scores(values: Record<string, number>, confidence = 0.95): Record<string, ClassifierAnswer> {
  return Object.fromEntries(Object.entries(values).map(([dimension, score]) => [dimension, { type: 'score', score, confidence }]))
}

const angry = { joy: 0, anger: 4, sadness: 0, fear: 0, boredom: 0 }

describe('character mood store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    triage.classifier = undefined
  })

  it('rests at the baseline without a classifier', async () => {
    const mood = useCharacterMoodStore()

    expect(mood.active).toBe(false)
    expect(await mood.appraise('airi', { interaction: 'Owner: you are useless' })).toBeUndefined()
    expect(mood.current('airi')).toEqual(DEFAULT_MOOD_PROFILE.baseline)
  })

  it('moves only the appraised persona, and keeps the state for later reads', async () => {
    const ask = vi.fn(async () => scores(angry))
    triage.classifier = { backend: 'fake', ask }
    const mood = useCharacterMoodStore()

    await mood.appraise('airi', { persona: 'A cheerful assistant', interaction: 'Owner: you broke it again' })

    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ untrusted: 'Owner: you broke it again', state: expect.objectContaining({ persona: 'A cheerful assistant' }) }), expect.anything())
    expect(mood.current('airi').pleasure).toBeLessThan(DEFAULT_MOOD_PROFILE.baseline.pleasure)
    expect(mood.current('other')).toEqual(DEFAULT_MOOD_PROFILE.baseline)
    expect(Object.keys(mood.states)).toEqual(['airi'])
  })

  // A missing or unsure score would read as calm, so the whole appraisal is skipped.
  it('leaves mood unchanged when any dimension is unsure', async () => {
    triage.classifier = { backend: 'fake', ask: async () => ({ ...scores(angry), boredom: { type: 'score', score: 0, confidence: 0.3 } }) }
    const mood = useCharacterMoodStore()

    expect(await mood.appraise('airi', { interaction: 'Owner: hmm' })).toBeUndefined()
    expect(mood.states).toEqual({})
  })
})
