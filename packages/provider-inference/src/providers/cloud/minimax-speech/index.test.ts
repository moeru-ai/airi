import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

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

/** MiniMax reports a rejected key with this payload and HTTP 200. */
const INVALID_KEY_PAYLOAD = { base_resp: { status_code: 1004, status_msg: 'invalid api key' } }

const ACCEPTED_CATALOG = {
  system_voice: [{ voice_id: 'English_Graceful_Lady', voice_name: 'Graceful Lady' }],
  base_resp: { status_code: 0, status_msg: 'success' },
}

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

function sseResponse(events: string[]) {
  return new Response(`${events.join('\n\n')}\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** One accepted audio chunk. The hex payload decodes to three bytes. */
function audioEvent() {
  return 'data: {"data":{"audio":"494433","status":1},"base_resp":{"status_code":0,"status_msg":"success"}}'
}

function refusalEvent(payload: unknown) {
  return `data: ${JSON.stringify(payload)}`
}

/**
 * Drives the adapter the way the shared generator does, against a stubbed
 * endpoint. Returns the model the adapter reported and the audio it produced.
 */
async function synthesize(body: string, responseInit?: ResponseInit) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(body, responseInit))
  vi.stubGlobal('fetch', fetchMock)

  const provider = await providerMinimaxSpeech.createProvider(config) as SpeechProviderWithExtraOptions<string, { model?: string }>
  const options = provider.speech('speech-2.8-turbo')

  const response = await options.fetch!(new URL('https://api.minimax.io/v1/audio/speech'), {
    method: 'POST',
    body: JSON.stringify({ input: 'hola', voice: 'Spanish_SereneWoman', model: options.model }),
  })

  const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as { model: string }

  return {
    requested: options.model,
    sentModel: sent.model,
    audioBytes: (await response.arrayBuffer()).byteLength,
  }
}

async function validateConfig(providerConfig: { apiKey: string, baseUrl?: string }) {
  const context = { t: (key: string) => key }
  const validator = await providerMinimaxSpeech.validators!.validateConfig![0](context)

  return await validator.validator(providerConfig, context)
}

describe('providerMinimaxSpeech voice catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the account catalog from the get_voice endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => voiceResponse({
      system_voice: [{ voice_id: 'English_Graceful_Lady', voice_name: 'Graceful Lady' }],
      base_resp: { status_code: 0, status_msg: 'success' },
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

  // A transport failure proves nothing about the key, so the built-in list keeps
  // the selector usable. This is the only case that may fall back.
  it('falls back to the built-in voices when the API is unreachable', async () => {
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

  // ROOT CAUSE:
  //
  // A rejected key answers HTTP 200 with an error payload. The catalog read
  // only the status code, found no voices, and returned the built-in list.
  //
  // A populated selector then read as a working account while the key was
  // refused, so the failure stayed invisible until synthesis.
  it('reports a refused key instead of returning the built-in voices', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => voiceResponse(INVALID_KEY_PAYLOAD)))

    await expect(readVoices()).rejects.toThrow('invalid api key')
  })
})

describe('providerMinimaxSpeech synthesis model', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ROOT CAUSE:
  //
  // The adapter returned a fixed `speech-2.8-hd` and dropped the model argument.
  // The settings page selector therefore changed nothing: the request always
  // asked for HD, even when the user chose Turbo.
  it('synthesizes with the model the caller requested', async () => {
    const { requested, sentModel } = await synthesize(`${audioEvent()}\n\ndata: [DONE]`)

    expect(requested).toBe('speech-2.8-turbo')
    expect(sentModel).toBe('speech-2.8-turbo')
  })

  // A caller that names no model still needs a valid one, because the request
  // body is built from `options.model`.
  it('falls back to the default model when the caller names none', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([audioEvent()]))
    vi.stubGlobal('fetch', fetchMock)

    const provider = await providerMinimaxSpeech.createProvider(config) as SpeechProviderWithExtraOptions<string, { model?: string }>
    const options = provider.speech('')

    expect(options.model).toBe('speech-2.8-hd')

    await options.fetch!(new URL('https://api.minimax.io/v1/audio/speech'), {
      method: 'POST',
      body: JSON.stringify({ input: 'hola', voice: 'Spanish_SereneWoman', model: options.model }),
    })

    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as { model: string }
    expect(sent.model).toBe('speech-2.8-hd')
  })

  it('returns the decoded audio of an accepted stream', async () => {
    const { audioBytes } = await synthesize(`${audioEvent()}\n\ndata: [DONE]`)

    expect(audioBytes).toBe(3)
  })
})

describe('providerMinimaxSpeech API errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ROOT CAUSE:
  //
  // MiniMax answers a refused synthesis with HTTP 200 and a stream that carries
  // only the error envelope. The adapter ignored it and returned zero audio
  // bytes as a successful response.
  //
  // The playground then played a `0:00 / 0:00` player with no error.
  it('surfaces a refusal that arrives inside a 200 stream', async () => {
    await expect(synthesize(`${refusalEvent(INVALID_KEY_PAYLOAD)}\n\ndata: [DONE]`))
      .rejects
      .toThrow('invalid api key')
  })

  // A refusal can also arrive after audio started. Returning the earlier chunks
  // would play a truncated clip as a success.
  it('discards audio that a later refusal invalidated', async () => {
    await expect(synthesize(`${audioEvent()}\n\n${refusalEvent(INVALID_KEY_PAYLOAD)}\n\ndata: [DONE]`))
      .rejects
      .toThrow('invalid api key')
  })

  // A stream can also end with no audio and no stated reason. An empty body
  // must not become a successful player.
  it('rejects a stream that carries no audio', async () => {
    await expect(synthesize('data: [DONE]'))
      .rejects
      .toThrow('no audio')
  })

  it('surfaces the API message from a failed HTTP response', async () => {
    await expect(synthesize(JSON.stringify(INVALID_KEY_PAYLOAD), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })).rejects.toThrow('invalid api key')
  })

  // The same refusal can arrive as a plain JSON body on a 200, which is not an
  // event stream. Reading it as one would report a missing audio chunk instead
  // of the reason the request produced nothing.
  it('surfaces a refusal that arrives as a JSON body on a 200', async () => {
    await expect(synthesize(JSON.stringify(INVALID_KEY_PAYLOAD), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })).rejects.toThrow('invalid api key')
  })

  it('reports the HTTP status when a failure carries no API message', async () => {
    await expect(synthesize('', { status: 503, statusText: 'Service Unavailable' }))
      .rejects
      .toThrow('503')
  })
})

describe('providerMinimaxSpeech credential validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ROOT CAUSE:
  //
  // The validator only checked that the key was nonempty, so any string passed.
  // The module filters then treated a refused key as configured.
  it('reports a nonempty but refused key as invalid', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => voiceResponse(INVALID_KEY_PAYLOAD)))

    const result = await validateConfig(config)

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('invalid api key')
  })

  it('reports a key the account accepts as valid', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => voiceResponse(ACCEPTED_CATALOG)))

    const result = await validateConfig(config)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('reports a missing key without calling the API', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => voiceResponse(ACCEPTED_CATALOG))
    vi.stubGlobal('fetch', fetchMock)

    const result = await validateConfig({ apiKey: '   ', baseUrl: config.baseUrl })

    expect(result.valid).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // An unreachable API cannot prove the key is wrong, so it must not fail
  // validation on a flaky network.
  it('does not fail validation when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    }))

    const result = await validateConfig(config)

    expect(result.valid).toBe(true)
  })
})
