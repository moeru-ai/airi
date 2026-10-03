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

  /** Apple Vision declares one read at a time in its provider definition. */
  function useSingleReadProvider() {
    useVisionStore().activeProvider = 'apple-vision'
  }

  function holdEachRead() {
    const releases: Array<() => void> = []
    stream.mockImplementation(async (_model, _provider, _messages, options) => {
      await new Promise<void>(resolve => releases.push(resolve))
      await options?.onStreamEvent?.({ type: 'text-delta', text: `read ${releases.length}` })
    })
    return releases
  }

  const toolImage = { imageDataUrl: 'data:image/png;base64,Zm9v', workloadId: 'tool:image' as const }

  it('reads one image at a time for a provider that answers one read at a time', async () => {
    // ROOT CAUSE:
    //
    // Concurrent reads waited inside the on-device model while their timeouts
    // ran, so a queued read timed out before it started.
    //
    // We fixed this with a queue for each provider. A timeout starts after the
    // read leaves the queue.
    useSingleReadProvider()
    const releases = holdEachRead()
    const { runVisionInference } = useVisionInference()

    const first = runVisionInference(toolImage)
    const second = runVisionInference(toolImage)
    await vi.advanceTimersByTimeAsync(50_000)
    expect(stream).toHaveBeenCalledOnce()

    releases[0]()
    await expect(first).resolves.toBe('read 1')
    await vi.advanceTimersByTimeAsync(50_000)
    expect(stream).toHaveBeenCalledTimes(2)
    releases[1]()
    await expect(second).resolves.toBe('read 2')
  })

  it('starts reads together for a provider without a declared limit', async () => {
    const releases = holdEachRead()
    const { runVisionInference } = useVisionInference()

    const reads = [runVisionInference(toolImage), runVisionInference(toolImage), runVisionInference(toolImage)]
    await vi.advanceTimersByTimeAsync(0)
    expect(stream).toHaveBeenCalledTimes(3)

    for (const release of releases)
      release()
    await Promise.all(reads)
  })

  it('leaves the queue at once when a queued read is cancelled', async () => {
    useSingleReadProvider()
    const releases = holdEachRead()
    const { runVisionInference } = useVisionInference()
    const controller = new AbortController()

    const first = runVisionInference(toolImage)
    const cancelled = runVisionInference({ ...toolImage, abortSignal: controller.signal })
    const expectation = expect(cancelled).rejects.toThrow('Stopped')
    controller.abort(new Error('Stopped'))
    await expectation

    releases[0]()
    await first
    // The cancelled read passed its slot on, so the next read starts.
    const next = runVisionInference(toolImage)
    await vi.advanceTimersByTimeAsync(0)
    expect(stream).toHaveBeenCalledTimes(2)
    releases[1]()
    await expect(next).resolves.toBe('read 2')
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
