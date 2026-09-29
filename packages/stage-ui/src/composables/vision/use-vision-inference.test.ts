import type { GenerationProvider } from '@proj-airi/provider-inference'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLLM } from '../../stores/ai/chat-llm/llm'
import { useVisionActivityStore, useVisionStore } from '../../stores/modules/vision'
import { useProviderStore } from '../../stores/providers/provider'
import { useVisionInference } from './use-vision-inference'

const stream = vi.fn<ReturnType<typeof useLLM>['stream']>()
const provider: GenerationProvider = {
  generation: model => ({
    protocol: 'responses',
    webSearch: false,
    config: { model, apiKey: 'test-key', baseURL: 'https://example.com/v1/' },
  }),
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('useVisionInference', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    vi.useFakeTimers()
    stream.mockReset()
    setActivePinia(pinia)
    vi.spyOn(useLLM(), 'stream').mockImplementation(stream)
    vi.spyOn(useProviderStore(), 'getChatProviderInstance').mockResolvedValue(provider)
    const vision = useVisionStore()
    vision.activeProvider = 'openai'
    vision.activeModel = 'mock-model'
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // https://github.com/moeru-ai/airi/pull/2477
  // ROOT CAUSE:
  //
  // The vision tests used the old chat-only provider API after inference adopted
  // GenerationProvider. Real Pinia stores keep method and state contracts checked.
  it('passes the generation provider, image context, abort signal, and no tools to llmStore.stream', async () => {
    stream.mockImplementation(async (model, generationProvider, conversation, options) => {
      expect(model).toBe('mock-model')
      expect(generationProvider).toBe(provider)
      expect(conversation.turns).toEqual([{
        id: 'vision-input',
        type: 'user',
        content: [{ type: 'text', text: 'Interpret this frame' }, { type: 'image', url: 'data:image/png;base64,Zm9v' }],
      }])
      expect(options?.abortSignal).toBeInstanceOf(AbortSignal)
      expect(options?.supportsTools).toBe(false)
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'Frame summary' })
    })

    const { runVisionInference } = useVisionInference()

    await expect(runVisionInference({
      imageDataUrl: 'data:image/png;base64,Zm9v',
      workloadId: 'screen:interpret',
      promptOverride: 'Interpret this frame',
    })).resolves.toBe('Frame summary')
  })

  it('counts each inference and each failure for the settings page', async () => {
    stream.mockImplementationOnce(async (_model, _provider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'A red square.' })
    })
    stream.mockRejectedValueOnce(new Error('Model unavailable'))
    const { runVisionInference } = useVisionInference()
    const input = { imageDataUrl: 'data:image/png;base64,Zm9v', workloadId: 'screen:understand' as const }

    await runVisionInference(input)
    await expect(runVisionInference(input)).rejects.toThrow('Model unavailable')

    // A provider that cannot start fails before the request, and still counts.
    vi.spyOn(useProviderStore(), 'getChatProviderInstance').mockRejectedValueOnce(new Error('Provider unavailable'))
    await expect(runVisionInference(input)).rejects.toThrow('Provider unavailable')

    const activity = useVisionActivityStore()
    expect(activity.inferenceCount).toBe(3)
    expect(activity.failedInferenceCount).toBe(2)
    expect(activity.lastInference).toMatchObject({ provider: 'openai', model: 'mock-model', error: 'Provider unavailable' })
  })

  it('aborts vision inference when the stream never settles', async () => {
    stream.mockImplementation((_model, _provider, _messages, options) => new Promise((_, reject) => {
      options?.abortSignal?.addEventListener('abort', () => {
        reject(options.abortSignal?.reason)
      }, { once: true })
    }))

    const { runVisionInference } = useVisionInference()

    const result = runVisionInference({
      imageDataUrl: 'data:image/png;base64,Zm9v',
      workloadId: 'screen:interpret',
      promptOverride: 'Interpret this frame',
    })
    const expectation = expect(result).rejects.toThrow('Vision inference timed out after 60000ms')

    await vi.advanceTimersByTimeAsync(60_000)

    await expectation
  })
})
