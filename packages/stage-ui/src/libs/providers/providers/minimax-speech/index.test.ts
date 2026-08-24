import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerMinimaxSpeech } from './index'

describe('miniMax voice design', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['https://api.minimax.io', 'https://api.minimax.io/v1/voice_design'],
    ['https://api.minimaxi.com', 'https://api.minimaxi.com/v1/voice_design'],
  ])('posts the design request to the %s endpoint', async (baseUrl, expectedUrl) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      voice_id: 'custom-voice-1',
      base_resp: { status_code: 0 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const config = { apiKey: 'test-key', baseUrl }
    const provider = providerMinimaxSpeech.createProvider(config)
    const result = await providerMinimaxSpeech.extraMethods?.designVoice?.(
      config,
      provider,
      { prompt: 'A warm, calm narrator', voiceId: 'custom-voice-1' },
    )

    expect(result).toEqual({ voiceId: 'custom-voice-1' })
    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({ prompt: 'A warm, calm narrator', voice_id: 'custom-voice-1' }),
    }))
  })

  it('rejects unsuccessful responses and missing voice ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      base_resp: { status_code: 1004, status_msg: 'invalid prompt' },
    }), { status: 400, statusText: 'Bad Request' })))

    const config = { apiKey: 'test-key', baseUrl: 'https://api.minimax.io' }
    const provider = providerMinimaxSpeech.createProvider(config)
    await expect(providerMinimaxSpeech.extraMethods?.designVoice?.(
      config,
      provider,
      { prompt: 'prompt', voiceId: 'voice' },
    )).rejects.toThrow('MiniMax voice design request failed')
  })

  it('advertises voice design in model metadata', async () => {
    const models = await providerMinimaxSpeech.extraMethods?.listModels?.(
      { apiKey: 'test-key', baseUrl: 'https://api.minimax.io' },
      providerMinimaxSpeech.createProvider({ apiKey: 'test-key', baseUrl: 'https://api.minimax.io' }),
    )

    expect(models?.find(model => model.id === 'voice-design')).toMatchObject({
      capabilities: ['voice-design'],
    })
  })
})
