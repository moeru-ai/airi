import { generateSpeech } from '@xsai/generate-speech'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerOpenRouterAudioSpeech } from './index'

const config = {
  apiKey: 'test-key',
  baseUrl: 'https://openrouter.example.com/v1/',
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function model(id: string, name = id, modality = 'speech') {
  return {
    id,
    name,
    description: `${name} description`,
    context_length: 1024,
    architecture: { output_modalities: [modality] },
    endpoints: [modality === 'speech' ? '/api/v1/audio/speech' : '/api/v1/chat/completions'],
  }
}

function mockCatalog(synthesize: typeof fetch, models = [
  model('heygen/heygen-voice-1-turbo'),
  model('minimax/speech-2.8-hd'),
  model('openai/gpt-audio-mini', 'GPT Audio Mini', 'audio'),
]) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/models')) {
      const modality = url.searchParams.get('output_modalities') === 'speech' ? 'speech' : 'audio'
      return jsonResponse(models.filter(entry => entry.architecture.output_modalities.includes(modality)))
    }
    return synthesize(input, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function chatResponse(chunks = [Uint8Array.from([1, 0, 2, 0])]) {
  const events = chunks.map(chunk => ({ choices: [{ delta: { audio: { data: btoa(String.fromCharCode(...chunk)) } } }] }))
  return new Response(`${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function getSpeechOptions(provider: Awaited<ReturnType<typeof providerOpenRouterAudioSpeech.createProvider>>, modelId: string) {
  if (!('speech' in provider))
    throw new Error('OpenRouter audio provider has no speech method')

  return provider.speech(modelId)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('openRouter speech model catalog', () => {
  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  //
  // The audio-only query excluded dedicated speech models. We merge both discovered catalogs.
  it('regression for Issue #3456: lists speech models and keeps chat-audio models', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.searchParams.get('output_modalities') === 'speech') {
        return jsonResponse([model('heygen/heygen-voice-1-turbo', 'HeyGen Voice Turbo')])
      }

      if (url.searchParams.get('output_modality') === 'audio') {
        return jsonResponse([model('openai/gpt-audio-mini', 'GPT Audio Mini', 'audio')])
      }

      return new Response('Unexpected models request', { status: 400 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const listModels = providerOpenRouterAudioSpeech.extraMethods?.listModels
    if (!listModels)
      throw new Error('OpenRouter audio provider has no model catalog')

    const models = await listModels(config, provider)

    expect(models.map(({ id }) => id)).toEqual([
      'heygen/heygen-voice-1-turbo',
      'openai/gpt-audio-mini',
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).search)).toContain('?output_modalities=speech')
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).search)).toContain('?output_modality=audio')
  })
})

describe('openRouter speech voice catalog', () => {
  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  //
  // The fixed OpenAI list leaked across models. We now use each model's supported_voices.
  it('regression for Issue #3456: lists model voices and leaves models without listed voices empty', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse([
      { ...model('heygen/heygen-voice-1-turbo'), supported_voices: ['nadine', 'tabitha'] },
      model('fish-audio/s2.1-pro-free:free'),
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const listVoices = providerOpenRouterAudioSpeech.extraMethods?.listVoices
    if (!listVoices)
      throw new Error('OpenRouter audio provider has no voice catalog')
    const heygenVoices = await listVoices(config, provider, 'heygen/heygen-voice-1-turbo')
    const fishVoices = await listVoices(config, provider, 'fish-audio/s2.1-pro-free:free')

    expect(heygenVoices.map(({ id }) => id)).toEqual(['nadine', 'tabitha'])
    expect(heygenVoices.every(voice => voice.compatibleModels?.includes('heygen/heygen-voice-1-turbo'))).toBe(true)
    expect(fishVoices).toEqual([])
  })
})

describe('openRouter speech endpoint', () => {
  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  //
  // Every model used chat completions. Discovered speech capabilities now select the binary TTS endpoint.
  it('regression for Issue #3456: sends speech to the TTS endpoint and preserves MP3 bytes', async () => {
    const audio = Uint8Array.from([0x49, 0x44, 0x33, 0x00])
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(audio, {
      headers: { 'Content-Type': 'audio/mpeg' },
    }))
    mockCatalog(fetchMock)

    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const request = getSpeechOptions(provider, 'minimax/speech-2.8-hd')
    if (!request.fetch)
      throw new Error('OpenRouter speech request has no custom fetch')

    const response = await request.fetch(new URL('https://openrouter.example.com/v1/audio/speech'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'minimax/speech-2.8-hd',
        input: 'Hello from a local test.',
        voice: 'English_Graceful_Lady',
        response_format: 'mp3',
      }),
    })

    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://openrouter.example.com/v1/audio/speech')
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      model: 'minimax/speech-2.8-hd',
      input: 'Hello from a local test.',
      voice: 'English_Graceful_Lady',
      response_format: 'mp3',
    })
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...audio])
  })

  it('passes upstream errors through as failed requests', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('Invalid voice', { status: 400 }))
    mockCatalog(fetchMock)

    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const request = getSpeechOptions(provider, 'heygen/heygen-voice-1-turbo')
    if (!request.fetch)
      throw new Error('OpenRouter speech request has no custom fetch')

    await expect(request.fetch(new URL('https://openrouter.example.com/v1/audio/speech'), {
      method: 'POST',
      body: JSON.stringify({ model: 'heygen/heygen-voice-1-turbo', input: 'Hello.', voice: 'unknown' }),
    })).rejects.toThrow('400 Invalid voice')
  })

  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  //
  // The custom fetch dropped the caller signal. Discovery and synthesis now forward it.
  it('regression for Issue #3456: forwards an abort signal to the upstream request', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.signal !== controller.signal)
        throw new Error('Abort signal was not forwarded')
      controller.abort()
      throw new DOMException('The operation was aborted', 'AbortError')
    })
    mockCatalog(fetchMock)

    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const request = getSpeechOptions(provider, 'heygen/heygen-voice-1-turbo')
    if (!request.fetch)
      throw new Error('OpenRouter speech request has no custom fetch')

    await expect(request.fetch(new URL('https://openrouter.example.com/v1/audio/speech'), {
      method: 'POST',
      body: JSON.stringify({ model: 'heygen/heygen-voice-1-turbo', input: 'Hello.', voice: 'nadine' }),
      signal: controller.signal,
    })).rejects.toThrow('The operation was aborted')
  })
})

describe('openRouter chat-audio endpoint', () => {
  it('keeps chat-audio models on the existing SSE-to-WAV path', async () => {
    const pcm = btoa(String.fromCharCode(1, 0, 2, 0))
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}`,
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    mockCatalog(fetchMock)

    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const request = getSpeechOptions(provider, 'openai/gpt-audio-mini')
    if (!request.fetch)
      throw new Error('OpenRouter speech request has no custom fetch')

    const response = await request.fetch(new URL('https://openrouter.example.com/v1/audio/speech'), {
      method: 'POST',
      body: JSON.stringify({ input: 'Hello.', voice: 'alloy' }),
    })

    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://openrouter.example.com/v1/chat/completions')
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({
      model: 'openai/gpt-audio-mini',
      modalities: ['text', 'audio'],
      audio: { voice: 'alloy', format: 'pcm16' },
      stream: true,
    })
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    expect(new TextDecoder().decode(await response.arrayBuffer()).slice(0, 4)).toBe('RIFF')
  })
})

