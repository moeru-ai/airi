import { describe, expect, it, vi } from 'vitest'

import { createAnthropicTokenCounter, createGeminiTokenCounter, createOpenAiInputTokenCounter, toAnthropicCountBody, toGeminiCountBody, toOpenAiInputTokenBody } from './context-token-counters'

const chatPayload = {
  messages: [
    { role: 'system', content: 'Stay on the task.' },
    { role: 'user', content: '看图并读取状态' },
    { role: 'assistant', content: 'I will read it.', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'observe', arguments: '{"id":"window-1"}' } }] },
    { role: 'tool', tool_call_id: 'call-1', content: '{"status":"delivered","receipt":"window-1"}' },
  ],
  tools: [{ type: 'function', function: { name: 'observe', description: 'Read the desktop', parameters: { type: 'object' } } }],
}

describe('provider token count bodies', () => {
  it('passes a Responses input through and rejects a chat payload for OpenAI', () => {
    expect(toOpenAiInputTokenBody('gpt-test', { input: [{ role: 'user' }], tools: [] })).toMatchObject({
      model: 'gpt-test',
      input: [{ role: 'user' }],
    })
    expect(toOpenAiInputTokenBody('gpt-test', chatPayload)).toBeUndefined()
  })

  it('keeps the system prompt, tool schema, and tool receipt in the Anthropic body', () => {
    const body = toAnthropicCountBody('claude-test', chatPayload)

    expect(body).toMatchObject({
      model: 'claude-test',
      system: 'Stay on the task.',
      tools: [{ name: 'observe' }],
    })
    expect(JSON.stringify(body)).toContain('window-1')
    expect(JSON.stringify(body)).toContain('看图并读取状态')
  })

  it('returns undefined for an image the Anthropic body cannot represent', () => {
    expect(toAnthropicCountBody('claude-test', {
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }],
    })).toBeUndefined()
    expect(toGeminiCountBody({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }],
    })).toBeUndefined()
  })
})

describe('provider token counters', () => {
  it('posts the projected payload to the provider count endpoint', async () => {
    const calls: { url: string, body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      const urlText = String(url)
      const body = urlText.includes('countTokens') ? { totalTokens: 11 } : { input_tokens: 11 }
      return new Response(JSON.stringify(body), { status: 200 })
    })

    await expect(createOpenAiInputTokenCounter({
      fetch: fetchImpl,
      apiKey: 'test-key',
      baseURL: 'https://api.example.com/v1',
      model: 'gpt-test',
    }).countInputTokens({ input: [{ role: 'user', content: 'hello' }] })).resolves.toBe(11)
    await expect(createAnthropicTokenCounter({
      fetch: fetchImpl,
      apiKey: 'test-key',
      baseURL: 'https://api.example.com',
      model: 'claude-test',
    }).countInputTokens(chatPayload)).resolves.toBe(11)
    await expect(createGeminiTokenCounter({
      fetch: fetchImpl,
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.example/v1beta',
      model: 'gemini-test',
    }).countInputTokens(chatPayload)).resolves.toBe(11)

    expect(calls.map(call => call.url)).toEqual([
      'https://api.example.com/v1/responses/input_tokens',
      'https://api.example.com/v1/messages/count_tokens',
      'https://generativelanguage.example/v1beta/models/gemini-test:countTokens',
    ])
    expect(JSON.stringify(calls[1]?.body)).toContain('window-1')
    expect(calls[0]?.body).toMatchObject({ model: 'gpt-test' })
  })
})
