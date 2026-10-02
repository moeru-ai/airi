import type { MoodState } from './mood'

import { describe, expect, it } from 'vitest'

import { applyMoodAppraisal, appraisalTarget, composeExpression, decayMood, DEFAULT_MOOD_PROFILE, describeMood, moodAppraisalInterval, moodExpression, moodIntensity } from './mood'

const profile = DEFAULT_MOOD_PROFILE
const start: MoodState = { pad: profile.baseline, updatedAt: 0 }

describe('mood', () => {
  // P6 acceptance: mood stays stable under noisy scores.
  it('smooths classifier jitter so the baseline expression never jumps', () => {
    let state = start
    const intensities: number[] = []
    const names: string[] = []
    // Repeated scores for the same event jitter by about ±0.04.
    const jitter = [0.04, -0.03, 0.02, -0.04, 0.01, 0.03, -0.02, -0.01, 0.04, -0.04, 0.02, -0.03]
    for (const [index, noise] of jitter.entries()) {
      state = applyMoodAppraisal(state, profile, { anger: 0.6 + noise }, (index + 1) * 1000)
      intensities.push(moodExpression(state.pad).intensity)
      names.push(moodExpression(state.pad).name)
    }

    const settled = intensities.slice(6)
    expect(new Set(names.slice(6))).toEqual(new Set(['angry']))
    // Raw scores move by up to 0.08 between calls. Smoothed mood moves far less once it settles.
    const steps = settled.slice(1).map((value, index) => Math.abs(value - settled[index]!))
    expect(Math.max(...steps)).toBeLessThan(0.04)
  })

  it('returns to the persona baseline over time', () => {
    const upset = applyMoodAppraisal(start, profile, { sadness: 1 }, 0)
    const later = decayMood(upset, profile, profile.halfLifeMs)

    expect(later.pad.pleasure - profile.baseline.pleasure).toBeCloseTo((upset.pad.pleasure - profile.baseline.pleasure) / 2)
    expect(moodExpression(decayMood(upset, profile, profile.halfLifeMs * 10).pad).name).toBe('neutral')
  })

  it('separates anger from fear by dominance', () => {
    expect(moodExpression(appraisalTarget(profile.baseline, { anger: 1 })).name).toBe('angry')
    expect(moodExpression(appraisalTarget(profile.baseline, { fear: 1 })).name).toBe('awkward')
  })

  it('points a calm appraisal at the baseline', () => {
    expect(appraisalTarget(profile.baseline, {})).toEqual(profile.baseline)
    expect(moodIntensity(4)).toBe(1)
    expect(moodIntensity(2)).toBe(0.5)
  })

  // P6 acceptance: mood owns the baseline, and a sentence owns its moment.
  it('weakens a sentence expression that conflicts with the mood, and keeps one that agrees', () => {
    const angry = appraisalTarget(profile.baseline, { anger: 1 })

    // Irritated mood has pleasure -0.4, so a full smile keeps 80% of its intensity.
    expect(composeExpression({ name: 'happy', intensity: 1 }, angry).intensity).toBeCloseTo(0.8)
    expect(composeExpression({ name: 'angry', intensity: 0.7 }, angry)).toEqual({ name: 'angry', intensity: 0.7 })
    expect(composeExpression({ name: 'think', intensity: 0.7 }, angry)).toEqual({ name: 'think', intensity: 0.7 })
    expect(composeExpression({ name: 'unknown', intensity: 0.5 }, angry)).toEqual({ name: 'unknown', intensity: 0.5 })
  })

  it('looks more often when aroused and less often when calm', () => {
    expect(moodAppraisalInterval(60_000, { pleasure: 0, arousal: 1, dominance: 0 })).toBe(30_000)
    expect(moodAppraisalInterval(60_000, { pleasure: 0, arousal: -1, dominance: 0 })).toBe(120_000)
  })

  it('describes the mood in one sentence without numbers', () => {
    expect(describeMood(profile.baseline)).toBe('Current mood: calm.')
    expect(describeMood(appraisalTarget(profile.baseline, { anger: 1 }))).toBe('Current mood: very irritated.')
    expect(describeMood(appraisalTarget(profile.baseline, { joy: 0.15 }))).toBe('Current mood: slightly cheerful.')
  })
})
