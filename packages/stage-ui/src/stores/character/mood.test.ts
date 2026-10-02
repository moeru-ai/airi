import type { Classifier, ClassifierAnswer } from '@proj-airi/core-agent'

import { DEFAULT_MOOD_PROFILE } from '@proj-airi/core-agent'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCharacterMoodStore } from './mood'

const triage = vi.hoisted(() => ({ classifier: undefined as Classifier | undefined }))
const cards = vi.hoisted((): Record<string, { extensions: { airi: { temperament: { valence: number, arousal: number } } } }> => ({
  rational: { extensions: { airi: { temperament: { valence: 0, arousal: 0 } } } },
  emotional: { extensions: { airi: { temperament: { valence: -0.7, arousal: 0.7 } } } },
}))

vi.mock('../modules/triage', () => ({ useTriageStore: () => triage }))
vi.mock('../modules/airi-card', () => ({ useAiriCardStore: () => ({ getCard: (id: string) => cards[id] }) }))

function feeling(choice: string, probabilities?: Record<string, number>, strength = 4): Record<string, ClassifierAnswer> {
  return {
    feeling: { type: 'choice', choice, confidence: probabilities?.[choice] ?? 0.9, probabilities },
    strength: { type: 'score', score: strength, confidence: 0.9 },
  }
}

const angry = feeling('anger', { anger: 1 })

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
    const ask = vi.fn(async () => angry)
    triage.classifier = { backend: 'fake', ask }
    const mood = useCharacterMoodStore()

    await mood.appraise('airi', { persona: 'A cheerful assistant', interaction: 'Owner: you broke it again' })

    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ untrusted: 'Owner: you broke it again', state: expect.objectContaining({ persona: 'A cheerful assistant' }) }), expect.anything())
    expect(mood.current('airi').pleasure).toBeLessThan(DEFAULT_MOOD_PROFILE.baseline.pleasure)
    expect(mood.current('other')).toEqual(DEFAULT_MOOD_PROFILE.baseline)
    expect(Object.keys(mood.states)).toEqual(['airi'])
  })

  // A missing answer would read as calm, so the whole appraisal is skipped.
  it('leaves mood unchanged when an answer is missing', async () => {
    triage.classifier = { backend: 'fake', ask: async () => ({ feeling: angry.feeling! }) }
    const mood = useCharacterMoodStore()

    expect(await mood.appraise('airi', { interaction: 'Owner: hmm' })).toBeUndefined()
    expect(mood.states).toEqual({})
  })

  // An unsure answer still counts, with smaller weights.
  it('moves mood less for an unsure answer than for a sure one', async () => {
    const mood = useCharacterMoodStore()
    triage.classifier = { backend: 'fake', ask: async () => feeling('anger', { anger: 0.4, none: 0.6 }) }
    await mood.appraise('unsure', { interaction: 'Owner: hmm' })
    triage.classifier = { backend: 'fake', ask: async () => angry }
    await mood.appraise('sure', { interaction: 'Owner: hmm' })

    expect(mood.current('unsure').pleasure).toBeGreaterThan(mood.current('sure').pleasure)
  })

  // The temperament on each card shapes how far one interaction moves its persona.
  it('moves an emotional persona further than a rational one', async () => {
    triage.classifier = { backend: 'fake', ask: async () => angry }
    const mood = useCharacterMoodStore()

    await mood.appraise('rational', { interaction: 'Owner: you broke it again' })
    await mood.appraise('emotional', { interaction: 'Owner: you broke it again' })

    const shift = (persona: string) => mood.profileOf(persona).baseline.pleasure - mood.current(persona).pleasure
    expect(shift('emotional')).toBeGreaterThan(shift('rational'))
  })

  // A mood is a blend, so prompts and displays name more than one feeling.
  it('describes a mixed appraisal as a blend', async () => {
    triage.classifier = { backend: 'fake', ask: async () => feeling('contentment', { contentment: 0.6, fear: 0.3, none: 0.1 }) }
    const mood = useCharacterMoodStore()

    await mood.appraise('emotional', { interaction: 'Owner: the exam is tomorrow, but I am ready' })

    expect(mood.describe('emotional')).toBe('Current mood: mostly at ease, a little anxious.')
    expect(mood.feelingsOf('emotional').map(entry => entry.feeling)).toEqual(['contentment', 'fear'])
  })
})
