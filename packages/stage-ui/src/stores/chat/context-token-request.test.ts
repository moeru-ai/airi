import type { GenerationRequest } from '@proj-airi/provider-inference'

import { describe, expect, it, vi } from 'vitest'

import { selectContextTokenCounter } from './context-token-request'

function request(protocol: GenerationRequest['protocol'], fetchImpl: typeof fetch, baseURL = 'https://api.example.com/v1'): GenerationRequest {
  if (protocol === 'responses') {
    return {
      protocol,
      webSearch: false,
      config: {
        apiKey: 'test-key',
        baseURL,
        model: 'gpt-test',
        fetch: fetchImpl,
      },
    }
  }
  return {
    protocol: 'chat-completions',
    config: {
      apiKey: 'test-key',
      baseURL,
      model: 'gpt-test',
      fetch: fetchImpl,
    },
  } as GenerationRequest
}

describe('selectContextTokenCounter', () => {
  it('counts OpenAI Responses input and skips OpenAI-compatible chat', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ input_tokens: 4 }), { status: 200 }))
    const responses = selectContextTokenCounter({
      providerId: 'openai',
      model: 'gpt-test',
      request: request('responses', fetchImpl),
    })
    const compatible = selectContextTokenCounter({
      providerId: 'openai-compatible',
      model: 'gpt-test',
      request: request('chat-completions', fetchImpl),
    })
    const chat = selectContextTokenCounter({
      providerId: 'openai',
      model: 'gpt-test',
      request: request('chat-completions', fetchImpl),
    })

    await expect(responses?.countInputTokens({ input: [{ role: 'user', content: 'hello' }] })).resolves.toBe(4)
    expect(responses?.capability).toBe('openai-responses-input-tokens')
    expect(compatible).toBeUndefined()
    expect(chat).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('selects Anthropic and Gemini counters and skips a request without an API key', () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    expect(selectContextTokenCounter({
      providerId: 'anthropic',
      model: 'claude-test',
      request: request('chat-completions', fetchImpl, 'https://api.example.com'),
    })?.capability).toBe('anthropic-messages-count-tokens')
    expect(selectContextTokenCounter({
      providerId: 'google-generative-ai',
      model: 'gemini-test',
      request: request('chat-completions', fetchImpl, 'https://generativelanguage.example/v1beta'),
    })?.capability).toBe('gemini-count-tokens')
    expect(selectContextTokenCounter({
      providerId: 'anthropic',
      model: 'claude-test',
      request: {
        protocol: 'chat-completions',
        config: { model: 'claude-test' },
      } as GenerationRequest,
    })).toBeUndefined()
  })
})