const listModels = providerOpenRouterAudioSpeech.extraMethods!.listModels!
const listVoices = providerOpenRouterAudioSpeech.extraMethods!.listVoices!

async function synthesize(modelId: string, options: Partial<Parameters<typeof generateSpeech>[0]> = {}) {
  const provider = await providerOpenRouterAudioSpeech.createProvider(config)
  return generateSpeech({
    ...getSpeechOptions(provider, modelId),
    input: 'Hello.',
    voice: 'test-voice',
    ...options,
  })
}

describe('openRouter discovered capabilities', () => {
  it('merges duplicate endpoint capabilities and voices without duplicate model IDs', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => jsonResponse(
      new URL(String(input)).searchParams.has('output_modalities')
        ? [{ ...model('openai/gpt-audio-mini', 'Speech entry'), supported_voices: ['voice-a'] }]
        : [{ ...model('openai/gpt-audio-mini', 'Chat entry', 'audio'), supported_voices: ['voice-a', 'voice-b'] }],
    ))
    vi.stubGlobal('fetch', fetchMock)
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const models = await listModels(config, provider)
    const voices = await listVoices(config, provider, 'openai/gpt-audio-mini')

    expect(models.map(entry => entry.id)).toEqual(['openai/gpt-audio-mini'])
    expect(models[0]?.name).toBe('Speech entry')
    expect(voices.map(entry => entry.id)).toEqual(['voice-a', 'voice-b'])

    fetchMock.mockImplementation(async () => new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
    await generateSpeech({ ...getSpeechOptions(provider, 'openai/gpt-audio-mini'), input: 'Hello.', voice: 'voice-a' })
    expect(String(fetchMock.mock.lastCall?.[0])).toBe(`${config.baseUrl}audio/speech`)
  })

  it('excludes music and unsupported audio models and respects advertised endpoints', async () => {
    mockCatalog(vi.fn(), [
      model('google/lyria-3-pro-preview', 'Music', 'audio'),
      model('example/new-audio', 'Unknown audio', 'audio'),
      { ...model('example/incompatible-speech'), endpoints: ['/api/v1/chat/completions'] },
      { ...model('openai/gpt-audio', 'Chat', 'audio'), endpoints: ['/api/v1/audio/speech'] },
      model('example/dedicated-speech'),
      model('openai/gpt-audio-mini', 'Chat', 'audio'),
    ])
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const models = await listModels(config, provider)

    expect(models.map(entry => entry.id)).toEqual(['example/dedicated-speech', 'openai/gpt-audio-mini'])
  })

  it('routes each selected model independently on the same provider instance', async () => {
    const upstream = vi.fn<typeof fetch>(async input => new URL(String(input)).pathname.endsWith('/chat/completions')
      ? chatResponse()
      : new Response('mp3-bytes', { headers: { 'Content-Type': 'audio/mpeg' } }))
    mockCatalog(upstream)
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const speech = await generateSpeech({ ...getSpeechOptions(provider, 'minimax/speech-2.8-hd'), input: 'Hello.', voice: 'test-voice' })
    const chat = await generateSpeech({ ...getSpeechOptions(provider, 'openai/gpt-audio-mini'), input: 'Hello.', voice: 'alloy' })

    expect(new TextDecoder().decode(speech)).toBe('mp3-bytes')
    expect(new TextDecoder().decode(chat.slice(0, 4))).toBe('RIFF')
    expect(upstream.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual(['/v1/audio/speech', '/v1/chat/completions'])
    expect(upstream.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model)).toEqual(['minimax/speech-2.8-hd', 'openai/gpt-audio-mini'])
  })

  it('rejects an undiscovered model before synthesis instead of guessing from its name', async () => {
    const upstream = vi.fn<typeof fetch>()
    mockCatalog(upstream)
    await expect(synthesize('example/unknown-tts')).rejects.toThrow('does not advertise')
    expect(upstream).not.toHaveBeenCalled()
  })

  it('routes a discovered OpenAI speech model through audio/speech', async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
    mockCatalog(upstream, [model('openai/gpt-4o-mini-tts-2025-12-15')])
    await synthesize('openai/gpt-4o-mini-tts-2025-12-15')
    expect(String(upstream.mock.lastCall?.[0])).toBe(`${config.baseUrl}audio/speech`)
  })
})

