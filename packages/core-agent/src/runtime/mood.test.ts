import { describe, expect, it } from 'vitest'

import { applyMoodAppraisal, calmMood, composeExpression, decayMood, DEFAULT_MOOD_PROFILE, describeMood, moodAppraisalInterval, moodExpression, moodIntensitiesFromAnswers, moodIntensity, moodPad, moodProfileFromTemperament, moodProsody, padFromIntensities } from './mood'

const profile = DEFAULT_MOOD_PROFILE

describe('mood', () => {
  // P6 acceptance: mood stays stable under noisy scores.
  it('smooths classifier jitter so the baseline expression never jumps', () => {
    let state = calmMood(0)
    const intensities: number[] = []
    const names: string[] = []
    // Repeated scores for the same event jitter by about ±0.04.
    const jitter = [0.04, -0.03, 0.02, -0.04, 0.01, 0.03, -0.02, -0.01, 0.04, -0.04, 0.02, -0.03, 0.03, -0.02, 0.01, -0.04]
    for (const [index, noise] of jitter.entries()) {
      state = applyMoodAppraisal(state, profile, { anger: 0.8 + noise }, (index + 1) * 1000)
      intensities.push(moodExpression(moodPad(state, profile)).intensity)
      names.push(moodExpression(moodPad(state, profile)).name)
    }

    const settled = intensities.slice(10)
    expect(new Set(names.slice(10))).toEqual(new Set(['angry']))
    // Raw scores move by up to 0.08 between calls. Smoothed mood moves far less once it settles.
    const steps = settled.slice(1).map((value, index) => Math.abs(value - settled[index]!))
    expect(Math.max(...steps)).toBeLessThan(0.04)
  })

  // Feelings last for different times, so the mood curve is not one exponential.
  it('lets anger fade before sorrow', () => {
    const upset = applyMoodAppraisal(calmMood(0), profile, { anger: 1, sadness: 1 }, 0)
    const later = decayMood(upset, profile, profile.halfLifeMs.anger)

    expect(later.intensities.anger).toBeCloseTo(upset.intensities.anger / 2)
    expect(later.intensities.sadness).toBeGreaterThan(upset.intensities.sadness * 0.8)
    expect(moodExpression(moodPad(decayMood(upset, profile, profile.halfLifeMs.sadness * 10), profile)).name).toBe('neutral')
  })

  it('separates anger from fear by dominance', () => {
    expect(moodExpression(padFromIntensities(profile.baseline, { anger: 1 })).name).toBe('angry')
    expect(moodExpression(padFromIntensities(profile.baseline, { fear: 1 })).name).toBe('awkward')
    expect(moodIntensity(4)).toBe(1)
    expect(moodIntensity(2)).toBe(0.5)
  })

  describe('temperament', () => {
    it('makes the center rational and the edge emotional', () => {
      const rational = moodProfileFromTemperament({ valence: 0, arousal: 0 })
      const emotional = moodProfileFromTemperament({ valence: 0, arousal: -1 })

      expect(rational.sensitivity).toBeLessThan(emotional.sensitivity)
      expect(rational.halfLifeMs.sadness).toBeLessThan(emotional.halfLifeMs.sadness)
      expect(rational.baseline).toEqual({ pleasure: 0, arousal: 0, dominance: 0 })
    })

    it('makes feelings in the leaning quadrant last longer, and shifts the baseline toward it', () => {
      const sorrowful = moodProfileFromTemperament({ valence: -0.7, arousal: -0.7 })
      const joyful = moodProfileFromTemperament({ valence: 0.7, arousal: 0.7 })

      expect(sorrowful.halfLifeMs.sadness / sorrowful.halfLifeMs.joy).toBeGreaterThan(joyful.halfLifeMs.sadness / joyful.halfLifeMs.joy)
      expect(sorrowful.baseline.pleasure).toBeLessThan(0)
      expect(joyful.baseline.arousal).toBeGreaterThan(0)
    })
  })

  // P6 acceptance: mood owns the baseline, and a sentence owns its moment.
  it('weakens a sentence expression that conflicts with the mood, and keeps one that agrees', () => {
    const angry = padFromIntensities(profile.baseline, { anger: 1 })

    expect(angry.pleasure).toBeLessThan(0)
    expect(composeExpression({ name: 'happy', intensity: 1 }, angry).intensity).toBeCloseTo(1 + 0.5 * angry.pleasure)
    expect(composeExpression({ name: 'angry', intensity: 0.7 }, angry)).toEqual({ name: 'angry', intensity: 0.7 })
    expect(composeExpression({ name: 'think', intensity: 0.7 }, angry)).toEqual({ name: 'think', intensity: 0.7 })
    expect(composeExpression({ name: 'unknown', intensity: 0.5 }, angry)).toEqual({ name: 'unknown', intensity: 0.5 })
  })

  it('describes the mood as a blend in one sentence without numbers', () => {
    expect(describeMood({})).toBe('Current mood: calm.')
    expect(describeMood({ anger: 0.8 })).toBe('Current mood: very irritated.')
    expect(describeMood({ joy: 0.1 })).toBe('Current mood: slightly happy.')
    expect(describeMood({ contentment: 0.5, fear: 0.2 })).toBe('Current mood: mostly at ease, a little anxious.')
    // A faint second feeling does not change the words.
    expect(describeMood({ contentment: 0.5, fear: 0.06 })).toBe('Current mood: at ease.')
  })

  it('looks more often when aroused and less often when calm', () => {
    expect(moodAppraisalInterval(60_000, { pleasure: 0, arousal: 1, dominance: 0 })).toBe(30_000)
    expect(moodAppraisalInterval(60_000, { pleasure: 0, arousal: -1, dominance: 0 })).toBe(120_000)
  })

  describe('composition from one appraisal', () => {
    // The probability of each feeling is its weight, so mixed feelings stay mixed.
    it('weights each feeling by its probability and scales all by the strength', () => {
      const intensities = moodIntensitiesFromAnswers({
        feeling: { type: 'choice', choice: 'anger', confidence: 0.6, probabilities: { anger: 0.6, sadness: 0.3, none: 0.1 } },
        strength: { type: 'score', score: 2, confidence: 0.9 },
      })

      expect(intensities?.anger).toBeCloseTo(0.3)
      expect(intensities?.sadness).toBeCloseTo(0.15)
      expect(intensities?.joy).toBe(0)
    })

    it('normalizes probabilities, and weighs a lone choice by its confidence', () => {
      expect(moodIntensitiesFromAnswers({
        feeling: { type: 'choice', choice: 'joy', confidence: 0.5, probabilities: { joy: 1, contentment: 1 } },
        strength: { type: 'score', score: 4, confidence: 0.9 },
      })).toMatchObject({ joy: 0.5, contentment: 0.5 })
      expect(moodIntensitiesFromAnswers({
        feeling: { type: 'choice', choice: 'fear', confidence: 0.7 },
        strength: { type: 'score', score: 4, confidence: 0.9 },
      })).toMatchObject({ fear: 0.7, anger: 0 })
    })

    it('needs both answers', () => {
      expect(moodIntensitiesFromAnswers({ feeling: { type: 'choice', choice: 'joy', confidence: 1 } })).toBeUndefined()
      expect(moodIntensitiesFromAnswers(undefined)).toBeUndefined()
    })
  })

  it('colors the voice by mood with small prosody offsets', () => {
    expect(moodProsody({ pleasure: 1, arousal: 1, dominance: 0 })).toEqual({ pitchPercent: 8, rateScale: 1.1 })
    expect(moodProsody({ pleasure: -0.5, arousal: -1, dominance: 0 })).toEqual({ pitchPercent: -4, rateScale: 0.9 })
  })
})
