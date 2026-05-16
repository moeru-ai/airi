import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildFishAudioSpeechProvider, listVoices } from './index'

describe('fish audio speech provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('translates xsai speech requests into Fish Audio /v1/tts payloads with Safari-safe MP3 output', async () => {
    vi.stubEnv('VITE_FISHAUDIO_API_KEY', 'env-fish-key')

    const upstreamResponse = new Response(new Uint8Array([1, 2, 3]).buffer, {
      status: 200,
    })

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => upstreamResponse)
    vi.stubGlobal('fetch', fetchMock)

    const metadata = buildFishAudioSpeechProvider(() => null)
    const provider = await metadata.createProvider({
      apiKey: ' fish-key ',
      baseUrl: 'https://api.fish.audio/',
      format: 'mp3',
    }) as {
      speech: (model: string) => {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      }
    }

    const response = await provider.speech('default').fetch(new URL('https://unused.local'), {
      body: JSON.stringify({
        input: 'Hello from AIRI',
        voice: 'voice-123',
        response_format: 'wav',
        model: 'custom-model',
        normalize: false,
        latency: 'balanced',
        chunk_length: 240,
      }),
      method: 'POST',
    })

    const firstCall = fetchMock.mock.calls[0]
    if (!firstCall) {
      throw new Error('Expected fetch to be called')
    }

    const [requestUrl, requestInit] = firstCall
    if (!requestInit) {
      throw new Error('Expected fetch init to be defined')
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestUrl).toBe('/api-fish/v1/tts')
    expect(requestInit.method).toBe('POST')
    const headers = new Headers(requestInit.headers)
    expect(headers.get('Authorization')).toBe('Bearer fish-key')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(requestInit.body))).toEqual({
      text: 'Hello from AIRI',
      format: 'mp3',
      normalize: false,
      latency: 'balanced',
      chunk_length: 240,
      model: 'custom-model',
      reference_id: 'voice-123',
    })
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3])
  })

  it('maps Fish Audio model records into AIRI voices', async () => {
    vi.stubEnv('VITE_FISHAUDIO_API_KEY', 'env-fish-key')

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({
        items: [
          { _id: 'voice-1', title: 'Voice One' },
          { _id: 'voice-2', title: 'Voice Two' },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const voices = await listVoices({ apiKey: 'fish-key', searchTerm: 'radiant' })

    const firstCall = fetchMock.mock.calls[0]
    if (!firstCall) {
      throw new Error('Expected fetch to be called')
    }

    const [requestUrl, requestInit] = firstCall

    expect(requestUrl).toBe('/api-fish/model?page_size=20&title=radiant')
    expect(requestInit).toMatchObject({
      headers: {
        Authorization: 'Bearer fish-key',
      },
    })
    expect(voices).toEqual([
      {
        value: 'voice-1',
        label: 'Voice One',
      },
      {
        value: 'voice-2',
        label: 'Voice Two',
      },
    ])
  })

  it('validates provider credentials by pinging the Fish Audio model endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ items: [{ _id: 'voice-1', title: 'Voice One' }] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const metadata = buildFishAudioSpeechProvider(() => null)
    const result = await metadata.validators.validateProviderConfig({
      apiKey: 'fish-key',
      baseUrl: 'https://api.fish.audio',
    })

    const firstCall = fetchMock.mock.calls[0]
    if (!firstCall) {
      throw new Error('Expected fetch to be called')
    }

    const [requestUrl, requestInit] = firstCall

    expect(result.valid).toBe(true)
    expect(requestUrl).toBe('/api-fish/model?page_size=1')
    expect(requestInit).toMatchObject({
      headers: {
        Authorization: 'Bearer fish-key',
      },
    })
  })
})
