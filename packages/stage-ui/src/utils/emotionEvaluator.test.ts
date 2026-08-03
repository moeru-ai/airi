/**
 * Emotion Evaluator Tests
 * 情绪评分器测试
 */

import { describe, expect, it } from 'vitest'
import { evaluateTurn } from './emotionEvaluator'

describe('emotionEvaluator', () => {
  describe('evaluateTurn', () => {
    it('应该检测到感谢的正面情绪', () => {
      const result = evaluateTurn('谢谢你的帮助！')

      expect(result.delta.valence).toBeGreaterThan(0)
      expect(result.delta.trust).toBeGreaterThan(0)
      expect(result.reason).toContain('感谢')
    })

    it('应该检测到喜爱的正面情绪', () => {
      const result = evaluateTurn('我最喜欢你了！')

      expect(result.delta.valence).toBeGreaterThan(10)
      expect(result.delta.affection).toBeGreaterThan(5)
      expect(result.reason).toContain('喜爱')
    })

    it('应该检测到夸奖的正面情绪', () => {
      const result = evaluateTurn('你真聪明！')

      expect(result.delta.valence).toBeGreaterThan(0)
      expect(result.reason).toContain('夸奖')
    })

    it('应该检测到道歉的轻微正面情绪', () => {
      const result = evaluateTurn('对不起，我刚才太粗鲁了')

      expect(result.delta.valence).toBeGreaterThan(0)
      expect(result.reason).toContain('道歉')
    })

    it('应该检测到关心的正面情绪', () => {
      const result = evaluateTurn('你要注意身体，早点休息')

      expect(result.delta.valence).toBeGreaterThan(0)
      expect(result.delta.affection).toBeGreaterThan(0)
      expect(result.reason).toContain('关心')
    })

    it('应该检测到愤怒的负面情绪', () => {
      const result = evaluateTurn('你真的很烦！')

      expect(result.delta.valence).toBeLessThan(-10)
      expect(result.reason).toContain('负面情绪')
    })

    it('应该检测到贬低的负面情绪', () => {
      const result = evaluateTurn('你好笨啊')

      expect(result.delta.valence).toBeLessThan(0)
      expect(result.delta.affection).toBeLessThan(0)
    })

    it('应该检测到撒娇/亲密的正面情绪', () => {
      const result = evaluateTurn('抱抱我~')

      expect(result.delta.valence).toBeGreaterThan(0)
      expect(result.delta.affection).toBeGreaterThan(0)
      expect(result.reason).toContain('亲密')
    })

    it('应该检测到问题的疑惑情绪', () => {
      const result = evaluateTurn('为什么会这样？')

      expect(result.delta.arousal).toBeGreaterThan(0)
      expect(result.reason).toContain('问题')
    })

    it('应该检测到礼貌请求的正面情绪', () => {
      const result = evaluateTurn('请帮帮我，好吗？')

      expect(result.delta.trust).toBeGreaterThan(0)
      expect(result.reason).toContain('请求')
    })

    it('应该检测到强硬要求的负面情绪', () => {
      const result = evaluateTurn('快点帮我做这个！')

      expect(result.delta.trust).toBeLessThan(0)
      expect(result.reason).toContain('要求')
    })

    it('应该对普通对话给予微小正面反馈', () => {
      const result = evaluateTurn('今天天气不错')

      expect(result.delta.valence).toBe(1)
      expect(result.delta.arousal).toBe(2)
      expect(result.reason).toBe('普通对话')
    })

    it('应该忽略大小写', () => {
      const result1 = evaluateTurn('Thank you')
      const result2 = evaluateTurn('THANK YOU')

      expect(result1.reason).toBe(result2.reason)
    })

    it('应该匹配多个关键词并累加效果', () => {
      const result = evaluateTurn('谢谢你的帮助，我很喜欢你！')

      expect(result.reason).toContain('；')
      expect(Math.abs(result.delta.valence)).toBeGreaterThan(15)
    })

    it('应该有合理的置信度', () => {
      const result1 = evaluateTurn('谢谢') // 单个关键词
      const result2 = evaluateTurn('谢谢你的帮助，我很喜欢你，抱抱我~') // 多个关键词

      expect(result1.confidence).toBeLessThan(result2.confidence)
      expect(result2.confidence).toBeLessThanOrEqual(1.0)
    })
  })
})
