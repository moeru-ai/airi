import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerKokoroLocal } from '.'

const mocks = vi.hoisted(() => ({
  adapter: {
    state: 'idle' as string,
    manifest: null as { quantization: string, device: string } | null,
    loadModel: vi.fn(),
    generate: vi.fn(),
    getVoices: vi.fn(),
  },
}))

vi.mock('../../../inference/adapters/kokoro', () => ({
  getKokoroAdapter: async () => mocks.adapter,
}))

function markLoaded(quantization: string, device: string) {
  mocks.adapter.state = 'ready'
  mocks.adapter.manifest = { quantization, device }
}

async function requestSpeech(model: string) {
  const provider = await providerKokoroLocal.createProvider({ model, voiceId: 'af_heart' })
  if (!('speech' in provider))
    throw new Error('Kokoro provider does not expose speech')

  const fetchSpeech = provider.speech('kokoro-82m').fetch as typeof globalThis.fetch
  return fetchSpeech('http://kokoro-local/v1/audio/speech', {
    method: 'POST',
    body: JSON.stringify({ input: 'Hello', voice: 'af_heart' }),
  })
}

describe('kokoro local speech provider', () => {
  afterEach(() => {
    mocks.adapter.state = 'idle'
    mocks.adapter.manifest = null
    vi.clearAllMocks()
  })

  it('issue #2942: loads the configured model before generating in a window that has not loaded it', async () => {
    mocks.adapter.loadModel.mockImplementation(async (quantization: string, device: string) => markLoaded(quantization, device))
    mocks.adapter.getVoices.mockReturnValue({ af_heart: {} })
    mocks.adapter.generate.mockResolvedValue(new ArrayBuffer(8))

    const response = await requestSpeech('q8')

    expect(mocks.adapter.loadModel).toHaveBeenCalledWith('q8', 'wasm')
    expect(mocks.adapter.generate).toHaveBeenCalledWith('Hello', 'af_heart')
    expect(response.status).toBe(200)
  })

  it('reuses the loaded model when it matches the configured model', async () => {
    markLoaded('q8', 'wasm')
    mocks.adapter.getVoices.mockReturnValue({ af_heart: {} })
    mocks.adapter.generate.mockResolvedValue(new ArrayBuffer(8))

    await requestSpeech('q8')

    expect(mocks.adapter.loadModel).not.toHaveBeenCalled()
    expect(mocks.adapter.generate).toHaveBeenCalledWith('Hello', 'af_heart')
  })

  it('reloads when the configured model differs from the loaded model', async () => {
    markLoaded('q4', 'wasm')
    mocks.adapter.loadModel.mockImplementation(async (quantization: string, device: string) => markLoaded(quantization, device))
    mocks.adapter.getVoices.mockReturnValue({ af_heart: {} })
    mocks.adapter.generate.mockResolvedValue(new ArrayBuffer(8))

    await requestSpeech('q8')

    expect(mocks.adapter.loadModel).toHaveBeenCalledWith('q8', 'wasm')
  })
})
