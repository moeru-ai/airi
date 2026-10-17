import type { GenerationProvider, GenerationRequest } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLLM } from './llm'

const { mcp, debug } = vi.hoisted(() => ({
  mcp: vi.fn(async (): Promise<Tool[]> => []),
  debug: vi.fn(async (): Promise<Tool[]> => []),
}))

vi.mock('../../../tools', () => ({
  mcp,
  debug,
  createWebSearchTools: vi.fn(async (): Promise<Tool[]> => []),
}))

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

beforeEach(() => {
  mcp.mockClear()
  debug.mockClear()
  setActivePinia(createPinia())
})

for (const protocol of ['chat-completions', 'responses'] as const) {
  describe(`${protocol} Stage tool policy`, () => {
    // https://github.com/moeru-ai/airi/pull/2902#discussion_r4237815781
    // ROOT CAUSE:
    //
    // Stage loaded tools inside resolveStep before Core applied toolsEnabled.
    // A rejected caller resolver prevented a tool-free provider request.
    // Gate Stage tool loading and preserve the live request settings.
    it('skips a rejected resolver and sends the live settings through the real SDK (PR #2902)', async () => {
      const { provider, requests } = createProvider(protocol)
      const tools = vi.fn(async (): Promise<Tool[]> => {
        throw new Error('Disabled tool resolver must not run.')
      })
      const resolveStep = vi.fn(async () => ({
        model: 'live-model',
        chatProvider: provider,
        providerId: 'live',
        systemPrompt: 'Live system prompt.',
        temperature: 0.4,
        topP: 0.8,
        tools: [tool],
      }))

      await useLLM().stream('initial-model', provider, { turns: [] }, {
        toolsEnabled: false,
        supportsTools: true,
        toolChoice: 'required',
        tools,
        resolveStep,
      })

      expect(resolveStep).toHaveBeenCalledOnce()
      expect(tools).not.toHaveBeenCalled()
      expect(mcp).not.toHaveBeenCalled()
      expect(debug).not.toHaveBeenCalled()
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ model: 'live-model', temperature: 0.4, top_p: 0.8 })
      expect(requests[0]).not.toHaveProperty('tools')
      expect(requests[0]).not.toHaveProperty('tool_choice')
      if (protocol === 'chat-completions')
        expect(requests[0].messages).toContainEqual({ role: 'system', content: 'Live system prompt.' })
      else
        expect(requests[0].input).toContainEqual({ type: 'message', role: 'system', content: 'Live system prompt.' })
    })

    for (const toolsEnabled of [undefined, true]) {
      it(`loads lazy tools with live settings when toolsEnabled is ${toolsEnabled}`, async () => {
        const { provider, requests } = createProvider(protocol)
        const tools = vi.fn(async () => [tool])

        await useLLM().stream('initial-model', provider, { turns: [] }, {
          toolsEnabled,
          tools,
          resolveStep: async () => ({ model: 'live-model', chatProvider: provider, providerId: 'live', systemPrompt: '' }),
        })

        expect(tools).toHaveBeenCalledOnce()
        expect(mcp).toHaveBeenCalledOnce()
        expect(debug).toHaveBeenCalledOnce()
        expect(requests).toHaveLength(1)
        expect(requests[0].tools).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'function', ...(protocol === 'chat-completions' ? { function: tool.function } : { name: 'lookup' }) }),
        ]))
      })
    }

    it('isolates concurrent disabled and enabled generations in the same Stage store', async () => {
      const { provider, requests } = createProvider(protocol)
      const store = useLLM()
      const disabledTools = vi.fn(async (): Promise<Tool[]> => {
        throw new Error('Disabled tool resolver must not run.')
      })
      const enabledTools = vi.fn(async () => [tool])

      await Promise.all([
        store.stream('initial', provider, { turns: [] }, {
          toolsEnabled: false,
          tools: disabledTools,
          resolveStep: async () => ({ model: 'disabled', chatProvider: provider, providerId: 'live', systemPrompt: '' }),
        }),
        store.stream('initial', provider, { turns: [] }, {
          toolsEnabled: true,
          tools: enabledTools,
          resolveStep: async () => ({ model: 'enabled', chatProvider: provider, providerId: 'live', systemPrompt: '' }),
        }),
      ])

      expect(disabledTools).not.toHaveBeenCalled()
      expect(enabledTools).toHaveBeenCalledOnce()
      expect(mcp).toHaveBeenCalledOnce()
      expect(debug).toHaveBeenCalledOnce()
      expect(requests).toHaveLength(2)
      expect(requests.find(request => request.model === 'disabled')).not.toHaveProperty('tools')
      expect(requests.find(request => request.model === 'enabled')?.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'function', ...(protocol === 'chat-completions' ? { function: tool.function } : { name: 'lookup' }) }),
      ]))
    })
  })
}
