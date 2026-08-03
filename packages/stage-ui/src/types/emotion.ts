/**
 * Emotion System Types
 * 情绪系统类型定义
 */

/**
 * 情绪状态
 * 按会话/用户维度存储
 */
export interface EmotionState {
  /**
   * 愉悦度/正负情绪 [-100, 100]
   * 负值表示负面情绪（生气、悲伤），正值表示正面情绪（开心、满足）
   */
  valence: number

  /**
   * 唤醒度/激动程度 [0, 100]
   * 低值表示平静、放松，高值表示激动、紧张
   */
  arousal: number

  /**
   * 信任度 [0, 100]
   * 用户与 AI 之间的信任程度
   */
  trust: number

  /**
   * 好感度 [0, 100]
   * AI 对用户的喜爱程度
   */
  affection: number

  /**
   * 稳定性 [0, 100]
   * 情绪稳定性，越低越容易波动
   */
  stability: number

  /**
   * 最后更新时间戳
   */
  lastUpdatedAt: number

  /**
   * 衰减半衰期（分钟）
   * 用于随时间回落情绪
   */
  decayHalfLifeMinutes: number
}

/**
 * 情绪变化量
 */
export interface EmotionDelta {
  valence: number
  arousal: number
  trust: number
  affection: number
  stability: number
}

/**
 * 情绪事件记录
 */
export interface EmotionEvent {
  id: string
  sessionId: string
  timestamp: number
  delta: EmotionDelta
  reason: string
  messageId?: string
}

/**
 * 情绪评分结果
 */
export interface EmotionEvaluationResult {
  delta: EmotionDelta
  reason: string
  confidence: number
}

/**
 * 情绪评分选项
 */
export interface EmotionEvaluationOptions {
  /**
   * 是否使用 LLM 评分器（如果可用）
   * 默认 false，仅使用规则评分
   */
  useLLMScorer?: boolean

  /**
   * 最近的上下文消息数量
   * 用于更好的情绪分析
   */
  recentContextCount?: number
}

/**
 * 默认情绪状态
 */
export const DEFAULT_EMOTION_STATE: EmotionState = {
  valence: 0,
  arousal: 20,
  trust: 50,
  affection: 50,
  stability: 70,
  lastUpdatedAt: Date.now(),
  decayHalfLifeMinutes: 180,
}

/**
 * 情绪基线值（衰减后回落到的值）
 */
export const EMOTION_BASELINE: Partial<EmotionState> = {
  valence: 0,
  arousal: 20,
  trust: 50,
  affection: 50,
  stability: 70,
}

/**
 * 裁剪数值到指定范围
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 裁剪情绪状态到有效范围
 */
export function clampEmotionState(state: EmotionState): EmotionState {
  return {
    ...state,
    valence: clamp(state.valence, -100, 100),
    arousal: clamp(state.arousal, 0, 100),
    trust: clamp(state.trust, 0, 100),
    affection: clamp(state.affection, 0, 100),
    stability: clamp(state.stability, 0, 100),
    lastUpdatedAt: state.lastUpdatedAt,
    decayHalfLifeMinutes: Math.max(1, state.decayHalfLifeMinutes),
  }
}

/**
 * 生成情绪状态的人类可读摘要
 */
export function summarizeEmotionState(state: EmotionState): string {
  const parts: string[] = []

  // 愉悦度描述
  if (state.valence > 50)
    parts.push('非常开心愉悦')
  else if (state.valence > 20)
    parts.push('心情不错')
  else if (state.valence < -50)
    parts.push('非常难过或生气')
  else if (state.valence < -20)
    parts.push('心情低落')
  else
    parts.push('情绪平静')

  // 唤醒度描述
  if (state.arousal > 70)
    parts.push('非常激动')
  else if (state.arousal > 40)
    parts.push('比较活跃')
  else if (state.arousal < 20)
    parts.push('很放松')

  // 信任度描述
  if (state.trust > 70)
    parts.push('非常信任用户')
  else if (state.trust < 30)
    parts.push('对用户不太信任')

  // 好感度描述
  if (state.affection > 70)
    parts.push('对用户很有好感')
  else if (state.affection < 30)
    parts.push('对用户有些疏远')

  // 稳定性描述
  if (state.stability < 30)
    parts.push('情绪容易波动')
  else if (state.stability > 70)
    parts.push('情绪很稳定')

  return parts.join('，')
}
