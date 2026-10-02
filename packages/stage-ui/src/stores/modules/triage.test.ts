import type { Recipe, StreamOptions } from '@proj-airi/core-agent'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsTriage } from '../settings/triage'
import { useTriageStore } from './triage'

const llm = vi.hoisted(() => ({ stream: vi.fn() }))

vi.mock('../ai/chat-llm/llm', () => ({ useLLM: () => ({ stream: llm.stream }) }))
vi.mock('./consciousness', () => ({ useConsciousnessStore: () => ({ getChatProviderInstance: async () => ({ generation: () => ({}) }) }) }))

const ackRecipe: Recipe = { id: 'user:ack', name: 'Acknowledgements', description: 'Skips replies to plain acknowledgements.', style: { kind: 'decision', question: { type: 'noul', instructions: 'Is this only an acknowledgement?', criteria: { true: 'It needs no answer.', false: 'It asks something.' } }, actions: { true: { kind: 'stay-quiet' } } }, triggers: [], source: 'user', enabled: true, approved: true }

describe('triage store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    llm.stream.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gives the classifier model only its own tool and system prompt', async () => {
    const settings = useSettingsTriage()
    settings.backend = 'llm'
    settings.llmProvider = 'provider'
    settings.llmModel = 'small-model'
    llm.stream.mockImplementation(async (_model: string, _provider: unknown, _conversation: unknown, options: StreamOptions) => {
      const step = await options.resolveStep?.()
      const tool = step?.tools?.[0]
      expect(step?.tools).toHaveLength(1)
      expect(step?.systemPrompt).toContain('decision classifier')
      expect(options.toolChoice).toEqual({ type: 'function', function: { name: 'submit_answers' } })
      await tool?.execute({ 'user:ack': 0.97 }, { messages: [], toolCallId: 'call' })
    })

    const decided = await useTriageStore().decideRecipes([ackRecipe], 'ok', new AbortController().signal)

    expect(llm.stream.mock.calls[0]?.[0]).toBe('small-model')
    expect(decided).toMatchObject({ silent: { reason: 'Acknowledgements' } })
  })

  // A decision recipe reads a message with the attention classifier and can choose silence without a model reply.
  it('chooses silence for a confident decision recipe and nothing without a classifier', async () => {
    const recipe: Recipe = { id: 'user:ack', name: 'Acknowledgements', description: 'Skips replies to plain acknowledgements.', style: { kind: 'decision', question: { type: 'noul', instructions: 'Is this only an acknowledgement?', criteria: { true: 'It needs no answer.', false: 'It asks something.' } }, actions: { true: { kind: 'stay-quiet' } } }, triggers: [], source: 'user', enabled: true, approved: true }
    const signal = new AbortController().signal
    expect(await useTriageStore().decideRecipes([recipe], 'ok', signal)).toBeUndefined()

    const settings = useSettingsTriage()
    settings.backend = 'decisions'
    settings.decisionsApiKey = 'key'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ answers: { 'user:ack': { type: 'noul', noul: 0.97 } } })))

    expect(await useTriageStore().decideRecipes([recipe], 'ok', signal)).toEqual({ silent: { reason: 'Acknowledgements' }, hints: [], applied: ['Acknowledgements'], recipeIds: [] })
  })
})
