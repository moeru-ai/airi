import type { SherpawModel } from './models'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { paraformerBilingualZhEn, xAsrBilingualZhEnInt8, zipformerMultilingual } from './models'
import { createProvider } from './runtime'

const mocks = vi.hoisted(() => ({ speech: vi.fn() }))

vi.mock('@sherpaw/xsai-transcription', () => ({
  asRemoteUrl: (url: URL) => ({ url }),
  createSherpawProvider: () => ({ speech: mocks.speech }),
  streamTranscription: () => ({
    fullStream: new ReadableStream(),
    textStream: new ReadableStream(),
    input: new WritableStream(),
    done: new Promise(() => {}),
  }),
}))

function startWith(model: SherpawModel, hotwords?: readonly string[]) {
  mocks.speech.mockReturnValue({ events: new ReadableStream(), terminateSpeech: vi.fn() })
  const files = { data: 'https://example.test/preload.data', metadata: 'https://example.test/preload.js.metadata', source: 'remote' as const }
  const provider = createProvider({ model: model.id as never }, {
    models: [{ model, files }],
    workerURL: '/worker.js',
    fetchModel: fetch,
    getInterfaceLanguage: () => 'en',
    isMobile: () => false,
  })
  const request = provider.transcription(model.id, { hotwords, abortSignal: new AbortController().signal })
  request.startSherpaw({ ...request, inputAudioStream: new ReadableStream() })
  provider.dispose()
  return mocks.speech.mock.calls[0][0].recognizerConfig
}

describe('sherpaw request hotwords', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('passes one hotword per line with a UTF-8 size and beam search to a character-unit transducer', () => {
    vi.stubGlobal('document', { baseURI: 'https://example.test/' })

    expect(startWith(zipformerMultilingual, ['硫方怪', 'Sulfur\nCube'])).toMatchObject({
      decodingMethod: 'modified_beam_search',
      hotwordsBuf: '硫方怪\nSulfur Cube',
      hotwordsBufSize: 21,
    })
  })

  it.each([paraformerBilingualZhEn, xAsrBilingualZhEnInt8])('keeps greedy search for $id, which cannot encode hotwords', (model) => {
    vi.stubGlobal('document', { baseURI: 'https://example.test/' })

    const config = startWith(model, ['硫方怪'])
    expect(config).not.toHaveProperty('hotwordsBuf')
    expect(config).not.toHaveProperty('decodingMethod')
  })

  it('keeps greedy search when the request has no hotwords', () => {
    vi.stubGlobal('document', { baseURI: 'https://example.test/' })

    expect(startWith(zipformerMultilingual, [])).not.toHaveProperty('hotwordsBuf')
  })
})
