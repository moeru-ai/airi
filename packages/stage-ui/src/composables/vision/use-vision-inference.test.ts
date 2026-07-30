import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, toRefs } from 'vue'

const stream = vi.fn()
const getProviderInstance = vi.fn()

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: object) => toRefs(store as never),
  }
})

vi.mock('../../stores/llm', () => ({
  useLLM: () => ({
    stream,
  }),
}))

vi.mock('../../stores/providers', () => ({
  useProvidersStore: () => ({
    getProviderInstance,
  }),
}))

vi.mock('../../stores/modules/vision', () => ({
  useVisionStore: () => reactive({
    activeProvider: 'mock-provider',
    activeModel: 'mock-model',
    ollamaThinkingEnabled: false,
  }),
}))

vi.mock('./use-vision-workloads', () => ({
  getVisionWorkload: () => ({
    prompt: 'Interpret this frame',
  }),
}))

describe('useVisionInference', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stream.mockReset()
    getProviderInstance.mockReset()
    getProviderInstance.mockResolvedValue({
      chat: vi.fn().mockReturnValue({
        apiKey: 'test-key',
        baseURL: 'https://example.com/v1/',
      }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes an abort signal to llmStore.stream', async () => {
    stream.mockImplementation(async (_model, _provider, _messages, options) => {
      expect(options?.abortSignal).toBeInstanceOf(AbortSignal)
      options?.onStreamEvent?.({ type: 'text-delta', text: 'Frame summary' })
    })

    const { useVisionInference } = await import('./use-vision-inference')
    const { runVisionInference } = useVisionInference()

    await expect(runVisionInference({
      imageDataUrl: 'data:image/png;base64,Zm9v',
      workloadId: 'screen:interpret',
    })).resolves.toBe('Frame summary')
  })

  it('aborts vision inference when the stream never settles', async () => {
    stream.mockImplementation((_model, _provider, _messages, options) => new Promise((_, reject) => {
      options?.abortSignal?.addEventListener('abort', () => {
        reject(options.abortSignal?.reason)
      }, { once: true })
    }))

    const { useVisionInference } = await import('./use-vision-inference')
    const { runVisionInference } = useVisionInference()

    const result = runVisionInference({
      imageDataUrl: 'data:image/png;base64,Zm9v',
      workloadId: 'screen:interpret',
    })
    const expectation = expect(result).rejects.toThrow('Vision inference timed out after 60000ms')

    await vi.advanceTimersByTimeAsync(60_000)

    await expectation
  })

  it('forwards caller cancellation to the active vision stream', async () => {
    const streamStarted = Promise.withResolvers<void>()
    stream.mockImplementation((_model, _provider, _messages, options) => new Promise((_, reject) => {
      streamStarted.resolve()
      options?.abortSignal?.addEventListener('abort', () => {
        reject(options.abortSignal?.reason)
      }, { once: true })
    }))

    const { useVisionInference } = await import('./use-vision-inference')
    const { runVisionInference } = useVisionInference()
    const abortController = new AbortController()
    const result = runVisionInference({
      imageDataUrl: 'data:image/png;base64,Zm9v',
      workloadId: 'screen:interpret',
      abortSignal: abortController.signal,
    })

    await streamStarted.promise
    abortController.abort(new DOMException('Screen awareness stopped', 'AbortError'))

    await expect(result).rejects.toThrow('Screen awareness stopped')
  })

  it('does not start Vision inference when the caller is already cancelled', async () => {
    const { useVisionInference } = await import('./use-vision-inference')
    const { runVisionInference } = useVisionInference()
    const abortController = new AbortController()
    abortController.abort(new DOMException('Screen awareness stopped', 'AbortError'))

    await expect(runVisionInference({
      imageDataUrl: 'data:image/png;base64,Zm9v',
      workloadId: 'screen:interpret',
      abortSignal: abortController.signal,
    })).rejects.toThrow('Screen awareness stopped')

    expect(stream).not.toHaveBeenCalled()
  })
})
