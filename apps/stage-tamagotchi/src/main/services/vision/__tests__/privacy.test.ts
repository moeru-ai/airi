/**
 * 隐私保护服务单元测试
 */

import type { PrivacyConfig } from '../privacy'

import { describe, expect, it } from 'vitest'

import {
  containsSensitiveInfo,
  DEFAULT_PRIVACY_CONFIG,
  detectSensitiveInfo,
  maskSensitiveInfo,

  protectPrivacy,
} from '../privacy'

describe('privacy Service', () => {
  const defaultConfig: PrivacyConfig = DEFAULT_PRIVACY_CONFIG

  describe('detectSensitiveInfo', () => {
    it('should detect email addresses', () => {
      const text = 'Contact me at user@example.com for more info'
      const detected = detectSensitiveInfo(text, defaultConfig)

      expect(detected).toHaveLength(1)
      expect(detected[0].type).toBe('email')
      expect(detected[0].value).toBe('user@example.com')
    })

    it('should detect phone numbers', () => {
      const text = 'My phone number is 13812345678'
      const detected = detectSensitiveInfo(text, defaultConfig)

      expect(detected.length).toBeGreaterThan(0)
      expect(detected.some(d => d.type === 'phone')).toBe(true)
    })

    it('should detect API keys', () => {
      const text = 'api_key: abcdefghijklmnop123456789'
      const detected = detectSensitiveInfo(text, defaultConfig)

      expect(detected.length).toBeGreaterThan(0)
      expect(detected.some(d => d.type === 'apiKey')).toBe(true)
    })

    it('should detect passwords', () => {
      const text = 'password: mySecretPassword123'
      const detected = detectSensitiveInfo(text, defaultConfig)

      expect(detected.length).toBeGreaterThan(0)
      expect(detected.some(d => d.type === 'password')).toBe(true)
    })

    it('should return empty array when privacy is disabled', () => {
      const text = 'Contact me at user@example.com'
      const config = { ...defaultConfig, enabled: false }
      const detected = detectSensitiveInfo(text, config)

      expect(detected).toHaveLength(0)
    })

    it('should detect multiple types in one text', () => {
      const text = `
        Email: user@example.com
        Phone: 13812345678
        Password: secret123
      `
      const detected = detectSensitiveInfo(text, defaultConfig)

      expect(detected.length).toBeGreaterThanOrEqual(3)
      expect(detected.some(d => d.type === 'email')).toBe(true)
      expect(detected.some(d => d.type === 'phone')).toBe(true)
      expect(detected.some(d => d.type === 'password')).toBe(true)
    })
  })

  describe('maskSensitiveInfo', () => {
    it('should mask email addresses', () => {
      const text = 'Contact me at user@example.com'
      const detected = detectSensitiveInfo(text, defaultConfig)
      const masked = maskSensitiveInfo(text, detected, defaultConfig)

      expect(masked).not.toContain('user@example.com')
      expect(masked).toContain('**')
    })

    it('should mask phone numbers', () => {
      const text = 'Phone: 13812345678'
      const detected = detectSensitiveInfo(text, defaultConfig)
      const masked = maskSensitiveInfo(text, detected, defaultConfig)

      expect(masked).not.toContain('13812345678')
    })

    it('should use remove mode when configured', () => {
      const text = 'Email: user@example.com'
      const detected = detectSensitiveInfo(text, defaultConfig)
      const config = { ...defaultConfig, maskMode: 'remove' as const }
      const masked = maskSensitiveInfo(text, detected, config)

      expect(masked).toContain('[REMOVED]')
      expect(masked).not.toContain('user@example.com')
    })

    it('should use hash mode when configured', () => {
      const text = 'Email: user@example.com'
      const detected = detectSensitiveInfo(text, defaultConfig)
      const config = { ...defaultConfig, maskMode: 'hash' as const }
      const masked = maskSensitiveInfo(text, detected, config)

      expect(masked).toContain('[HASH:')
      expect(masked).not.toContain('user@example.com')
    })

    it('should respect custom mask settings', () => {
      const text = 'Email: user@example.com'
      const detected = detectSensitiveInfo(text, defaultConfig)
      const config = {
        ...defaultConfig,
        maskKeepPrefix: 3,
        maskKeepSuffix: 3,
        maskChar: '#',
      }
      const masked = maskSensitiveInfo(text, detected, config)

      expect(masked).toContain('use')
      expect(masked).toContain('com')
      expect(masked).toContain('###')
    })
  })

  describe('protectPrivacy', () => {
    it('should return sanitized text and detection info', () => {
      const text = 'Email: user@example.com, Phone: 13812345678'
      const result = protectPrivacy(text, defaultConfig)

      expect(result.sanitized).not.toContain('user@example.com')
      expect(result.detected.length).toBeGreaterThanOrEqual(2)
      expect(Object.keys(result.stats).length).toBeGreaterThan(0)
    })

    it('should handle text without sensitive info', () => {
      const text = 'This is a normal text without any sensitive information'
      const result = protectPrivacy(text, defaultConfig)

      expect(result.sanitized).toBe(text)
      expect(result.detected).toHaveLength(0)
      expect(Object.keys(result.stats)).toHaveLength(0)
    })
  })

  describe('containsSensitiveInfo', () => {
    it('should return true for text with sensitive info', () => {
      const text = 'Email: user@example.com'
      expect(containsSensitiveInfo(text, defaultConfig)).toBe(true)
    })

    it('should return false for text without sensitive info', () => {
      const text = 'This is a normal text'
      expect(containsSensitiveInfo(text, defaultConfig)).toBe(false)
    })
  })

  describe('custom sensitive words', () => {
    it('should detect custom sensitive words', () => {
      const text = 'The secret code is ABC123XYZ'
      const config = {
        ...defaultConfig,
        customSensitiveWords: ['ABC123XYZ'],
      }
      const detected = detectSensitiveInfo(text, config)

      expect(detected.some(d => d.value === 'ABC123XYZ')).toBe(true)
    })

    it('should detect multiple custom words', () => {
      const text = 'Keywords: SECRET1 and SECRET2 here'
      const config = {
        ...defaultConfig,
        customSensitiveWords: ['SECRET1', 'SECRET2'],
      }
      const detected = detectSensitiveInfo(text, config)

      expect(detected.filter(d => d.value === 'SECRET1' || d.value === 'SECRET2')).toHaveLength(2)
    })
  })

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const detected = detectSensitiveInfo('', defaultConfig)
      expect(detected).toHaveLength(0)
    })

    it('should handle very long text', () => {
      const text = 'Email: user@example.com '.repeat(1000)
      const detected = detectSensitiveInfo(text, defaultConfig)
      expect(detected.length).toBeGreaterThan(0)
    })

    it('should handle overlapping patterns', () => {
      // 测试重叠检测时保留置信度高的
      const text = 'Contact: test@example.com'
      const detected = detectSensitiveInfo(text, defaultConfig)

      // 应该只有一个检测结果（邮箱）
      const emails = detected.filter(d => d.type === 'email')
      expect(emails.length).toBeLessThanOrEqual(1)
    })
  })
})
