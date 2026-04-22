import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOfficialVolcengineSpeechProvider } from './audio-speech'

describe('official volcengine speech provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards lesson backend auth headers to the proxy request', async () => {
    const fetchSpy = vi.fn(async () => new Response(new ArrayBuffer(0), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    }))
    vi.stubGlobal('fetch', fetchSpy)

    const provider = createOfficialVolcengineSpeechProvider({
      proxyUrl: 'https://lesson.example.test/api/peptutor/doubao-tts',
      proxyAuth: {
        accessToken: 'lesson-jwt',
        apiKey: 'lesson-api-key',
      },
      app: {
        appId: 'doubao-app-id',
        cluster: 'volcano_tts',
      },
    })

    const request = provider.speech('v1')
    await request.fetch!(new URL('https://ignored.example.test'), {
      body: JSON.stringify({
        input: 'Hello',
        voice: 'Vivi 2.0',
      }),
    })

    expect(fetchSpy).toHaveBeenCalledWith('https://lesson.example.test/api/peptutor/doubao-tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer lesson-jwt',
      },
      body: JSON.stringify({
        input: 'Hello',
        voice: 'Vivi 2.0',
        model: 'v1',
        appId: 'doubao-app-id',
        cluster: 'volcano_tts',
        user: undefined,
        audio: undefined,
      }),
    })
  })
})
