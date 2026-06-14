import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, toRefs } from 'vue'

const embed = vi.fn()
const getProviderInstance = vi.fn()

// A mutable stand-in for the memory settings store; individual tests tweak fields before importing
// the composable (which reads them lazily via storeToRefs).
const memoryState = reactive({
  embedProvider: 'mock-provider',
  embedModel: 'mock-model',
  embeddingDimension: 3,
})

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: object) => toRefs(store as never),
  }
})

vi.mock('@xsai/embed', () => ({ embed }))

vi.mock('../../stores/providers', () => ({
  useProvidersStore: () => ({ getProviderInstance }),
}))

vi.mock('../../stores/modules/memory', () => ({
  useMemoryStore: () => memoryState,
}))

describe('useMemoryEmbedder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    embed.mockReset()
    getProviderInstance.mockReset()
    getProviderInstance.mockResolvedValue({
      embed: vi.fn().mockReturnValue({
        apiKey: 'test-key',
        baseURL: 'https://example.com/v1/',
        model: 'mock-model',
      }),
    })
    memoryState.embedProvider = 'mock-provider'
    memoryState.embedModel = 'mock-model'
    memoryState.embeddingDimension = 3
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * @example
   * embedText('  hi  ') -> trims, forwards provider request config + input + abort signal, returns the vector.
   */
  it('returns the model embedding and forwards request config, trimmed input, and an abort signal', async () => {
    embed.mockImplementation(async (options) => {
      expect(options.baseURL).toBe('https://example.com/v1/')
      expect(options.model).toBe('mock-model')
      expect(options.input).toBe('hello world')
      expect(options.abortSignal).toBeInstanceOf(AbortSignal)
      return { embedding: [0.1, 0.2, 0.3], input: 'hello world', usage: {} }
    })

    const { useMemoryEmbedder } = await import('./use-memory-embedder')
    const { embedText } = useMemoryEmbedder()

    await expect(embedText('  hello world  ')).resolves.toEqual([0.1, 0.2, 0.3])
  })

  /**
   * @example
   * embedProvider unset -> throws, never calls the embed endpoint.
   */
  it('throws when the embed provider/model is not configured', async () => {
    memoryState.embedProvider = ''

    const { useMemoryEmbedder } = await import('./use-memory-embedder')
    const { embedText } = useMemoryEmbedder()

    await expect(embedText('hi')).rejects.toThrow('not configured')
    expect(embed).not.toHaveBeenCalled()
  })

  /**
   * @example
   * embedText('   ') -> throws on empty input before resolving any provider.
   */
  it('throws on empty input without resolving the provider', async () => {
    const { useMemoryEmbedder } = await import('./use-memory-embedder')
    const { embedText } = useMemoryEmbedder()

    await expect(embedText('   ')).rejects.toThrow('empty')
    expect(getProviderInstance).not.toHaveBeenCalled()
  })

  /**
   * @example
   * model returns 2 dims but store expects 3 -> throws so a wrong model fails loudly.
   */
  it('rejects a dimension mismatch', async () => {
    embed.mockResolvedValue({ embedding: [0.1, 0.2], input: 'hi', usage: {} })

    const { useMemoryEmbedder } = await import('./use-memory-embedder')
    const { embedText } = useMemoryEmbedder()

    await expect(embedText('hi')).rejects.toThrow('dimension mismatch')
  })

  /**
   * @example
   * embed never settles -> the timeout aborts it and embedText rejects.
   */
  it('aborts embedding when the request never settles', async () => {
    embed.mockImplementation(options => new Promise((_, reject) => {
      options.abortSignal?.addEventListener('abort', () => {
        reject(options.abortSignal?.reason)
      }, { once: true })
    }))

    const { useMemoryEmbedder } = await import('./use-memory-embedder')
    const { embedText } = useMemoryEmbedder()

    const result = embedText('hi')
    const expectation = expect(result).rejects.toThrow('Embedding timed out after 30000ms')

    await vi.advanceTimersByTimeAsync(30_000)

    await expectation
  })
})
