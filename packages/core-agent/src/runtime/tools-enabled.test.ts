import type { GenerationProvider, GenerationRequest } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import type { StreamOptions } from '../types/llm'

import { describe, expect, it, vi } from 'vitest'

import { streamFrom } from './llm-service'

const tool: Tool = {
  type: 'function',
  function: { name: 'lookup', parameters: { type: 'object', properties: {} } },
  execute: async () => 'result',
}

function createProvider(protocol: GenerationRequest['protocol']) {
  const requests: Record<string, unknown>[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    const events = protocol === 'chat-completions'
      ? [{ choices: [{ index: 0, delta: { content: 'Hello.' }, finish_reason: 'stop' }] }]
      : [{ type: 'response.completed', response: { output: [], usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } } }]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const provider: GenerationProvider = {
    generation: model => protocol === 'chat-completions'
      ? { protocol, config: { model, baseURL: 'https://example.test/v1/', fetch } }
      : { protocol, webSearch: true, config: { model, baseURL: 'https://example.test/v1/', fetch } },
  }
  return { provider, requests }
}

for (const protocol of ['chat-completions', 'responses'] as const) {
  describe(`${protocol} request tool policy`, () => {
    // ROOT CAUSE:
    //
    // Removing caller tools did not remove built-in tools or provider web search.
    // Live settings could also supply tools after the request started.
    // A request-level policy must override all of these sources without changing compatibility caches.
    it('omits tools and tool choice without loading caller or built-in tools', async () => {
      const { provider, requests } = createProvider(protocol)
      const builtinToolsResolver = vi.fn(async () => [tool])
      const tools = vi.fn(async () => [tool])
      const toolsCompatibility = new Map<string, boolean>()
      const options = { toolsEnabled: false, supportsTools: true, toolsCompatibility, tools, toolChoice: 'required' } satisfies StreamOptions

      await streamFrom({ model: 'test', chatProvider: provider, conversation: { turns: [] }, options, builtinToolsResolver })

      expect(requests).toHaveLength(1)
      expect(requests[0]).not.toHaveProperty('tools')
      expect(requests[0]).not.toHaveProperty('tool_choice')
      expect(tools).not.toHaveBeenCalled()
      expect(builtinToolsResolver).not.toHaveBeenCalled()
      expect(toolsCompatibility.size).toBe(0)
    })

    it('does not allow live settings to override disabled tools', async () => {
      const { provider, requests } = createProvider(protocol)
      const resolveStep = vi.fn(async () => ({
        model: 'test',
        chatProvider: provider,
        providerId: 'live',
        systemPrompt: '',
        tools: [tool],
      }))
      const options = { toolsEnabled: false, supportsTools: true, resolveStep, toolChoice: 'required' } satisfies StreamOptions

      await streamFrom({ model: 'test', chatProvider: provider, conversation: { turns: [] }, options })

      expect(resolveStep).toHaveBeenCalledTimes(1)
      expect(requests).toHaveLength(1)
      expect(requests[0]).not.toHaveProperty('tools')
      expect(requests[0]).not.toHaveProperty('tool_choice')
    })

    it('keeps the existing tool policy when the option is absent', async () => {
      const { provider, requests } = createProvider(protocol)
      const builtinToolsResolver = vi.fn(async () => [tool])
      const tools = vi.fn(async () => [{ ...tool, function: { ...tool.function, name: 'custom' } }])

      await streamFrom({
        model: 'test',
        chatProvider: provider,
        conversation: { turns: [] },
        builtinToolsResolver,
        options: { tools, toolChoice: 'required' },
      })

      expect(builtinToolsResolver).toHaveBeenCalledTimes(1)
      expect(tools).toHaveBeenCalledTimes(1)
      expect(requests[0].tools).toHaveLength(protocol === 'responses' ? 3 : 2)
      expect(requests[0].tool_choice).toBe('required')
    })

    it('isolates disabled requests from concurrent enabled requests', async () => {
      const { provider, requests } = createProvider(protocol)
      const tools = vi.fn(async () => [tool])
      const disabled = { toolsEnabled: false, tools } satisfies StreamOptions
      const enabled = { toolsEnabled: true, tools } satisfies StreamOptions

      await Promise.all([
        streamFrom({ model: 'disabled', chatProvider: provider, conversation: { turns: [] }, options: disabled }),
        streamFrom({ model: 'enabled', chatProvider: provider, conversation: { turns: [] }, options: enabled }),
      ])

      expect(requests).toHaveLength(2)
      expect(requests.find(request => request.model === 'disabled')).not.toHaveProperty('tools')
      expect(requests.find(request => request.model === 'enabled')?.tools).toHaveLength(protocol === 'responses' ? 2 : 1)
      expect(tools).toHaveBeenCalledTimes(1)
    })
  })
}
