/**
 * Emotion State Manager
 * 情绪状态管理器 - 应用变化、时间衰减
 */

import type { EmotionDelta, EmotionState } from '../types/emotion'
import { EMOTION_BASELINE, clampEmotionState } from '../types/emotion'

/**
 * 应用情绪变化到状态
 */
export function applyDelta(
  state: EmotionState,
  delta: EmotionDelta,
  now: number = Date.now(),
): EmotionState {
  // 1. 先应用时间衰减
  const decayedState = applyTimeDecay(state, now)

  // 2. 计算稳定性对波动幅度的影响
  // stability 越高，波动幅度越小
  // stability: 0 -> 1.5x 波动, 50 -> 1.0x 波动, 100 -> 0.5x 波动
  const stabilityFactor = 1.5 - (decayedState.stability / 100)

  // 3. 应用情绪变化（考虑稳定性调制）
  const newState: EmotionState = {
    ...decayedState,
    valence: decayedState.valence + delta.valence * stabilityFactor,
    arousal: decayedState.arousal + delta.arousal * stabilityFactor,
    trust: decayedState.trust + delta.trust * stabilityFactor,
    affection: decayedState.affection + delta.affection * stabilityFactor,
    stability: decayedState.stability + delta.stability,
    lastUpdatedAt: now,
  }

  // 4. 裁剪到有效范围
  return clampEmotionState(newState)
}

/**
 * 应用时间衰减
 * 让情绪逐渐回到基线值
 */
export function applyTimeDecay(
  state: EmotionState,
  now: number = Date.now(),
): EmotionState {
  const timeDiff = now - state.lastUpdatedAt
  const timeDiffMinutes = timeDiff / (1000 * 60)

  // 如果时间间隔很小，不需要衰减
  if (timeDiffMinutes < 1)
    return state

  // 计算衰减因子（基于半衰期）
  // 经过一个半衰期，情绪会衰减到基线距离的一半
  const halfLife = state.decayHalfLifeMinutes
  const decayFactor = Math.pow(0.5, timeDiffMinutes / halfLife)

  // 对每个维度应用衰减：current = baseline + (current - baseline) * decayFactor
  const newValence = EMOTION_BASELINE.valence! + (state.valence - EMOTION_BASELINE.valence!) * decayFactor
  const newArousal = EMOTION_BASELINE.arousal! + (state.arousal - EMOTION_BASELINE.arousal!) * decayFactor
  const newTrust = EMOTION_BASELINE.trust! + (state.trust - EMOTION_BASELINE.trust!) * decayFactor
  const newAffection = EMOTION_BASELINE.affection! + (state.affection - EMOTION_BASELINE.affection!) * decayFactor

  // 稳定性不衰减，或者可以缓慢恢复
  const newStability = state.stability

  return {
    ...state,
    valence: newValence,
    arousal: newArousal,
    trust: newTrust,
    affection: newAffection,
    stability: newStability,
  }
}

/**
 * 创建新的情绪状态
 */
export function createEmotionState(overrides?: Partial<EmotionState>): EmotionState {
  return clampEmotionState({
    valence: 0,
    arousal: 20,
    trust: 50,
    affection: 50,
    stability: 70,
    lastUpdatedAt: Date.now(),
    decayHalfLifeMinutes: 180,
    ...overrides,
  })
}

/**
 * 重置情绪状态到默认值
 */
export function resetEmotionState(): EmotionState {
  return createEmotionState()
}

/**
 * 检查两个情绪状态是否相等（用于测试）
 */
export function emotionStateEquals(a: EmotionState, b: EmotionState, epsilon: number = 0.001): boolean {
  return (
    Math.abs(a.valence - b.valence) < epsilon
    && Math.abs(a.arousal - b.arousal) < epsilon
    && Math.abs(a.trust - b.trust) < epsilon
    && Math.abs(a.affection - b.affection) < epsilon
    && Math.abs(a.stability - b.stability) < epsilon
    && a.lastUpdatedAt === b.lastUpdatedAt
    && a.decayHalfLifeMinutes === b.decayHalfLifeMinutes
  )
}
