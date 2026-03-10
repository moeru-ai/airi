import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

function getProviderValidators(options?: Parameters<typeof createOpenAICompatibleValidators>[0]) {
  const validators = createOpenAICompatibleValidators(options)

  return (validators?.validateProvider || []).map(create => create({
    t: (input: string) => input,
  } as any))
}

describe('createOpenAICompatibleValidators', () => {
  const config = {
    apiKey: 'test-key',
    baseUrl: 'https://example.com/v1/',
  }
  const provider = {
    model: () => ({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    }),
  }

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
      checks: ['connectivity'],
    })

    const result = await connectivityValidator.validator(config, provider as any, undefined as any, undefined as any)

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
      checks: ['connectivity'],
    })

    const result = await connectivityValidator.validator(config, provider as any, undefined as any, undefined as any)

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Connectivity check failed')
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('does not probe chat completions with a synthetic fallback model', async () => {
    listModelsMock.mockResolvedValue([])

    const [connectivityValidator, chatValidator] = getProviderValidators({
      checks: ['connectivity', 'chat_completions'],
    })

    const connectivityResult = await connectivityValidator.validator(config, provider as any, undefined as any, undefined as any)
    const chatResult = await chatValidator.validator(config, provider as any, undefined as any, undefined as any)

    // Connectivity passes via lightweight fetch (no model needed)
    expect(connectivityResult.valid).toBe(true)
    // Chat completions fails because no models available
    expect(chatResult.valid).toBe(false)
    expect(chatResult.reason).toContain('No model available for validation.')
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('allows providers to skip chat probing when they do not expose model listing', async () => {
    listModelsMock.mockResolvedValue([])

    const [connectivityValidator, chatValidator] = getProviderValidators({
      checks: ['connectivity', 'chat_completions'],
      allowValidationWithoutModel: true,
    })

    const connectivityResult = await connectivityValidator.validator(config, provider as any, undefined as any, undefined as any)
    const chatResult = await chatValidator.validator(config, provider as any, undefined as any, undefined as any)

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
