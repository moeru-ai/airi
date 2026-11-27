import { parse, safeParse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { artistryGlobalsSchema, artistrySyncConfigPayloadSchema, OPENAI_IMAGE_DEFAULTS } from './artistry'

describe('artistry image settings', () => {
  it('loads image defaults through the shared persistence and sync schema', () => {
    expect(parse(artistryGlobalsSchema, {})).toMatchObject({
      openaiImageApiKey: '',
      openaiImageBaseUrl: OPENAI_IMAGE_DEFAULTS.baseUrl,
      openaiImageModel: OPENAI_IMAGE_DEFAULTS.model,
      openaiImageWidth: '',
      openaiImageHeight: '',
    })
  })

  it('keeps independent image credentials and dimensions across validated sync', () => {
    const image = {
      openaiImageApiKey: 'image-key',
      openaiImageBaseUrl: 'https://example.com/v1/',
      openaiImageModel: 'image-model',
      openaiImageWidth: '1536',
      openaiImageHeight: '1024',
    }
    expect(parse(artistrySyncConfigPayloadSchema, { provider: 'openai-image', globals: image }).globals).toMatchObject(image)
    expect(safeParse(artistryGlobalsSchema, { ...image, openaiImageWidth: 1536 }).success).toBe(false)
  })
})
