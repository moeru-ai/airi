import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderExtraMethods, ProviderInstance } from '../types'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderValidationCheck } from '../types'
import { createOpenAICompatibleValidators } from './openai-compatible'

const {
  generateTextMock,
  listModelsMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  listModelsMock: vi.fn(),
}))

vi.mock('@xsai/generate-text', () => ({
  generateText: generateTextMock,
}))

vi.mock('@xsai/model', () => ({
  listModels: listModelsMock,
}))

const mockT = vi.fn((key: string) => key) as unknown as ComposerTranslation

function getProviderValidators(options?: Parameters<typeof createOpenAICompatibleValidators>[0]) {
  const validators = createOpenAICompatibleValidators(options)

  return (validators?.validateProvider || []).map(create => create({ t: mockT }))
}

interface TestConfig { apiKey?: string, baseUrl?: string }

describe('createOpenAICompatibleValidators', () => {
  const config: TestConfig = {
    apiKey: 'test-key',
    baseUrl: 'https://example.com/v1/',
  }
  const provider: ProviderInstance = {
    model: () => ({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    }),
  } as ProviderInstance
  const providerExtra: ProviderExtraMethods<TestConfig> = {}

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connectivity check uses lightweight fetch instead of generateText', async () => {
    const [connectivityValidator] = getProviderValidators({
      checks: [ProviderValidationCheck.Connectivity],
    })

    const result = await connectivityValidator.validator(config, provider, providerExtra, { t: mockT })

    expect(result.valid).toBe(true)
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/models',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('connectivity check fails on network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    const [connectivityValidator] = getProviderValidators({
      checks: [ProviderValidationCheck.Connectivity],
    })

    const result = await connectivityValidator.validator(config, provider, providerExtra, { t: mockT })

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Connectivity check failed')
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('does not probe chat completions with a synthetic fallback model', async () => {
    listModelsMock.mockResolvedValue([])

    const [connectivityValidator, chatValidator] = getProviderValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ChatCompletions],
    })

    const connectivityResult = await connectivityValidator.validator(config, provider, providerExtra, { t: mockT })
    const chatResult = await chatValidator.validator(config, provider, providerExtra, { t: mockT })

    expect(connectivityResult.valid).toBe(true)
    expect(chatResult.valid).toBe(false)
    expect(chatResult.reason).toContain('No model available for validation.')
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('allows providers to skip chat probing when they do not expose model listing', async () => {
    listModelsMock.mockResolvedValue([])

    const [connectivityValidator, chatValidator] = getProviderValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ChatCompletions],
      allowValidationWithoutModel: true,
    })

    const connectivityResult = await connectivityValidator.validator(config, provider, providerExtra, { t: mockT })
    const chatResult = await chatValidator.validator(config, provider, providerExtra, { t: mockT })

    expect(connectivityResult.valid).toBe(true)
    expect(chatResult.valid).toBe(true)
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('default checks do not include chat_completions', () => {
    const validators = getProviderValidators()
    const ids = validators.map(v => v.id)

    expect(ids).toContain('openai-compatible:check-connectivity')
    expect(ids).toContain('openai-compatible:check-model-list')
    expect(ids).not.toContain('openai-compatible:check-chat-completions')
  })
})
