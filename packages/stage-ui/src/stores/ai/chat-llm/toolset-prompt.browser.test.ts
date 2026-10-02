import type { GenerationProvider } from '@proj-airi/provider-inference'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useLLM } from './llm'
import { useLlmToolsetPromptsStore } from './toolset-prompts'

interface RequestBody {
  messages: Array<{ role: string, content?: unknown }>
  tools?: Array<{ function: { name: string } }>
}

describe('request-owned command relay guidance', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    disposePinia(pinia)
    localStorage.clear()
  })

  for (const rejected of [false, true]) {
    it(`pairs the actual Stage relay tool with guidance after model rejection: ${rejected}`, async () => {
      const requests: RequestBody[] = []
      const fetch: typeof globalThis.fetch = async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)))
        if (rejected && requests.length === 1)
          throw new Error('This model does not support tools')
        return new Response('data: {"choices":[{"index":0,"delta":{"content":"Ready."},"finish_reason":"stop"}]}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
      }
      const provider: GenerationProvider = {
        generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/', fetch } }),
      }
      const store = useLLM(pinia)
      const conversation = { turns: [] }
      if (rejected)
        await expect(store.stream('test', provider, conversation)).rejects.toThrow('does not support tools')
      await store.stream('test', provider, conversation)

      const request = requests.at(-1)
      // Chat Completions guidance joins the system message, because some providers reject a `developer` message.
      expect(request?.messages.filter(message => message.role === 'developer')).toEqual([])
      const guidance = request?.messages.filter(message => message.role === 'system' && String(message.content).includes('builtIn_emitSparkCommand'))
      if (rejected) {
        expect(request?.tools).toBeUndefined()
        expect(guidance).toEqual([])
      }
      else {
        expect(request?.tools?.some(tool => tool.function.name === 'builtIn_emitSparkCommand')).toBe(true)
        expect(guidance).toHaveLength(1)
        expect(guidance?.[0].content).toContain('set intent to "action"')
        expect(guidance?.[0].content).toContain('guidance.options[0].label')
        expect(guidance?.[0].content).toContain('guidance.options[0].steps')
        expect(guidance?.[0].content).toContain('before the tool call succeeds')
      }
      expect(conversation.turns).toEqual([])
      expect(useLlmToolsetPromptsStore(pinia).activeToolsetPrompt).toBe('')
    })
  }
})
