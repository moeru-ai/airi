import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { providerOpenCodeGo } from './index'

describe('providerOpenCodeGo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses the OpenCode Go endpoint by default', () => {
    const schema = providerOpenCodeGo.createProviderConfig({ t: input => input })
    const config = z.parse(schema, { apiKey: 'test-key' })

    expect(config.baseUrl).toBe('https://opencode.ai/zen/go/v1/')
  })

  it('lists only models that support Chat Completions', async () => {
    const schema = providerOpenCodeGo.createProviderConfig({ t: input => input })
    const config = z.parse(schema, { apiKey: 'test-key' })
    const provider = providerOpenCodeGo.createProvider(config)
    const models = await providerOpenCodeGo.extraMethods?.listModels?.(config, provider)

    expect(models?.map(model => model.id)).toEqual([
      'opencode-go/grok-4.5',
      'opencode-go/glm-5.2',
      'opencode-go/glm-5.1',
      'opencode-go/kimi-k3',
      'opencode-go/kimi-k2.7-code',
      'opencode-go/kimi-k2.6',
      'opencode-go/deepseek-v4-pro',
      'opencode-go/deepseek-v4-flash',
      'opencode-go/mimo-v2.5',
      'opencode-go/mimo-v2.5-pro',
      'opencode-go/hy3',
    ])
    expect(models?.some(model => model.id === 'opencode-go/gpt-5.6-luna')).toBe(false)
    expect(models?.some(model => model.id === 'opencode-go/minimax-m3')).toBe(false)
  })

  it('validates through model metadata and the chat transport', () => {
    const validators = providerOpenCodeGo.validators?.validateProvider?.map(create => create({ t: input => input })) ?? []
    const ids = validators.map(validator => validator.id)
    const chatValidator = validators.find(validator => validator.id === 'openai-compatible:check-chat-completions')

    expect(ids).toContain('openai-compatible:check-model-list')
    expect(ids).toContain('openai-compatible:check-chat-completions')
    expect(ids).not.toContain('openai-compatible:check-connectivity')
    expect(chatValidator?.name).toContain('kimi-k3')
  })

  // https://github.com/moeru-ai/airi/pull/2237
  // ROOT CAUSE:
  //
  // Automatic settings validation skips the billable chat validator. The
  // remaining model-list validator used the local catalog, so it accepted an
  // invalid or revoked key without sending the key to OpenCode Go.
  it('rejects invalid credentials without running the chat validator', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const schema = providerOpenCodeGo.createProviderConfig({ t: input => input })
    const config = z.parse(schema, { apiKey: 'revoked-key' })
    const provider = providerOpenCodeGo.createProvider(config)
    const validators = providerOpenCodeGo.validators?.validateProvider?.map(create => create({ t: input => input })) ?? []
    const automaticValidators = validators.filter(validator => validator.id !== 'openai-compatible:check-chat-completions')
    const results = await Promise.all(automaticValidators.map(validator => validator.validator(
      config,
      provider,
      providerOpenCodeGo.extraMethods ?? {},
      { t: input => input },
    )))

    expect(results.some(result => !result.valid)).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://opencode.ai/zen/go/v1/chat/completions'),
      expect.objectContaining({
        body: JSON.stringify({
          model: 'airi-credential-check-model-does-not-exist',
          messages: [{ role: 'user', content: 'credential check' }],
          max_tokens: 1,
          stream: false,
        }),
        headers: expect.objectContaining({ Authorization: 'Bearer revoked-key' }),
        method: 'POST',
      }),
    )
  })

  it('accepts a key that reaches request validation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const schema = providerOpenCodeGo.createProviderConfig({ t: input => input })
    const config = z.parse(schema, { apiKey: 'valid-key' })
    const provider = providerOpenCodeGo.createProvider(config)
    const credentialValidator = providerOpenCodeGo.validators?.validateProvider
      ?.map(create => create({ t: input => input }))
      .find(validator => validator.id === 'opencode-go:check-credentials')
    const result = await credentialValidator?.validator(
      config,
      provider,
      providerOpenCodeGo.extraMethods ?? {},
      { t: input => input },
    )

    expect(result?.valid).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('removes the provider prefix before it creates a chat request', () => {
    const schema = providerOpenCodeGo.createProviderConfig({ t: input => input })
    const config = z.parse(schema, { apiKey: 'test-key' })
    const provider = providerOpenCodeGo.createProvider(config)
    if (!('chat' in provider))
      throw new Error('OpenCode Go did not create a chat provider.')

    const request = provider.chat('opencode-go/kimi-k3')

    expect(request.model).toBe('kimi-k3')
  })
})
