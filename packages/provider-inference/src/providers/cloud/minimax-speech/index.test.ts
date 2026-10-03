import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerMinimaxSpeech } from './index'

const listVoices = providerMinimaxSpeech.extraMethods!.listVoices!

const config = { apiKey: 'sk-test', baseUrl: 'https://api.minimax.io' }

/**
 * Voice IDs copied from the official System Voice ID List. The built-in list
 * must stay a subset of this set.
 * https://platform.minimax.io/docs/api-reference/system-voice-id
 */
const DOCUMENTED_VOICE_IDS = new Set([
  'English_Graceful_Lady',
  'English_radiant_girl',
  'English_expressive_narrator',
  'English_Upbeat_Woman',
  'English_Trustworth_Man',
  'Spanish_SereneWoman',
  'Spanish_Narrator',
  'Spanish_WiseScholar',
  'Spanish_ConfidentWoman',
  'Chinese (Mandarin)_Reliable_Executive',
  'Chinese (Mandarin)_News_Anchor',
  'Cantonese_ProfessionalHost (F)',
])

/** Runs the adapter the way the provider store does, with a real instance. */
async function readVoices() {
  const provider = await providerMinimaxSpeech.createProvider(config)

  return await listVoices(config, provider)
}

function voiceResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('providerMinimaxSpeech voice catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the account catalog from the get_voice endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => voiceResponse({
      system_voice: [{ voice_id: 'English_Graceful_Lady', voice_name: 'Graceful Lady' }],
      base_resp: { status_code: 0 },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const voices = await readVoices()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.minimax.io/v1/get_voice')
    expect(voices.map(voice => voice.id)).toEqual(['English_Graceful_Lady'])
  })

  it('tags a Spanish system voice with the es locale', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => voiceResponse({
      system_voice: [{ voice_id: 'Spanish_SereneWoman', voice_name: 'Serene Woman', description: ['Voz tranquila'] }],
    })))

    const voices = await readVoices()

    expect(voices[0]!.languages).toEqual([{ code: 'es', title: 'Spanish' }])
    expect(voices[0]!.description).toBe('Voz tranquila')
  })

  it('keeps the same display name apart by locale', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => voiceResponse({
      system_voice: [
        { voice_id: 'English_SereneWoman', voice_name: 'Serene Woman' },
        { voice_id: 'Spanish_SereneWoman', voice_name: 'Serene Woman' },
        { voice_id: 'Portuguese_SereneWoman', voice_name: 'Serene Woman' },
      ],
    })))

    const voices = await readVoices()

    expect(voices.map(voice => voice.languages[0]!.code)).toEqual(['en', 'es', 'pt'])
  })

  // ROOT CAUSE:
  //
  // A failing account call must not empty the selector. The page needs a voice
  // list even when the network call fails.
  it('falls back to the built-in voices when the call fails', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    }))

    const voices = await readVoices()

    expect(voices.length).toBeGreaterThan(0)
    expect(voices[0]!.id).toBe('English_Graceful_Lady')
  })

  // ROOT CAUSE:
  //
  // The built-in list carried voice IDs that the account does not own, such as
  // `Mandarin_Sweet_Girl`. The synthesis call then sent an unknown voice_id.
  //
  // Every built-in ID must appear in the official System Voice ID List.
  // https://platform.minimax.io/docs/api-reference/system-voice-id
  it('uses only documented voice IDs in the built-in list', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    }))

    const voices = await readVoices()

    expect(voices.every(voice => DOCUMENTED_VOICE_IDS.has(voice.id))).toBe(true)
  })

  it('offers a Spanish voice in the built-in list', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    }))

    const voices = await readVoices()

    expect(voices.some(voice => voice.languages[0]?.code === 'es')).toBe(true)
  })

  it('keeps cloned and generated voices without a language', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => voiceResponse({
      system_voice: [{ voice_id: 'Spanish_SereneWoman', voice_name: 'Serene Woman' }],
      voice_cloning: [{ voice_id: 'test12345' }],
      voice_generation: [{ voice_id: 'ttv-voice-2025082011321125-2uEN0X1S' }],
    })))

    const voices = await readVoices()

    expect(voices.map(voice => voice.id)).toEqual([
      'Spanish_SereneWoman',
      'test12345',
      'ttv-voice-2025082011321125-2uEN0X1S',
    ])
    expect(voices[1]!.languages).toEqual([{ code: 'und', title: 'Unknown' }])
  })
})
