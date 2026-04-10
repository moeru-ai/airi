import { describe, expect, it } from 'vitest'

import { resolveConfig } from './engine'

describe('QueryEngine', () => {
  describe('resolveConfig', () => {
    it('uses defaults when no overrides or env vars', () => {
      const config = resolveConfig({
        apiKey: 'test-key',
      })
      expect(config.model).toBe('gpt-4o')
      expect(config.baseURL).toBe('https://api.openai.com/v1')
      expect(config.maxTurns).toBe(50)
      expect(config.maxToolCalls).toBe(200)
      expect(config.maxTokenBudget).toBe(500_000)
      expect(config.approvalMode).toBe('auto')
    })

    it('applies overrides over defaults', () => {
      const config = resolveConfig({
        model: 'claude-sonnet',
        apiKey: 'test-key',
        baseURL: 'https://custom.api.com/v1',
        maxTurns: 10,
        maxToolCalls: 50,
        maxTokenBudget: 100_000,
        approvalMode: 'per_mutation',
      })
      expect(config.model).toBe('claude-sonnet')
      expect(config.baseURL).toBe('https://custom.api.com/v1')
      expect(config.maxTurns).toBe(10)
      expect(config.maxToolCalls).toBe(50)
      expect(config.maxTokenBudget).toBe(100_000)
      expect(config.approvalMode).toBe('per_mutation')
    })

    it('passes through abort signal', () => {
      const controller = new AbortController()
      const config = resolveConfig({
        apiKey: 'test-key',
        abortSignal: controller.signal,
      })
      expect(config.abortSignal).toBe(controller.signal)
    })
  })
})