describe('openRouter voice policy', () => {
  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  //
  // OpenRouter omits voice metadata for both supported chat-audio models.
  // The supported OpenAI voice list applies only to these models when metadata is missing.
  it.each([
    { id: 'openai/gpt-audio', supportedVoices: null },
    { id: 'openai/gpt-audio', supportedVoices: undefined },
    { id: 'openai/gpt-audio-mini', supportedVoices: null },
    { id: 'openai/gpt-audio-mini', supportedVoices: undefined },
  ])('preserves the 13 chat voices for $id with $supportedVoices metadata', async ({ id, supportedVoices }) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse([
      { ...model(id, id, 'audio'), supported_voices: supportedVoices },
    ])))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const voices = await listVoices(config, provider, id)

    expect(voices.map(voice => voice.id)).toEqual([
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'onyx',
      'nova',
      'sage',
      'shimmer',
      'verse',
      'marin',
      'cedar',
    ])
    expect(voices.every(voice => voice.compatibleModels?.includes(id))).toBe(true)
  })

  it.each([{ supportedVoices: [] }, { supportedVoices: ['api-voice'] }])('honors an explicit chat voice catalog: $supportedVoices', async ({ supportedVoices }) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse([
      { ...model('openai/gpt-audio', 'Chat', 'audio'), supported_voices: supportedVoices },
    ])))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    expect((await listVoices(config, provider, 'openai/gpt-audio')).map(voice => voice.id)).toEqual(supportedVoices)
  })

  it.each([{ supportedVoices: undefined }, { supportedVoices: null }, { supportedVoices: [] }])('keeps dedicated speech voices empty for $supportedVoices metadata', async ({ supportedVoices }) => {
    const ids = ['fish-audio/s2.1-pro-free:free', 'heygen/heygen-voice-1', 'google/gemini-3.8-flash-tts', 'openai/gpt-audio']
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse(
      ids.map(id => ({ ...model(id), supported_voices: supportedVoices })),
    )))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    for (const id of ids)
      expect(await listVoices(config, provider, id)).toEqual([])
  })

  it('accepts an explicit Fish voice when its catalog is empty', async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
    mockCatalog(upstream, [model('fish-audio/s2.1-pro-free:free')])
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    expect(await listVoices(config, provider, 'fish-audio/s2.1-pro-free:free')).toEqual([])

    await generateSpeech({
      ...getSpeechOptions(provider, 'fish-audio/s2.1-pro-free:free'),
      input: 'Hello.',
      voice: 'custom-fish-voice',
    })
    expect(JSON.parse(String(upstream.mock.lastCall?.[1]?.body)).voice).toBe('custom-fish-voice')
  })
})

