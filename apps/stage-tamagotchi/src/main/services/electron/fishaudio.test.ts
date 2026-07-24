import { Buffer } from 'node:buffer'

import { createContext, defineInvoke } from '@moeru/eventa'
import { electronFishAudioTTS } from '@proj-airi/stage-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFishAudioService } from './fishaudio'

describe('createFishAudioService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('proxies Fish Audio TTS through Electron and returns MP3-safe payload metadata', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]).buffer, {
      status: 200,
      statusText: 'OK',
    }))

    vi.stubGlobal('fetch', fetchMock)

    const context = createContext()
    createFishAudioService({ context: context as never })

    const invokeTts = defineInvoke(context, electronFishAudioTTS)
    const result = await invokeTts({
      apiKey: 'fish-key',
      baseUrl: 'https://api.fish.audio/',
      model: 's2-pro',
      text: 'Hello from Electron',
      referenceId: 'voice-123',
      normalize: true,
      latency: 'normal',
      chunkLength: 200,
      mp3Bitrate: 128,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls.at(0) as [RequestInfo | URL, RequestInit | undefined] | undefined
    if (!firstCall) {
      throw new Error('Expected fetch to be called')
    }

    const [requestUrl, requestInit] = firstCall
    expect(requestUrl).toBe('https://api.fish.audio/v1/tts')
    expect(requestInit).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello from Electron',
        format: 'mp3',
        model: 's2-pro',
        normalize: true,
        latency: 'normal',
        reference_id: 'voice-123',
        chunk_length: 200,
        mp3_bitrate: 128,
      }),
    })

    if (!requestInit) {
      throw new Error('Expected fetch init to be defined')
    }

    const headers = new Headers(requestInit.headers)
    expect(headers.get('Authorization')).toBe('Bearer fish-key')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('model')).toBe('s2-pro')

    expect(result).toEqual({
      audioBase64: Buffer.from([1, 2, 3]).toString('base64'),
      mimeType: 'audio/mpeg',
      status: 200,
      statusText: 'OK',
    })
  })

  it('throws an error if baseUrl host is not api.fish.audio', async () => {
    const context = createContext()
    createFishAudioService({ context: context as never })

    const invokeTts = defineInvoke(context, electronFishAudioTTS)
    await expect(invokeTts({
      apiKey: 'fish-key',
      baseUrl: 'https://malicious.domain.com/',
      model: 's2-pro',
      text: 'Hello from Electron',
      referenceId: 'voice-123',
      normalize: true,
      latency: 'normal',
      chunkLength: 200,
      mp3Bitrate: 128,
    })).rejects.toThrow('Forbidden: base URL host must be api.fish.audio')
  })
})
