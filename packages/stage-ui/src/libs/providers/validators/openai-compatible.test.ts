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

  it('treats a 400 chat completions response as passing, matching xsai APICallError shape', async () => {
    // ROOT CAUSE:
    //
    // extractStatusCode() only looked for the HTTP status under
    // `error.cause.status` / `error.cause.statusCode` / `error.cause.response.status`.
    // @xsai/shared's APICallError (thrown by generateText on a non-ok response)
    // sets `statusCode` and `response` directly on the error instance instead —
    // `error.cause` is unrelated (it's the Error `cause` option, unset here).
    //
    // Before the fix: extractStatusCode(apiCallError) always returned null, so
    // the deliberate "a 400 means auth/connectivity are fine, the probe request
    // was just malformed" heuristic in runChatCheck() never fired, and any
    // provider returning 400 to the validation ping (e.g. OpenRouter rejecting
    // `max_tokens: 1` for a model with a higher minimum) failed the whole
    // chat-completions check even though the provider/key were working.
    //
    // Fixed by checking `error.statusCode` / `error.status` / `error.response.status`
    // directly, before falling back to the `.cause`-nested variants.
    listModelsMock.mockResolvedValue([{ id: 'some/model' }])

    const response = new Response('{"error":{"message":"bad request"}}', { status: 400 })
    const apiCallError = Object.assign(new Error('Remote sent 400 response'), {
      statusCode: response.status,
      response,
    })
    generateTextMock.mockRejectedValue(apiCallError)

    const [, chatValidator] = getProviderValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ChatCompletions],
    })

    const result = await chatValidator.validator(config, provider, providerExtra, { t: mockT })

    expect(result.valid).toBe(true)
  })

  it('normalizes the selected model id before chat probing', async () => {
    listModelsMock.mockResolvedValue([
      { id: 'byteplus/seed-2-0-pro-260328' },
    ])

    const [, chatValidator] = getProviderValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ChatCompletions],
      normalizeModelId: modelId => modelId.replace(/^byteplus\//, ''),
    })

    const result = await chatValidator.validator(config, provider, providerExtra, { t: mockT })

    expect(result.valid).toBe(true)
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'seed-2-0-pro-260328',
    }))
  })
})
