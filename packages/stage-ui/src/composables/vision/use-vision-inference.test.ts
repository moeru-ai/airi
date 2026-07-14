import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, toRefs } from 'vue'

const generateText = vi.fn()
const getProviderInstance = vi.fn()

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: object) => toRefs(store as never),
  }
})

// Vision inference runs a non-streaming completion via @xsai/generate-text; mock it so the
// test never reaches a real provider endpoint.
vi.mock('@xsai/generate-text', () => ({
  generateText,
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
    generateText.mockReset()
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

  it('passes an abort signal to generateText and returns the trimmed text', async () => {
    generateText.mockImplementation(async (options) => {
      expect(options?.abortSignal).toBeInstanceOf(AbortSignal)
      return { text: '  Frame summary  ' }
    })

    const { useVisionInference } = await import('./use-vision-inference')
    const { runVisionInference } = useVisionInference()

    await expect(runVisionInference({
      imageDataUrl: 'data:image/png;base64,Zm9v',
      workloadId: 'screen:interpret',
    })).resolves.toBe('Frame summary')
  })

  it('aborts vision inference when generateText never settles', async () => {
    generateText.mockImplementation(options => new Promise((_, reject) => {
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
})
