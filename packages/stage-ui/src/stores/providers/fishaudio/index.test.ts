import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildFishAudioSpeechProvider, listVoices, searchFishAudioVoices } from './index'

describe('fish audio speech provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('translates xsai speech requests into Fish Audio /v1/tts payloads with Safari-safe MP3 output', async () => {
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

  it('returns page metadata for remote discovery instead of treating the first page as the catalogue', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({
        has_more: false,
        items: [
          { _id: 'voice-21', title: 'Voice Twenty One' },
        ],
        total: 1800000,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await searchFishAudioVoices({
      apiKey: 'fish-key',
      language: 'en',
      pageNumber: 2,
      pageSize: 20,
      searchTerm: 'narrator',
      sortBy: 'task_count',
      tag: 'audiobook',
    })

    const firstCall = fetchMock.mock.calls[0]
    if (!firstCall) {
      throw new Error('Expected fetch to be called')
    }

    const [requestUrl, requestInit] = firstCall

    expect(requestUrl).toBe('/api-fish/model?page_size=20&page_number=2&title=narrator&language=en&tag=audiobook&sort_by=task_count')
    expect(requestInit).toMatchObject({
      headers: {
        Authorization: 'Bearer fish-key',
      },
    })
    expect(result).toEqual({
      hasMore: true,
      items: [{ label: 'Voice Twenty One', value: 'voice-21' }],
      pageNumber: 2,
      pageSize: 20,
      total: 1800000,
    })
  })

  it('scopes personal voice browsing to the authenticated user', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({
        has_more: false,
        items: [{ _id: 'my-voice', title: 'My Voice' }],
        total: 1,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    await searchFishAudioVoices({ apiKey: 'personal-key', self: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api-fish/model?page_size=20&self=true')
  })

  it('keeps cached voice search results isolated from caller mutations', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({
        items: [{ _id: 'voice-cached-result', title: 'Cached result' }],
        total: 1,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const firstResult = await searchFishAudioVoices({ apiKey: 'isolated-cache-key' })
    firstResult.items.unshift({ value: 'selected-voice', label: 'Selected voice' })

    const cachedResult = await searchFishAudioVoices({ apiKey: 'isolated-cache-key' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(cachedResult.items).toEqual([{ value: 'voice-cached-result', label: 'Cached result' }])
  })

  it('caches listVoices calls for identical configurations and search terms', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({
        items: [
          { _id: 'voice-cached', title: 'Cached Voice' },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const voices1 = await listVoices({ apiKey: 'cached-key', searchTerm: 'test-cache' })
    const voices2 = await listVoices({ apiKey: 'cached-key', searchTerm: 'test-cache' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(voices1).toEqual(voices2)
    expect(voices1).toEqual([
      {
        value: 'voice-cached',
        label: 'Cached Voice',
      },
    ])
  })

  it('respects custom base URLs in dev instead of forcing the local proxy', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({
        items: [
          { _id: 'voice-1', title: 'Voice One' },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    await listVoices({
      apiKey: 'fish-key',
      baseUrl: 'https://custom-fish.example/api/',
      searchTerm: 'voice',
    })

    const firstCall = fetchMock.mock.calls[0]
    if (!firstCall) {
      throw new Error('Expected fetch to be called')
    }

    const [requestUrl] = firstCall

    expect(requestUrl).toBe('https://custom-fish.example/api/model?page_size=20&title=voice')
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

  /**
   * @example
   * it('fetches a single voice model by ID when options.id is provided', async () => {
   *   const voices = await listVoices({ apiKey: 'fish-key', id: 'voice-by-id' })
   *   expect(voices).toEqual([{ value: 'voice-by-id', label: 'Voice By ID' }])
   * })
   */
  it('fetches a single voice model by ID when options.id is provided', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({
        _id: 'voice-by-id',
        title: 'Voice By ID',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const voices = await listVoices({ apiKey: 'fish-key', id: 'voice-by-id' })

    const firstCall = fetchMock.mock.calls[0]
    if (!firstCall) {
      throw new Error('Expected fetch to be called')
    }

    const [requestUrl, requestInit] = firstCall

    expect(requestUrl).toBe('/api-fish/model/voice-by-id')
    expect(requestInit).toMatchObject({
      headers: {
        Authorization: 'Bearer fish-key',
      },
    })
    expect(voices).toEqual([
      {
        value: 'voice-by-id',
        label: 'Voice By ID',
      },
    ])
  })
})
