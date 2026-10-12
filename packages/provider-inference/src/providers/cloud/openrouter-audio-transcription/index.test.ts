import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerOpenRouterAudioTranscription } from './index'

describe('providerOpenRouterAudioTranscription', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('localizes catalog request errors and keeps the response status and detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Invalid API key', { status: 401 })))
    const config = { apiKey: 'test-key', baseUrl: 'https://openrouter.ai/api/v1' }
    const provider = await providerOpenRouterAudioTranscription.createProvider(config)
    const listModels = providerOpenRouterAudioTranscription.extraMethods?.listModels
    if (!listModels)
      throw new Error('The provider has no model catalog method')

    await expect(listModels(config, provider, { t: key => `[translated:${key}]` })).rejects.toThrow(
      '[translated:settings.pages.modules.hearing.sections.section.provider-model-selection.openrouter-catalog-error] 401 Invalid API key',
    )
  })
})
