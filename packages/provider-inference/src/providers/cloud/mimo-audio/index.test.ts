import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerMimoAudioTranscription } from './index'

describe('providerMimoAudioTranscription', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists only the current Xiaomi ASR model', async () => {
    const models = await providerMimoAudioTranscription.extraMethods!.listModels!({}, {} as never)
    expect(models.map(model => model.id)).toEqual(['mimo-v2.5-asr'])
  })

  it('defaults the transcription model to mimo-v2.5-asr', async () => {
    const provider = await providerMimoAudioTranscription.createProvider({
      apiKey: 'mimo_test',
    }) as TranscriptionProviderWithExtraOptions<string, Record<string, never>>

    expect(provider.transcription('').model).toBe('mimo-v2.5-asr')
  })

  it('sends a Data URL audio payload with asr_options for Xiaomi ASR', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'hello from mimo' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = await providerMimoAudioTranscription.createProvider({
      apiKey: 'mimo_test',
      baseUrl: 'https://api.xiaomimimo.com/v1/',
    }) as TranscriptionProviderWithExtraOptions<string, Record<string, never>>
    const options = provider.transcription('mimo-v2.5-asr')

    const form = new FormData()
    form.set('model', 'mimo-v2.5-asr')
    form.set('file', new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/wav' }), 'sample.wav')

    const response = await options.fetch!(new URL('https://api.xiaomimimo.com/v1/audio/transcriptions'), {
      method: 'POST',
      body: form,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'api-key': 'mimo_test',
    })

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      model: string
      messages: Array<{ role: string, content: Array<{ type: string, input_audio?: { data: string, format?: string } }> }>
      asr_options: { language: string }
    }

    expect(requestBody.model).toBe('mimo-v2.5-asr')
    expect(requestBody.asr_options).toEqual({ language: 'auto' })
    expect(requestBody.messages).toHaveLength(1)
    expect(requestBody.messages[0]?.content).toHaveLength(1)
    expect(requestBody.messages[0]?.content[0]?.type).toBe('input_audio')
    expect(requestBody.messages[0]?.content[0]?.input_audio?.data).toMatch(/^data:audio\/wav;base64,/)
    expect(requestBody.messages[0]?.content[0]?.input_audio?.format).toBeUndefined()

    expect(await response.json()).toEqual({ text: 'hello from mimo' })
  })
})
