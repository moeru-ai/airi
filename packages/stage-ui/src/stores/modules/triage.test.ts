import type { Stimulus, StreamOptions } from '@proj-airi/core-agent'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsTriage } from '../settings/triage'
import { useTriageStore } from './triage'

const llm = vi.hoisted(() => ({ stream: vi.fn() }))

vi.mock('../ai/chat-llm/llm', () => ({ useLLM: () => ({ stream: llm.stream }) }))
vi.mock('./consciousness', () => ({ useConsciousnessStore: () => ({ getChatProviderInstance: async () => ({ generation: () => ({}) }) }) }))

const stimulus: Stimulus = {
  id: 'message',
  kind: 'input:text',
  origin: 'external',
  source: 'connection:discord',
  event: 'input:text',
  bindings: ['discord:channel:a'],
  salience: 0.9,
  receivedAt: 0,
  text: 'hello',
  fromScene: true,
}

describe('triage store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    llm.stream.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('admits connection input by rule without a backend and keeps scene sources below interruption', async () => {
    expect(await useTriageStore().decideConnectionIntake(stimulus)).toEqual({ outcome: 'admitted', reason: 'connection-input', decidedBy: 'rule', salience: 0.8 })
  })

  it('ignores connection input when JEV is confident and records the threshold in effect', async () => {
    const settings = useSettingsTriage()
    settings.backend = 'jev'
    settings.jevApiKey = 'key'
    settings.threshold = 0.9
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ answers: { attend: { type: 'noul', noul: 0.02 } } })))

    expect(await useTriageStore().decideConnectionIntake(stimulus)).toMatchObject({
      outcome: 'ignored',
      decidedBy: 'classifier',
      appraisal: { backend: 'jev', threshold: 0.9 },
    })
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
      await tool?.execute({ attend: 0.97, urgency: { score: 1, confidence: 0.9 } }, { messages: [], toolCallId: 'call' })
    })

    const appraisal = await useTriageStore().appraiseNotification({ ...stimulus, fromScene: false, salience: 0.5 })

    expect(llm.stream.mock.calls[0]?.[0]).toBe('small-model')
    expect(appraisal).toMatchObject({ backend: 'llm', attend: 0.97, threshold: 0.8, urgency: expect.closeTo(0.5) })
  })
})
