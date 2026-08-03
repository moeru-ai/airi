/**
 * Emotion State Tests
 * 情绪状态管理测试
 */

import { describe, expect, it } from 'vitest'

import { clampEmotionState, DEFAULT_EMOTION_STATE, EMOTION_BASELINE } from '../types/emotion'
import { applyDelta, applyTimeDecay, createEmotionState, emotionStateEquals, resetEmotionState } from './emotionState'

describe('emotionState', () => {
  describe('createEmotionState', () => {
    it('应该创建默认情绪状态', () => {
      const state = createEmotionState()

      expect(state.valence).toBe(0)
      expect(state.arousal).toBe(20)
      expect(state.trust).toBe(50)
      expect(state.affection).toBe(50)
      expect(state.stability).toBe(70)
      expect(state.lastUpdatedAt).toBeGreaterThan(0)
      expect(state.decayHalfLifeMinutes).toBe(180)
    })

    it('应该支持覆盖默认值', () => {
      const state = createEmotionState({
        valence: 50,
        trust: 80,
      })

      expect(state.valence).toBe(50)
      expect(state.trust).toBe(80)
      expect(state.arousal).toBe(20) // 保持默认值
    })

    it('应该裁剪超出范围的值', () => {
      const state = createEmotionState({
        valence: 150,
        arousal: -10,
        trust: 150,
      })

      expect(state.valence).toBe(100)
      expect(state.arousal).toBe(0)
      expect(state.trust).toBe(100)
    })
  })

  describe('resetEmotionState', () => {
    it('应该重置为默认状态', () => {
      const state = resetEmotionState()

      expect(state.valence).toBe(0)
      expect(state.arousal).toBe(20)
      expect(state.trust).toBe(50)
      expect(state.affection).toBe(50)
      expect(state.stability).toBe(70)
    })
  })

  describe('applyDelta', () => {
    it('应该正确应用正面情绪变化', () => {
      const state = createEmotionState()
      const delta = {
        valence: 10,
        arousal: 5,
        trust: 3,
        affection: 5,
        stability: 0,
      }

      const newState = applyDelta(state, delta)

      expect(newState.valence).toBe(8)
      expect(newState.arousal).toBe(24)
      expect(newState.trust).toBe(52.4)
      expect(newState.affection).toBe(54)
      expect(newState.lastUpdatedAt).toBeGreaterThanOrEqual(state.lastUpdatedAt)
    })

    it('应该正确应用负面情绪变化', () => {
      const state = createEmotionState({
        valence: 50,
        trust: 80,
      })
      const delta = {
        valence: -20,
        arousal: 0,
        trust: -10,
        affection: -5,
        stability: 0,
      }

      const newState = applyDelta(state, delta)

      expect(newState.valence).toBe(34)
      expect(newState.trust).toBe(72)
      expect(newState.affection).toBe(46)
    })

    it('应该考虑稳定性对波动的影响', () => {
      const highStabilityState = createEmotionState({ stability: 90 })
      const lowStabilityState = createEmotionState({ stability: 10 })
      const delta = {
        valence: 20,
        arousal: 0,
        trust: 0,
        affection: 0,
        stability: 0,
      }

      const highStabilityResult = applyDelta(highStabilityState, delta)
      const lowStabilityResult = applyDelta(lowStabilityState, delta)

      // 稳定性越高，波动越小
      expect(Math.abs(highStabilityResult.valence)).toBeLessThan(Math.abs(lowStabilityResult.valence))
    })

    it('应该先应用时间衰减再应用新变化', () => {
      const now = Date.now()
      const oldTime = now - 1000 * 60 * 60 // 1 hour ago
      const state = createEmotionState({
        valence: 80,
        lastUpdatedAt: oldTime,
      })
      const delta = {
        valence: 10,
        arousal: 0,
        trust: 0,
        affection: 0,
        stability: 0,
      }

      const newState = applyDelta(state, delta, now)

      // 应该先衰减，再加上新的变化
      expect(newState.valence).toBeLessThan(90)
      expect(newState.valence).toBeGreaterThan(10)
    })

    it('应该裁剪超出范围的值', () => {
      const state = createEmotionState()
      const delta = {
        valence: 200,
        arousal: -50,
        trust: 150,
        affection: -200,
        stability: 0,
      }

      const newState = applyDelta(state, delta)

      expect(newState.valence).toBe(100) // clamp to max
      expect(newState.arousal).toBe(0) // clamp to min
      expect(newState.trust).toBe(100) // clamp to max
      expect(newState.affection).toBe(0) // clamp to min
    })
  })

  describe('applyTimeDecay', () => {
    it('短时间不应该有显著衰减', () => {
      const now = Date.now()
      const state = createEmotionState({
        valence: 80,
        lastUpdatedAt: now - 1000, // 1 second ago
      })

      const decayedState = applyTimeDecay(state, now)

      expect(decayedState.valence).toBeCloseTo(80, 1)
    })

    it('长时间应该衰减到基线', () => {
      const now = Date.now()
      const state = createEmotionState({
        valence: 80,
        lastUpdatedAt: now - 1000 * 60 * 180, // 3 hours ago (one half-life)
      })

      const decayedState = applyTimeDecay(state, now)

      // 应该衰减到基线和原始值之间的一半
      expect(decayedState.valence).toBeLessThan(80)
      expect(decayedState.valence).toBeGreaterThan(EMOTION_BASELINE.valence!)
    })

    it('多个半衰期后应该接近基线', () => {
      const now = Date.now()
      const state = createEmotionState({
        valence: 80,
        lastUpdatedAt: now - 1000 * 60 * 180 * 5, // 5 half-lives
      })

      const decayedState = applyTimeDecay(state, now)

      // Five half-lives leave 1/32 of the distance to baseline.
      expect(decayedState.valence).toBeCloseTo(2.5, 5)
    })
  })

  describe('emotionStateEquals', () => {
    it('应该判断相等的状态', () => {
      const state1 = createEmotionState()
      const state2 = createEmotionState()

      expect(emotionStateEquals(state1, state2)).toBe(true)
    })

    it('应该判断不等的状态', () => {
      const state1 = createEmotionState({ valence: 50 })
      const state2 = createEmotionState({ valence: 60 })

      expect(emotionStateEquals(state1, state2)).toBe(false)
    })

    it('应该允许小的浮点误差', () => {
      const state1 = createEmotionState({ valence: 50.0001 })
      const state2 = createEmotionState({ valence: 50.0002 })

      expect(emotionStateEquals(state1, state2)).toBe(true)
    })
  })

  describe('clampEmotionState', () => {
    it('应该裁剪 valence 到 [-100, 100]', () => {
      const state = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        valence: 150,
      })
      expect(state.valence).toBe(100)

      const state2 = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        valence: -150,
      })
      expect(state2.valence).toBe(-100)
    })

    it('应该裁剪 arousal 到 [0, 100]', () => {
      const state = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        arousal: -10,
      })
      expect(state.arousal).toBe(0)

      const state2 = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        arousal: 150,
      })
      expect(state2.arousal).toBe(100)
    })

    it('应该裁剪 trust 到 [0, 100]', () => {
      const state = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        trust: 150,
      })
      expect(state.trust).toBe(100)

      const state2 = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        trust: -10,
      })
      expect(state2.trust).toBe(0)
    })

    it('应该裁剪 affection 到 [0, 100]', () => {
      const state = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        affection: 150,
      })
      expect(state.affection).toBe(100)

      const state2 = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        affection: -10,
      })
      expect(state2.affection).toBe(0)
    })

    it('应该裁剪 stability 到 [0, 100]', () => {
      const state = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        stability: 150,
      })
      expect(state.stability).toBe(100)

      const state2 = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        stability: -10,
      })
      expect(state2.stability).toBe(0)
    })

    it('应该裁剪 decayHalfLifeMinutes 到最小值 1', () => {
      const state = clampEmotionState({
        ...DEFAULT_EMOTION_STATE,
        decayHalfLifeMinutes: 0,
      })
      expect(state.decayHalfLifeMinutes).toBe(1)
    })
  })
})
