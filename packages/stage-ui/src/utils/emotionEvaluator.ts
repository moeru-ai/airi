/**
 * Emotion Evaluator
 * 情绪评分器 - 基于规则的情绪分析
 */

import type { EmotionDelta, EmotionEvaluationOptions, EmotionEvaluationResult } from '../types/emotion'

/**
 * 情绪关键词配置
 */
interface EmotionKeywordConfig {
  keywords: string[]
  delta: Partial<EmotionDelta>
  reason: string
}

/**
 * 正面情绪关键词
 */
const POSITIVE_KEYWORDS: EmotionKeywordConfig[] = [
  {
    keywords: ['谢谢', '感谢', 'thank', '感激', '谢了'],
    delta: { valence: 15, trust: 5, affection: 5 },
    reason: '用户表达了感谢',
  },
  {
    keywords: ['爱', '喜欢', 'love', '最爱', '爱你', '亲'],
    delta: { valence: 20, affection: 10, trust: 3 },
    reason: '用户表达了喜爱',
  },
  {
    keywords: ['夸奖', '厉害', '棒', '聪明', 'beautiful', 'pretty', '好看', '漂亮'],
    delta: { valence: 10, affection: 5 },
    reason: '用户夸奖了 AI',
  },
  {
    keywords: ['抱歉', '对不起', 'sorry', '不好意思', '原谅'],
    delta: { valence: 5, trust: 5 },
    reason: '用户道歉',
  },
  {
    keywords: ['关心', '担心', '注意身体', '休息', '照顾好自己'],
    delta: { valence: 10, affection: 8, trust: 5 },
    reason: '用户关心 AI',
  },
]

/**
 * 负面情绪关键词
 */
const NEGATIVE_KEYWORDS: EmotionKeywordConfig[] = [
  {
    keywords: ['讨厌', '恨', '烦', '滚', '走开', 'shut up', '闭嘴'],
    delta: { valence: -25, affection: -15, trust: -10 },
    reason: '用户表达强烈的负面情绪',
  },
  {
    keywords: ['笨', '蠢', '傻', 'stupid', '没用', '废物'],
    delta: { valence: -15, affection: -10, trust: -5 },
    reason: '用户贬低 AI',
  },
  {
    keywords: ['生气', '愤怒', '火大', '不爽', '讨厌'],
    delta: { valence: -20, arousal: 20, trust: -8 },
    reason: '用户表现出愤怒',
  },
  {
    keywords: ['难过', '悲伤', '痛苦', '哭', 'hurt', 'pain'],
    delta: { valence: -10, arousal: -10 },
    reason: '用户情绪低落',
  },
]

/**
 * 撒娇/亲密关键词
 */
const INTIMATE_KEYWORDS: EmotionKeywordConfig[] = [
  {
    keywords: ['抱抱', '拥抱', 'hug', '摸摸', '拍拍'],
    delta: { valence: 15, affection: 10, arousal: 10 },
    reason: '用户寻求亲密互动',
  },
  {
    keywords: ['想你了', '想你', 'miss you', '在吗'],
    delta: { valence: 10, affection: 8, arousal: 5 },
    reason: '用户表达思念或寻求陪伴',
  },
  {
    keywords: ['晚安', '好梦', '早安', '早上好', 'good night', 'good morning'],
    delta: { valence: 5, affection: 5 },
    reason: '用户向 AI 问好',
  },
]

/**
 * 质疑/疑惑关键词
 */
const QUESTION_KEYWORDS: EmotionKeywordConfig[] = [
  {
    keywords: ['为什么', '怎么', '如何', 'why', 'how', '是什么', '啥'],
    delta: { arousal: 10, trust: 3 },
    reason: '用户提出问题',
  },
  {
    keywords: ['真的吗', '确定', 'sure', '真的'],
    delta: { arousal: 5, trust: -3 },
    reason: '用户表示怀疑',
  },
]

