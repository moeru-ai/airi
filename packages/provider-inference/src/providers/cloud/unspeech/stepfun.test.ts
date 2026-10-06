import { describe, expect, it, vi } from 'vitest'

import { providerStepfunSpeech } from '.'
import { executeSpeech } from '../../../speech'

const UNSPEECH_URL = 'http://unspeech.local:5933/v1/'

async function speak(options?: object) {
  const fetchSpeech = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/mpeg' } }))
  const provider = await providerStepfunSpeech.createProvider({ apiKey: 'sk-step', baseUrl: UNSPEECH_URL })

  await executeSpeech(provider, {
    model: 'stepaudio-2.5-tts',
    text: 'hello',
    voice: 'cixingnansheng',
    providerOptions: options,
    fetch: fetchSpeech,
  })

  const [url, init] = fetchSpeech.mock.calls[0]
  return { url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> }
}

describe('providerStepfunSpeech', () => {
  it('prefixes the model and posts to the unspeech speech endpoint', async () => {
    const { url, body } = await speak()

    expect(url).toBe(`${UNSPEECH_URL}audio/speech`)
    expect(body).toMatchObject({ model: 'stepfun/stepaudio-2.5-tts', input: 'hello', voice: 'cixingnansheng' })
    expect(body).not.toHaveProperty('extra_body')
  })

  it('sends StepFun options as unspeech extra_body fields', async () => {
    const { body } = await speak({
      endpointProfile: 'step-plan',
      volume: 1.5,
      sampleRate: 16000,
      instruction: 'calm',
      markdownFilter: true,
      pronunciationMap: { tone: ['a/b'] },
      voiceLabel: { emotion: 'happy' },
    })

    expect(body.extra_body).toEqual({
      endpoint_profile: 'step-plan',
      volume: 1.5,
      sample_rate: 16000,
      instruction: 'calm',
      markdown_filter: true,
      pronunciation_map: { tone: ['a/b'] },
      voice_label: { emotion: 'happy' },
    })
  })

  it('omits options that the caller did not set', async () => {
    const { body } = await speak({ volume: 0.5 })

    expect(body.extra_body).toEqual({ volume: 0.5 })
  })
})
