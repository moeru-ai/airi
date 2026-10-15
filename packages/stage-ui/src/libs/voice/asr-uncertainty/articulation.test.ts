import { describe, expect, it } from 'vitest'

import { defaultNucleusOptions, defaultUntranscribedOptions, estimateEmissionDelay, findUntranscribedSpeech, measureIntensity, shiftTokenTimes } from './articulation'

const sampleRate = 16000

/** Synthesizes a vowel-like tone whose loudness follows `envelope(seconds)`. */
function tone(seconds: number, envelope: (time: number) => number) {
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, index) => {
    const time = index / sampleRate
    return envelope(time) * Math.sin(2 * Math.PI * 180 * time)
  })
}

/** Three syllables of 0.15 s, with their loudness peaks at 0.175 s, 0.425 s, and 0.675 s. */
const syllables = tone(0.9, (time) => {
  const local = (time - 0.1) % 0.25
  return time >= 0.1 && time < 0.85 && local < 0.15 ? 0.5 * Math.sin(Math.PI * local / 0.15) : 0
})

/** One vowel held for 1.2 s, with a 5 Hz tremolo of about 1 dB. */
const elongated = tone(1.5, (time) => {
  if (time < 0.1 || time > 1.4)
    return 0
  const attack = Math.min(1, (time - 0.1) / 0.05)
  const release = Math.min(1, (1.4 - time) / 0.05)
  return 0.5 * attack * release * (1 + 0.06 * Math.sin(2 * Math.PI * 5 * time))
})

describe('measureIntensity', () => {
  it('finds one nucleus for each syllable', () => {
    const { nuclei } = measureIntensity(syllables, sampleRate, defaultNucleusOptions)

    expect(nuclei).toHaveLength(3)
    expect(nuclei[0]).toBeCloseTo(0.175, 1)
    expect(nuclei[1]).toBeCloseTo(0.425, 1)
    expect(nuclei[2]).toBeCloseTo(0.675, 1)
  })

  it('finds one nucleus for an elongated vowel', () => {
    const { nuclei } = measureIntensity(elongated, sampleRate, defaultNucleusOptions)

    expect(nuclei).toHaveLength(1)
  })
})

describe('findUntranscribedSpeech', () => {
  it('marks syllables that no reference token accounts for', () => {
    const contour = measureIntensity(syllables, sampleRate, defaultNucleusOptions)
    const reference = { tokens: [{ text: '我', time: 0.17 }] }
    const probe = { tokens: [{ text: '我', time: 0.17 }, { text: '那', time: 0.43 }, { text: '个', time: 0.67 }] }

    const spans = findUntranscribedSpeech(contour, reference, defaultUntranscribedOptions, probe)

    expect(spans).toHaveLength(1)
    expect(spans[0].kind).toBe('untranscribed')
    expect(spans[0].tokenStart).toBe(1)
    expect(spans[0].variants).toEqual([{ text: '那个', count: 1 }])
  })

  // https://claude.ai/code/project/chan_01FVJaUVrUUSsfE8YFyLJRuV?thread=cmsg_01FVJaUVrUUSsfE8YFyLJRuV9jn3Uh195Z7MKcnbmKodDb
  // Rin: a voiced stretch with no token "could just be an elongated sound".
  it('does not mark the held tail of an elongated sound', () => {
    const contour = measureIntensity(elongated, sampleRate, defaultNucleusOptions)
    const reference = { tokens: [{ text: '啊', time: 0.15 }] }

    expect(findUntranscribedSpeech(contour, reference, defaultUntranscribedOptions)).toEqual([])
  })

  it('marks nothing when the reference tokens have no times', () => {
    const contour = measureIntensity(syllables, sampleRate, defaultNucleusOptions)
    // Online Paraformer reports tokens without times.
    const reference = { tokens: [{ text: '我' }, { text: '那' }, { text: '个' }] }

    expect(findUntranscribedSpeech(contour, reference, defaultUntranscribedOptions)).toEqual([])
  })

  it('marks the syllables of a reference without tokens', () => {
    const contour = measureIntensity(syllables, sampleRate, defaultNucleusOptions)

    expect(findUntranscribedSpeech(contour, { tokens: [] }, defaultUntranscribedOptions)).toHaveLength(1)
  })
})

describe('estimateEmissionDelay', () => {
  // X-ASR on a Mandarin clip: the nuclei of the clip and the emission times of the tokens, in seconds.
  const nuclei = [1.11, 1.28, 2, 2.36, 2.8, 3.28, 3.6]
  const reference = { tokens: [
    ['你', 1.48],
    ['好', 1.68],
    ['，', 1.96],
    ['欢', 2.2],
    ['迎', 2.36],
    ['使', 2.6],
    ['用', 2.76],
    ['语', 3],
    ['音', 3.2],
    ['识', 3.44],
    ['别', 3.68],
    ['测', 4],
    ['试', 4.44],
  ].map(([text, time]) => ({ text: text as string, time: time as number })) }

  it('finds the emission delay of a streaming transducer', () => {
    const delay = estimateEmissionDelay({ nuclei }, reference)

    expect(delay).toBeGreaterThanOrEqual(0.34)
    expect(delay).toBeLessThanOrEqual(0.42)
  })

  it('finds no delay in tokens that sit on their nuclei', () => {
    expect(estimateEmissionDelay({ nuclei }, { tokens: nuclei.map((time, index) => ({ text: `t${index}`, time })) })).toBe(0)
  })

  // Codex review on PR #30: with nearest-nucleus matching, each late token matched the nucleus of a later syllable.
  it('finds the delay of evenly spaced syllables, where late tokens sit on later nuclei', () => {
    const even = [0.2, 0.4, 0.6, 0.8, 1]
    const tokens = even.map((time, index) => ({ text: `t${index}`, time: time + 0.4 }))

    expect(estimateEmissionDelay({ nuclei: even }, { tokens })).toBeCloseTo(0.4)
  })

  it('finds no delay without enough evidence', () => {
    expect(estimateEmissionDelay({ nuclei: [1, 2] }, reference)).toBe(0)
    expect(estimateEmissionDelay({ nuclei }, { tokens: reference.tokens.slice(0, 2) })).toBe(0)
  })
})

describe('shiftTokenTimes', () => {
  it('moves token times earlier, not before the clip start', () => {
    const shifted = shiftTokenTimes({ tokens: [{ text: 'a', time: 0.2 }, { text: 'b', time: 1 }, { text: 'c' }] }, 0.4)

    expect(shifted.tokens).toEqual([{ text: 'a', time: 0 }, { text: 'b', time: 0.6 }, { text: 'c' }])
  })
})
