import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { providerOpenCodeGo } from './index'

describe('providerOpenCodeGo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('validates through model metadata and the proxied chat transport', () => {
    const validators = providerOpenCodeGo.validators?.validateProvider?.map(create => create({ t: input => input })) ?? []
    const ids = validators.map(validator => validator.id)
    const chatValidator = validators.find(validator => validator.id === 'openai-compatible:check-chat-completions')

    expect(ids).toContain('openai-compatible:check-model-list')
    expect(ids).toContain('openai-compatible:check-chat-completions')
    expect(ids).not.toContain('openai-compatible:check-connectivity')
    expect(chatValidator?.name).toContain('kimi-k3')
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

  it('routes the default endpoint through the fixed OpenCode Go proxy', async () => {
    // ROOT CAUSE:
    //
    // OpenCode Go returned CORS headers for OPTIONS but omitted them from the
    // actual API response. Browser fetch rejected validation and chat before
    // AIRI could read the response. The provider now uses AIRI's fixed-target
    // proxy for the default endpoint.
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    const schema = providerOpenCodeGo.createProviderConfig({ t: input => input })
    const config = z.parse(schema, { apiKey: 'test-key' })
    const provider = providerOpenCodeGo.createProvider(config)
    if (!('chat' in provider))
      throw new Error('OpenCode Go did not create a chat provider.')

    const request = provider.chat('opencode-go/kimi-k3')
    await request.fetch?.(new URL('https://opencode.ai/zen/go/v1/chat/completions'), {
      headers: { Authorization: 'Bearer test-key' },
      method: 'POST',
    })

    const [input, init] = fetchMock.mock.calls[0]
    expect(String(input)).toContain('/api/v1/provider-proxy/opencode-go/chat/completions')
    expect(String(input)).not.toContain('opencode.ai/zen/go')
    expect(init).toEqual(expect.objectContaining({ method: 'POST' }))
  })

  it('keeps custom endpoints direct', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    const schema = providerOpenCodeGo.createProviderConfig({ t: input => input })
    const config = z.parse(schema, {
      apiKey: 'test-key',
      baseUrl: 'https://gateway.example/v1/',
    })
    const provider = providerOpenCodeGo.createProvider(config)
    if (!('chat' in provider))
      throw new Error('OpenCode Go did not create a chat provider.')

    const request = provider.chat('opencode-go/kimi-k3')
    await request.fetch?.(new URL('https://gateway.example/v1/chat/completions'), {})

    expect(fetchMock).toHaveBeenCalledWith(new URL('https://gateway.example/v1/chat/completions'), {})
  })
})
