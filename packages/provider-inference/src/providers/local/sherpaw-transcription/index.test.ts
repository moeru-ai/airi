import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createSherpawTranscriptionDefinition, executeSherpawStream } from '.'
import { paraformerBilingualZhEn, xAsrBilingualZhEnInt8, zipformerMultilingual } from './models'

const host = {
  models: [{
    model: paraformerBilingualZhEn,
    files: {
      data: 'https://example.test/preload.data',
      metadata: 'https://example.test/preload.js.metadata',
      source: 'remote' as const,
    },
  }],
  workerURL: '/worker.js',
  fetchModel: fetch,
  getInterfaceLanguage: () => 'zh-Hans',
  isMobile: () => false,
}

describe('sherpaw transcription definition', () => {
  it('uses host models for its settings and creates a local request', async () => {
    const definition = createSherpawTranscriptionDefinition(host)
    const schema = await definition.createProviderConfig({ t: key => key })

    expect(z.parse(schema, {})).toEqual({ model: 'paraformer-zh-en', modelLanguageFilter: 'zh' })
    expect(z.parse(schema, { modelLanguageFilter: 'ja' })).toEqual({ model: 'paraformer-zh-en', modelLanguageFilter: 'ja' })
    expect(() => z.parse(schema, { modelLanguageFilter: 'fr' })).toThrow()
    expect(await definition.isAvailableBy?.()).toBe(false)

    const provider = await definition.createProvider({ model: 'paraformer-zh-en' })
    if (!('transcription' in provider))
      throw new Error('Sherpaw did not create a transcription provider.')

    expect(provider.transcription('paraformer-zh-en')).toMatchObject({
      baseURL: 'sherpaw://transcription',
      model: 'paraformer-zh-en',
    })
  })

  it.each([false, true])('selects a Japanese model on mobile: %s', async (mobile) => {
    const definition = createSherpawTranscriptionDefinition({
      ...host,
      models: [
        ...host.models,
        {
          model: zipformerMultilingual,
          files: host.models[0].files,
        },
      ],
      getInterfaceLanguage: () => 'ja-JP',
      isMobile: () => mobile,
    })
    const schema = await definition.createProviderConfig({ t: key => key })

    expect(z.parse(schema, {})).toEqual({ model: 'zipformer-multilingual', modelLanguageFilter: 'ja' })
  })

  it.each(['zh-Hans', 'en-US'])('prefers X-ASR for %s on desktop', async (language) => {
    const definition = createSherpawTranscriptionDefinition({
      ...host,
      models: [
        ...host.models,
        { model: xAsrBilingualZhEnInt8, files: host.models[0].files },
      ],
      getInterfaceLanguage: () => language,
    })
    const schema = await definition.createProviderConfig({ t: key => key })

    expect(z.parse(schema, {}).model).toBe('x-asr-zh-en-480ms-int8')
  })

  it.each(['zh-Hans', 'en-US'])('prefers Paraformer for %s on mobile', async (language) => {
    const definition = createSherpawTranscriptionDefinition({
      ...host,
      models: [
        ...host.models,
        { model: xAsrBilingualZhEnInt8, files: host.models[0].files },
      ],
      getInterfaceLanguage: () => language,
      isMobile: () => true,
    })
    const schema = await definition.createProviderConfig({ t: key => key })

    expect(z.parse(schema, {}).model).toBe('paraformer-zh-en')
  })

  it('rejects a request without a Sherpaw transport', () => {
    expect(() => executeSherpawStream({})).toThrow('Sherpaw transcription requires a local Provider request.')
  })
})