describe('openRouter generateSpeech boundary', () => {
  it('preserves MP3 bytes, speech parameters, authentication, attribution, and caller headers', async () => {
    const audio = Uint8Array.from([0x49, 0x44, 0x33, 0, 255, 128, 1])
    const upstream = vi.fn<typeof fetch>(async () => new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } }))
    const requests = mockCatalog(upstream)
    const bytes = await synthesize('minimax/speech-2.8-hd', {
      voice: 'English_Graceful_Lady',
      instructions: 'Speak softly.',
      speed: 0.9,
      headers: { 'X-Test': 'test-value' },
    })

    expect(new Uint8Array(bytes)).toEqual(audio)
    expect(String(upstream.mock.lastCall?.[0])).toBe(`${config.baseUrl}audio/speech`)
    expect(JSON.parse(String(upstream.mock.lastCall?.[1]?.body))).toEqual({
      model: 'minimax/speech-2.8-hd',
      input: 'Hello.',
      voice: 'English_Graceful_Lady',
      instructions: 'Speak softly.',
      speed: 0.9,
      response_format: 'mp3',
    })
    expect(new Headers(upstream.mock.lastCall?.[1]?.headers).get('X-Test')).toBe('test-value')
    for (const [, init] of requests.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer test-key')
      expect(headers.get('HTTP-Referer')).toBe('https://airi.moeru.ai/')
      expect(headers.get('X-OpenRouter-Title')).toBe('Project AIRI')
    }
  })

  it.each([
    ['heygen/heygen-voice-1', 44100],
    ['heygen/heygen-voice-1-turbo', 44100],
    ['heygen/heygen-voice-1-turbo:free', 44100],
    ['google/gemini-3.1-flash-tts-preview', 24000],
    ['google/gemini-3.8-flash-tts', 24000],
    ['google/gemini-3.8-flash-lite-tts', 24000],
  ] as const)('wraps %s PCM with its documented rate of %i Hz', async (id, rate) => {
    const pcm = Uint8Array.from([0, 128, 255, 127, 0, 0, 1, 0])
    const upstream = vi.fn<typeof fetch>(async () => new Response(pcm, { headers: { 'Content-Type': 'audio/pcm' } }))
    mockCatalog(upstream, [model(id)])
    const audio = await synthesize(id)
    const header = new DataView(audio)

    expect(JSON.parse(String(upstream.mock.lastCall?.[1]?.body)).response_format).toBe('pcm')
    expect(new TextDecoder().decode(audio.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(audio.slice(8, 12))).toBe('WAVE')
    expect(header.getUint32(4, true)).toBe(36 + pcm.length)
    expect(header.getUint16(20, true)).toBe(1)
    expect(header.getUint16(22, true)).toBe(1)
    expect(header.getUint32(24, true)).toBe(rate)
    expect(header.getUint32(28, true)).toBe(rate * 2)
    expect(header.getUint16(32, true)).toBe(2)
    expect(header.getUint16(34, true)).toBe(16)
    expect(header.getUint32(40, true)).toBe(pcm.length)
    expect(new Uint8Array(audio, 44)).toEqual(pcm)
  })

  it.each(['audio/wav', 'audio/pcm'])('passes an existing Gemini WAV through unchanged with %s', async (contentType) => {
    // A complete mono PCM16 WAV containing two samples at 24 kHz.
    const wav = Uint8Array.from([
      82,
      73,
      70,
      70,
      40,
      0,
      0,
      0,
      87,
      65,
      86,
      69,
      102,
      109,
      116,
      32,
      16,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      192,
      93,
      0,
      0,
      128,
      187,
      0,
      0,
      2,
      0,
      16,
      0,
      100,
      97,
      116,
      97,
      4,
      0,
      0,
      0,
      1,
      0,
      2,
      0,
    ])
    mockCatalog(async () => new Response(wav, { headers: { 'Content-Type': contentType } }), [model('google/gemini-3.8-flash-tts')])
    const audio = await synthesize('google/gemini-3.8-flash-tts')
    expect(new Uint8Array(audio)).toEqual(wav)
  })

  it('rejects raw PCM when the model has no documented encoding contract', async () => {
    mockCatalog(async () => new Response(new Uint8Array([0, 0]), { headers: { 'Content-Type': 'audio/pcm' } }), [model('example/speech')])
    await expect(synthesize('example/speech')).rejects.toThrow('supported PCM encoding contract')
  })

  it.each([
    ['empty PCM', () => new Response(new Uint8Array(), { headers: { 'Content-Type': 'audio/pcm' } }), 'contains no audio'],
    ['odd PCM', () => new Response(new Uint8Array([1, 0, 2]), { headers: { 'Content-Type': 'audio/pcm' } }), 'incomplete 16-bit sample'],
    ['missing body', () => new Response(null), 'has no body'],
    ['body error', () => new Response('{"error":"Invalid voice"}', { headers: { 'Content-Type': 'application/json' } }), 'Invalid voice'],
    ['malformed WAV', () => new Response('not a wav file', { headers: { 'Content-Type': 'audio/wav' } }), 'supported PCM encoding contract'],
    ['HTTP error', () => new Response('Invalid voice', { status: 400 }), '400 Invalid voice'],
  ] as const)('rejects %s instead of returning unplayable audio', async (_name, response, error) => {
    mockCatalog(async () => response())
    await expect(synthesize('heygen/heygen-voice-1-turbo')).rejects.toThrow(error)
  })

  it('surfaces a body read failure', async () => {
    mockCatalog(async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('Body read failed')) },
    }), { headers: { 'Content-Type': 'audio/pcm' } }))
    await expect(synthesize('heygen/heygen-voice-1-turbo')).rejects.toThrow('Body read failed')
  })

  it('collects independently padded chat-audio chunks through generateSpeech', async () => {
    const pcm = [Uint8Array.from([1, 0]), Uint8Array.from([2, 0])]
    mockCatalog(async () => chatResponse(pcm))
    const audio = await synthesize('openai/gpt-audio-mini', { voice: 'alloy' })
    expect(new DataView(audio).getUint32(24, true)).toBe(24000)
    expect(new Uint8Array(audio, 44)).toEqual(Uint8Array.from([1, 0, 2, 0]))
  })

  it.each([
    ['upstream error', 'data: {"error":{"message":"Stream failed"}}\n\n', 'Stream failed'],
    ['empty stream', 'data: [DONE]\n\n', 'contains no audio'],
    ['malformed event', 'data: invalid-json\n\n', 'JSON'],
    ['invalid base64', 'data: {"choices":[{"delta":{"audio":{"data":"!"}}}]}\n\n', 'Invalid character'],
  ])('surfaces a chat %s', async (_name, body, error) => {
    mockCatalog(async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
    await expect(synthesize('openai/gpt-audio-mini', { voice: 'alloy' })).rejects.toThrow(error)
  })
})

