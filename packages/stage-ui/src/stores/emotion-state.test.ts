import { describe, expect, it } from 'vitest'

import { Emotion, EMOTION_VAD_value } from '../constants/emotions'
import { createEmotionState } from './emotion-state'

/** Drive the simulation for `seconds` in fixed steps. */
function run(state: ReturnType<typeof createEmotionState>, seconds: number, step = 1 / 60): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += step)
    state.update(step)
}

describe('createEmotionState', () => {
  describe('nudge', () => {
    it('should move the target toward the emotion', () => {
      const state = createEmotionState()
      state.nudge(Emotion.Angry, 0.78)

      const { target } = state.snapshot.value
      expect(target.valence).toBeLessThan(0)
      expect(target.arousal).toBeGreaterThan(0)
      expect(target.dominance).toBeGreaterThan(0)
    })

    // A single message must not be able to overwrite the state outright, or
    // the character has no memory of what it already felt.
    it('should blend toward the preset rather than replacing it', () => {
      const state = createEmotionState()
      state.nudge(Emotion.Angry, 0.78)

      const { target } = state.snapshot.value
      const preset = EMOTION_VAD_value[Emotion.Angry]

      expect(target.valence).not.toBeCloseTo(preset.valence, 5)
      expect(Math.abs(target.valence)).toBeLessThan(Math.abs(preset.valence))
    })

    it('should accumulate across repeated nudges of the same emotion', () => {
      const state = createEmotionState()

      state.nudge(Emotion.Happy, 0.5)
      const afterFirst = state.snapshot.value.target.valence
      state.nudge(Emotion.Happy, 0.5)
      const afterSecond = state.snapshot.value.target.valence

      expect(afterSecond).toBeGreaterThan(afterFirst)
    })

    it('should default the intensity when the payload omits it', () => {
      const state = createEmotionState()
      state.nudge(Emotion.Happy)

      const { target, holdRemaining } = state.snapshot.value
      expect(Number.isNaN(target.valence)).toBe(false)
      expect(target.valence).toBeGreaterThan(0)
      expect(holdRemaining).toBeGreaterThan(0)
    })
  })

  describe('integration', () => {
    it('should carry the current value toward the target over time', () => {
      const state = createEmotionState()
      state.nudge(Emotion.Happy, 0.9)

      const start = state.snapshot.value.current.valence
      run(state, 1)
      const later = state.snapshot.value.current.valence

      expect(later).toBeGreaterThan(start)
      expect(later).toBeLessThan(state.snapshot.value.target.valence + 0.05)
    })

    // The integrator is exponential precisely so that the result does not
    // depend on how the elapsed time was chopped up. A rate-times-dt
    // integrator fails this.
    it('should reach the same state regardless of how the frames are sliced', () => {
      const coarse = createEmotionState({ seed: 42 })
      const fine = createEmotionState({ seed: 42 })

      coarse.nudge(Emotion.Angry, 0.7)
      fine.nudge(Emotion.Angry, 0.7)

      coarse.update(1)
      for (let i = 0; i < 10; i++)
        fine.update(0.1)

      expect(coarse.snapshot.value.current.valence).toBeCloseTo(fine.snapshot.value.current.valence, 2)
      expect(coarse.snapshot.value.current.arousal).toBeCloseTo(fine.snapshot.value.current.arousal, 2)
    })

    it('should ignore non-advancing time steps', () => {
      const state = createEmotionState()
      state.nudge(Emotion.Happy, 0.6)
      const before = state.snapshot.value.current

      state.update(0)
      state.update(-1)
      state.update(Number.NaN)

      expect(state.snapshot.value.current).toEqual(before)
    })
  })

  describe('hold and decay', () => {
    // This gate is the mechanism that stops an expression from collapsing back
    // to neutral the moment its triggering motion ends.
    it('should not decay the target while the hold is active', () => {
      const state = createEmotionState()
      state.nudge(Emotion.Angry, 1)

      const held = state.snapshot.value.target.valence
      run(state, 5)

      expect(state.snapshot.value.holdRemaining).toBeGreaterThan(0)
      expect(state.snapshot.value.target.valence).toBeCloseTo(held, 5)
    })

    it('should decay the target toward baseline once the hold expires', () => {
      const state = createEmotionState()
      state.nudge(Emotion.Angry, 0)

      const peak = state.snapshot.value.target.valence
      run(state, 60)

      expect(state.snapshot.value.holdRemaining).toBe(0)
      expect(state.snapshot.value.target.valence).toBeGreaterThan(peak)
      expect(state.snapshot.value.target.valence).toBeLessThan(0)
    })

    it('should scale the hold with intensity', () => {
      const weak = createEmotionState()
      const strong = createEmotionState()

      weak.nudge(Emotion.Sad, 0.1)
      strong.nudge(Emotion.Sad, 0.9)

      expect(strong.snapshot.value.holdRemaining).toBeGreaterThan(weak.snapshot.value.holdRemaining)
    })

    it('should decay toward a non-neutral baseline when one is configured', () => {
      const cheerful = { valence: 0.3, arousal: 0.1, dominance: 0.1 }
      const state = createEmotionState({ baseline: cheerful })

      state.nudge(Emotion.Sad, 0)
      run(state, 400)

      expect(state.snapshot.value.target.valence).toBeGreaterThan(0)
    })
  })

  describe('ambient drift', () => {
    it('should keep moving when no emotion is active', () => {
      const state = createEmotionState({ seed: 7 })

      run(state, 5)
      const first = state.snapshot.value.current.valence
      run(state, 5)
      const second = state.snapshot.value.current.valence

      expect(first).not.toBe(second)
      // Drift is a floor of liveliness, not a performance.
      expect(Math.abs(second)).toBeLessThan(0.1)
    })

    it('should be reproducible for a given seed', () => {
      const a = createEmotionState({ seed: 777 })
      const b = createEmotionState({ seed: 777 })

      run(a, 10)
      run(b, 10)

      expect(a.snapshot.value.current).toEqual(b.snapshot.value.current)
    })

    it('should differ between seeds', () => {
      const a = createEmotionState({ seed: 1 })
      const b = createEmotionState({ seed: 2 })

      run(a, 10)
      run(b, 10)

      expect(a.snapshot.value.current).not.toEqual(b.snapshot.value.current)
    })
  })

  describe('magnitude', () => {
    it('should report a stronger reading for a stronger nudge', () => {
      const weak = createEmotionState({ seed: 5 })
      const strong = createEmotionState({ seed: 5 })

      weak.nudge(Emotion.Angry, 0.2)
      strong.nudge(Emotion.Angry, 1)
      run(weak, 3)
      run(strong, 3)

      expect(strong.snapshot.value.magnitude).toBeGreaterThan(weak.snapshot.value.magnitude)
    })

    it('should stay within the unit range', () => {
      const state = createEmotionState()
      for (let i = 0; i < 20; i++)
        state.nudge(Emotion.Angry, 1)
      run(state, 10)

      expect(state.snapshot.value.magnitude).toBeGreaterThanOrEqual(0)
      expect(state.snapshot.value.magnitude).toBeLessThanOrEqual(1)
    })
  })

  describe('reset', () => {
    // The very first snapshot is published before any frame has run, so it is
    // the one place magnitude could be written rather than derived — and with a
    // non-neutral baseline that would make reset() silently change the reading.
    it('should report the same magnitude before and after a no-op reset', () => {
      const state = createEmotionState({ baseline: { valence: 0.3, arousal: 0.1, dominance: 0.1 } })

      const initial = state.snapshot.value.magnitude
      state.reset()

      expect(initial).toBeGreaterThan(0)
      expect(state.snapshot.value.magnitude).toBe(initial)
    })

    it('should return every axis to the baseline', () => {
      const state = createEmotionState()
      state.nudge(Emotion.Angry, 1)
      run(state, 3)
      state.reset()

      expect(state.snapshot.value.current).toEqual({ valence: 0, arousal: 0, dominance: 0 })
      expect(state.snapshot.value.target).toEqual({ valence: 0, arousal: 0, dominance: 0 })
      expect(state.snapshot.value.holdRemaining).toBe(0)
    })
  })
})
