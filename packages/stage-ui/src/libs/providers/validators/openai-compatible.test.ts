import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not probe chat completions with a synthetic fallback model', async () => {
    listModelsMock.mockResolvedValue([])

    const [connectivityValidator, chatValidator] = getProviderValidators({
      checks: ['connectivity', 'chat_completions'],
    })

    const connectivityResult = await connectivityValidator.validator(config, provider as any, undefined as any, undefined as any)
    const chatResult = await chatValidator.validator(config, provider as any, undefined as any, undefined as any)

    expect(connectivityResult.valid).toBe(false)
    expect(connectivityResult.reason).toContain('No model available for validation.')
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
})