describe('openRouter cancellation and catalog ownership', () => {
  it('rejects a pre-aborted generateSpeech call without a network request', async () => {
    const requests = mockCatalog(vi.fn())
    const controller = new AbortController()
    controller.abort()
    await expect(synthesize('heygen/heygen-voice-1-turbo', { abortSignal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests).not.toHaveBeenCalled()
  })

  it.each(['minimax/speech-2.8-hd', 'openai/gpt-audio-mini'])('forwards in-flight cancellation for %s', async (id) => {
    const controller = new AbortController()
    const upstream = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.signal).toBe(controller.signal)
      return new Response(new ReadableStream({
        start(stream) {
          init?.signal?.addEventListener('abort', () => stream.error(init.signal?.reason), { once: true })
          controller.abort()
        },
      }), { headers: { 'Content-Type': id === 'minimax/speech-2.8-hd' ? 'audio/mpeg' : 'text/event-stream' } })
    })
    const requests = mockCatalog(upstream)
    await expect(synthesize(id, { abortSignal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(upstream).toHaveBeenCalledOnce()
    expect(requests.mock.calls.every(([, init]) => init?.signal === controller.signal)).toBe(true)
  })

  it('discards aborted voice discovery and retries on the same instance', async () => {
    const controller = new AbortController()
    const requests = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.signal).toBe(controller.signal)
      controller.abort()
      return jsonResponse([{ ...model('heygen/heygen-voice-1-turbo'), supported_voices: ['stale-voice'] }])
    })
    vi.stubGlobal('fetch', requests)
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    await expect(listVoices(config, provider, 'heygen/heygen-voice-1-turbo', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })

    requests.mockImplementation(async () => jsonResponse([{ ...model('heygen/heygen-voice-1-turbo'), supported_voices: ['fresh-voice'] }]))
    expect((await listVoices(config, provider, 'heygen/heygen-voice-1-turbo')).map(voice => voice.id)).toEqual(['fresh-voice'])
    expect(requests).toHaveBeenCalledTimes(4)
  })

  it('reuses discovery for speech segments and refreshes an explicit model-list request', async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
    const requests = mockCatalog(upstream)
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const options = { ...getSpeechOptions(provider, 'minimax/speech-2.8-hd'), input: 'Hello.', voice: 'test-voice' }
    await generateSpeech(options)
    await generateSpeech(options)
    expect(requests).toHaveBeenCalledTimes(4)
    await listModels(config, provider)
    expect(requests).toHaveBeenCalledTimes(6)
  })

  it('isolates catalogs by provider instance, API root, and key', async () => {
    const requests = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input))
      const auth = new Headers(init?.headers).get('Authorization')
      const voice = url.origin === 'https://other.example.com' ? 'other-voice' : auth === 'Bearer other-test-key' ? 'new-key-voice' : 'original-voice'
      return jsonResponse([{ ...model('example/speech'), supported_voices: [voice] }])
    })
    vi.stubGlobal('fetch', requests)
    const otherRoot = { ...config, baseUrl: 'https://other.example.com/v1' }
    const otherKey = { ...config, apiKey: 'other-test-key' }
    const original = await providerOpenRouterAudioSpeech.createProvider(config)
    const changedRoot = await providerOpenRouterAudioSpeech.createProvider(otherRoot)
    const changedKey = await providerOpenRouterAudioSpeech.createProvider(otherKey)
    expect((await listVoices(config, original, 'example/speech'))[0]?.id).toBe('original-voice')
    expect((await listVoices(otherRoot, changedRoot, 'example/speech'))[0]?.id).toBe('other-voice')
    expect((await listVoices(otherKey, changedKey, 'example/speech'))[0]?.id).toBe('new-key-voice')
    expect((await listVoices(config, original, 'example/speech'))[0]?.id).toBe('original-voice')
    expect(requests).toHaveBeenCalledTimes(6)
    expect(providerOpenRouterAudioSpeech.extraMethods!.voiceCatalogConfig!(config)).not.toEqual(
      providerOpenRouterAudioSpeech.extraMethods!.voiceCatalogConfig!(otherRoot),
    )
    expect(providerOpenRouterAudioSpeech.extraMethods!.voiceCatalogConfig!(config)).not.toEqual(
      providerOpenRouterAudioSpeech.extraMethods!.voiceCatalogConfig!(otherKey),
    )
  })

  it('surfaces discovery errors and does not cache them as an empty catalog', async () => {
    const requests = vi.fn<typeof fetch>(async () => new Response('Catalog unavailable', { status: 503 }))
    vi.stubGlobal('fetch', requests)
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    await expect(listModels(config, provider)).rejects.toThrow('503 Catalog unavailable')
    requests.mockImplementation(async () => jsonResponse([model('example/speech')]))
    expect((await listModels(config, provider)).map(entry => entry.id)).toEqual(['example/speech'])
  })
})

