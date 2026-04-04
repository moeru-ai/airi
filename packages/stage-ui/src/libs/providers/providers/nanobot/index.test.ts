import { describe, expect, it } from 'vitest'

import { providerNanobot } from './index'
import {
  buildNanobotSessionId,
  resolveNanobotApiBaseUrl,
  resolveNanobotHealthUrl,
} from './shared'

describe('providerNanobot shared helpers', () => {
  it('normalizes API and health URLs', () => {
    expect(resolveNanobotApiBaseUrl('http://127.0.0.1:8900')).toBe('http://127.0.0.1:8900/v1')
    expect(resolveNanobotApiBaseUrl('http://127.0.0.1:8900/v1')).toBe('http://127.0.0.1:8900/v1')
    expect(resolveNanobotHealthUrl('http://127.0.0.1:8900/v1')).toBe('http://127.0.0.1:8900/health')
  })

  it('builds stable session ids', () => {
    expect(buildNanobotSessionId({
      fallbackSessionId: 'session-1',
      platform: 'desktop',
      sessionIdStrategy: 'auto',
    })).toBe('airi:desktop:session-1')

    expect(buildNanobotSessionId({
      fallbackSessionId: 'session-1',
      platform: 'desktop',
      sessionId: 'manual-room',
      sessionIdStrategy: 'manual',
    })).toBe('manual-room')
  })
})

describe('providerNanobot validators and model listing', () => {
  it('validates required config and manual session rules', async () => {
    const validatorFactory = providerNanobot.validators?.validateConfig?.[0]
    expect(validatorFactory).toBeDefined()

    const validator = validatorFactory!({ t: input => input })
    const invalid = await validator.validator({
      apiKey: '',
      baseUrl: 'http://127.0.0.1:8900/v1',
      model: '',
      sessionIdStrategy: 'manual',
      sessionId: '',
    } as any, { t: input => input })

    expect(invalid.valid).toBe(false)
    expect(invalid.reason).toContain('API key is required.')
    expect(invalid.reason).toContain('Session ID is required when session ID strategy is manual.')
  })

  it('surfaces the configured model when listing models', async () => {
    const config = {
      apiKey: 'dummy',
      baseUrl: 'http://127.0.0.1:8900/v1',
      model: 'gemma-4-26B-A4B-it-Q4_K_M.gguf',
      sessionIdStrategy: 'auto',
    } as const

    const provider = providerNanobot.createProvider(config)
    const models = await providerNanobot.extraMethods?.listModels?.(config, provider)

    expect(models).toEqual([
      expect.objectContaining({
        id: 'gemma-4-26B-A4B-it-Q4_K_M.gguf',
        provider: 'nanobot',
      }),
    ])
  })
})