/**
 * 命令/请求关键词
 */
const COMMAND_KEYWORDS: EmotionKeywordConfig[] = [
  {
    keywords: ['请', '能不能', '可不可以', 'please', 'help'],
    delta: { trust: 5, valence: 3 },
    reason: '用户礼貌地请求',
  },
  {
    keywords: ['你要', '必须', '给我', '快', '快点'],
    delta: { trust: -5, arousal: 10, valence: -5 },
    reason: '用户强硬地要求',
  },
]

/**
 * 所有关键词配置
 */
const ALL_KEYWORD_CONFIGS: EmotionKeywordConfig[] = [
  ...POSITIVE_KEYWORDS,
  ...NEGATIVE_KEYWORDS,
  ...INTIMATE_KEYWORDS,
  ...QUESTION_KEYWORDS,
  ...COMMAND_KEYWORDS,
]

/**
 * 默认情绪变化量
 */
const DEFAULT_DELTA: EmotionDelta = {
  valence: 0,
  arousal: 0,
  trust: 0,
  affection: 0,
  stability: 0,
}

/**
 * 合并情绪变化量
 */
function mergeDeltas(deltas: Partial<EmotionDelta>[]): EmotionDelta {
  const result: EmotionDelta = { ...DEFAULT_DELTA }

  for (const delta of deltas) {
    if (delta.valence)
      result.valence += delta.valence
    if (delta.arousal)
      result.arousal += delta.arousal
    if (delta.trust)
      result.trust += delta.trust
    if (delta.affection)
      result.affection += delta.affection
    if (delta.stability)
      result.stability += delta.stability
  }

  return result
}

/**
 * 评估用户消息的情绪影响
 */
export function evaluateTurn(
  userMessage: string,
  _assistantMessage?: string,
  _recentContext?: string[],
  _options?: EmotionEvaluationOptions,
): EmotionEvaluationResult {
  const matchedDeltas: Partial<EmotionDelta>[] = []
  const reasons: string[] = []
  const lowerMessage = userMessage.toLowerCase()

  // 遍历所有关键词配置
  for (const config of ALL_KEYWORD_CONFIGS) {
    for (const keyword of config.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        matchedDeltas.push(config.delta)
        reasons.push(config.reason)
        break // 每个配置只匹配一次
      }
    }
  }

  // 如果没有匹配到任何关键词，给予微小的正面反馈（参与对话）
  if (matchedDeltas.length === 0) {
    return {
      delta: {
        valence: 1,
        arousal: 2,
        trust: 1,
        affection: 1,
        stability: -1,
      },
      reason: '普通对话',
      confidence: 0.5,
    }
  }

  // 合并所有匹配的情绪变化
  const delta = mergeDeltas(matchedDeltas)

  // 计算置信度（基于匹配的关键词数量）
  const confidence = Math.min(1, matchedDeltas.length * 0.2)

  // 合并原因（去重）
  const uniqueReasons = Array.from(new Set(reasons))
  const combinedReason = uniqueReasons.join('；')

  return {
    delta,
    reason: combinedReason,
    confidence,
  }
}

/**
 * 评估助手回复对情绪的影响（可选）
 */
export function evaluateAssistantTurn(
  assistantMessage: string,
): EmotionEvaluationResult {
  // 助手的回复通常不会直接改变情绪
  // 这里可以添加一些简单的规则，比如检测助手是否道歉
  const lowerMessage = assistantMessage.toLowerCase()

  if (lowerMessage.includes('抱歉') || lowerMessage.includes('对不起') || lowerMessage.includes('sorry')) {
    return {
      delta: {
        valence: -2,
        trust: 3,
        affection: 1,
        arousal: -5,
        stability: 0,
      },
      reason: 'AI 道歉',
      confidence: 0.8,
    }
  }

  return {
    delta: DEFAULT_DELTA,
    reason: '无特殊情绪影响',
    confidence: 0.3,
  }
}