describe('openRouter review regressions for Issue #3456', () => {
  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  // Temporary dropdown instances cannot refresh the cached synthesis instance. A model miss now refreshes that instance before routing.
  it('refreshes a cached synthesis instance after a temporary discovery instance finds a new model', async () => {
    let entries = [model('minimax/speech-2.8-hd')]
    const upstream = vi.fn<typeof fetch>(async () => new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => new URL(String(input)).pathname.endsWith('/models')
      ? jsonResponse(entries)
      : upstream(input, init)))
    const cached = await providerOpenRouterAudioSpeech.createProvider(config)
    await generateSpeech({ ...getSpeechOptions(cached, entries[0]!.id), input: 'Hello.', voice: 'test-voice' })
    entries = [...entries, model('fish-audio/s2.1-pro-free:free')]
    const temporary = await providerOpenRouterAudioSpeech.createProvider(config)
    expect((await listModels(config, temporary)).map(entry => entry.id)).toContain('fish-audio/s2.1-pro-free:free')

    const result = await generateSpeech({ ...getSpeechOptions(cached, 'fish-audio/s2.1-pro-free:free'), input: 'Hello.', voice: 'custom-voice' })
    expect(new TextDecoder().decode(result)).toBe('audio')
    expect(JSON.parse(String(upstream.mock.lastCall?.[1]?.body)).model).toBe('fish-audio/s2.1-pro-free:free')
  })

  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  // Requiring both catalogs disabled an independent working route. Partial discovery now retains usable capabilities and reports the failed query.
  it.each([
    ['output_modalities', 'openai/gpt-audio-mini'],
    ['output_modality', 'minimax/speech-2.8-hd'],
  ])('keeps usable discovery and synthesis when %s fails', async (failedQuery, id) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const upstream = vi.fn<typeof fetch>(async () => id.startsWith('openai/')
      ? chatResponse()
      : new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input))
      if (!url.pathname.endsWith('/models'))
        return upstream(input, init)
      if (url.searchParams.has(failedQuery))
        return new Response('Catalog unavailable', { status: 503 })
      return jsonResponse([model(id, id, id.startsWith('openai/') ? 'audio' : 'speech')])
    }))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    expect((await listModels(config, provider)).map(entry => entry.id)).toEqual([id])
    const audio = await generateSpeech({ ...getSpeechOptions(provider, id), input: 'Hello.', voice: 'test-voice' })
    expect(audio.byteLength).toBeGreaterThan(0)
    expect(upstream).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(failedQuery), expect.stringContaining('503 Catalog unavailable'))
  })

  it('retains the last successful capability catalog when only its refresh fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let speechUnavailable = false
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const speech = new URL(String(input)).searchParams.has('output_modalities')
      if (speech && speechUnavailable)
        return new Response('Speech catalog unavailable', { status: 503 })
      return jsonResponse([speech ? model('minimax/speech-2.8-hd') : model('openai/gpt-audio-mini', 'Chat', 'audio')])
    }))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    await listModels(config, provider)
    speechUnavailable = true
    expect((await listModels(config, provider)).map(entry => entry.id)).toEqual(['minimax/speech-2.8-hd', 'openai/gpt-audio-mini'])
    expect(warning).toHaveBeenCalledOnce()
  })

  it('restores speech metadata precedence when a failed catalog recovers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let unavailable = true
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).searchParams.has('output_modalities')) {
        return unavailable
          ? new Response('Unavailable', { status: 503 })
          : jsonResponse([model('openai/gpt-audio-mini', 'Speech entry')])
      }
      return jsonResponse([model('openai/gpt-audio-mini', 'Chat entry', 'audio')])
    }))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    expect((await listModels(config, provider))[0]?.name).toBe('Chat entry')
    unavailable = false
    expect((await listModels(config, provider))[0]?.name).toBe('Speech entry')
  })

  it('cancels a model-miss refresh without replacing the synthesis catalog', async () => {
    mockCatalog(async () => new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    const options = { ...getSpeechOptions(provider, 'minimax/speech-2.8-hd'), input: 'Hello.', voice: 'test-voice' }
    await generateSpeech(options)
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.signal).toBe(controller.signal)
      controller.abort()
      throw controller.signal.reason
    }))
    await expect(generateSpeech({
      ...getSpeechOptions(provider, 'example/new-model'),
      input: 'Hello.',
      voice: 'test-voice',
      abortSignal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
    const upstream = vi.fn<typeof fetch>(async () => new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
    vi.stubGlobal('fetch', upstream)
    await generateSpeech(options)
    expect(upstream).toHaveBeenCalledOnce()
    expect(String(upstream.mock.lastCall?.[0])).toBe(`${config.baseUrl}audio/speech`)
  })

  it('rejects partial discovery with no usable models instead of claiming an empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => new URL(String(input)).searchParams.has('output_modalities')
      ? new Response('Speech catalog unavailable', { status: 503 })
      : jsonResponse([])))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    await expect(listModels(config, provider)).rejects.toThrow('503 Speech catalog unavailable')
  })

  it('does not commit partial discovery after cancellation', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.signal).toBe(controller.signal)
      if (new URL(String(input)).searchParams.has('output_modalities'))
        return jsonResponse([model('minimax/speech-2.8-hd')])
      controller.abort()
      throw controller.signal.reason
    }))
    const provider = await providerOpenRouterAudioSpeech.createProvider(config)
    await expect(listVoices(config, provider, 'minimax/speech-2.8-hd', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(warning).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse([])))
    await expect(listVoices(config, provider, 'minimax/speech-2.8-hd')).rejects.toThrow('does not advertise')
  })

  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  // Dedicated format validation also rejected chat callers. The adapter now applies that validation only after endpoint selection.
  it('accepts the xsai WAV option for chat-audio through generateSpeech', async () => {
    const upstream = vi.fn<typeof fetch>(async () => chatResponse())
    mockCatalog(upstream)
    const audio = await synthesize('openai/gpt-audio-mini', { responseFormat: 'wav' })
    expect(new TextDecoder().decode(audio.slice(0, 4))).toBe('RIFF')
    expect(new Uint8Array(audio, 44)).toEqual(Uint8Array.from([1, 0, 2, 0]))
    expect(JSON.parse(String(upstream.mock.lastCall?.[1]?.body)).audio.format).toBe('pcm16')
  })

  it('keeps format validation specific to dedicated speech', async () => {
    const upstream = vi.fn<typeof fetch>()
    mockCatalog(upstream)
    await expect(synthesize('minimax/speech-2.8-hd', { responseFormat: 'wav' })).rejects.toThrow()
    expect(upstream).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/issues/3456
  // ROOT CAUSE:
  // EOF was treated as successful completion. The collector now requires the Chat Completions terminal marker.
  it('rejects chat audio that ends before the protocol completion marker', async () => {
    const complete = await chatResponse().text()
    mockCatalog(async () => new Response(complete.replace('data: [DONE]\n\n', ''), { headers: { 'Content-Type': 'text/event-stream' } }))
    await expect(synthesize('openai/gpt-audio-mini')).rejects.toThrow('before [DONE]')
  })
})
