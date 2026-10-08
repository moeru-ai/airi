import type { GenerationProvider } from '@proj-airi/provider-inference'

import { describe, expect, it } from 'vitest'

import { streamFrom } from './llm-service'

describe.each(['chat-completions', 'responses'] as const)('%s output token limit', (protocol) => {
  const tokenField = protocol === 'responses' ? 'max_output_tokens' : 'max_tokens'

  function createProvider(requests: Record<string, unknown>[], toolRounds = 0): GenerationProvider {
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      const callsTool = requests.length <= toolRounds
      const output = callsTool
        ? [{ type: 'function_call', call_id: `call-${requests.length}`, name: 'update_limit', arguments: '{}' }]
        : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done.' }] }]
      const events = protocol === 'responses'
        ? [...output.map(item => ({ type: 'response.output_item.done', item })), {
            type: 'response.completed',
            response: {
              output,
            },
          }]
        : [{ choices: [{
            index: 0,
            delta: callsTool
              ? { tool_calls: [{ index: 0, id: `call-${requests.length}`, type: 'function', function: { name: 'update_limit', arguments: '{}' } }] }
              : { content: 'Done.' },
            finish_reason: callsTool ? 'tool_calls' : 'stop',
          }] }]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return {
      generation: model => protocol === 'responses'
        ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.test/v1/', fetch } }
        : { protocol, config: { model, baseURL: 'https://example.test/v1/', fetch } },
    }
  }

  // ROOT CAUSE:
  //
  // StreamOptions cannot carry an output limit to either protocol adapter.
  // Forward the caller's limit under the protocol's own wire field, without
  // setting a limit for callers that omit it.
  it('sends the configured cap in the real SDK request body', async () => {
    const requests: Record<string, unknown>[] = []
    await streamFrom({
      model: 'test',
      chatProvider: createProvider(requests),
      conversation: { turns: [] },
      options: { maxTokens: 512 },
    })
    expect(requests).toHaveLength(1)
    expect(requests[0][tokenField]).toBe(512)
    expect(requests[0][protocol === 'responses' ? 'max_tokens' : 'max_output_tokens']).toBeUndefined()
  })

  it('leaves the provider default unchanged when no cap is supplied', async () => {
    const requests: Record<string, unknown>[] = []
    await streamFrom({ model: 'test', chatProvider: createProvider(requests), conversation: { turns: [] } })
    expect(requests).toHaveLength(1)
    expect(Object.hasOwn(requests[0], tokenField)).toBe(false)
  })

  it.each([undefined, 512])('refreshes the cap across tool rounds with caller fallback %s', async (maxTokens) => {
    const requests: Record<string, unknown>[] = []
    const provider = createProvider(requests, 2)
    let currentCap: number | undefined = 128
    await streamFrom({
      model: 'test',
      chatProvider: provider,
      conversation: { turns: [] },
      options: {
        maxTokens,
        resolveStep: async () => ({
          model: 'test',
          chatProvider: provider,
          providerId: 'test',
          systemPrompt: '',
          maxTokens: currentCap,
          tools: [{
            type: 'function',
            function: { name: 'update_limit', parameters: { type: 'object', properties: {} } },
            execute: () => {
              currentCap = requests.length === 1 ? 64 : undefined
              return 'Updated.'
            },
          }],
        }),
      },
    })
    expect(requests).toHaveLength(3)
    expect(requests.map(request => request[tokenField])).toEqual([128, 64, maxTokens])
    if (maxTokens === undefined)
      expect(Object.hasOwn(requests[2], tokenField)).toBe(false)
  })
})
