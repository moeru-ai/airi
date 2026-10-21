import type { ArtistryJobStatus } from './base'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { NanoBananaProvider } from './nanobanana'

describe('nanobanana provider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses the Google Gen AI SDK and returns the generated image', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: 'aW1hZ2U=', mimeType: 'image/png' } }],
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()

    const provider = new NanoBananaProvider()
    await provider.initialize({
      nanobananaApiKey: 'test-key',
      nanobananaModel: 'gemini-3.1-flash-image-preview',
      nanobananaResolution: '2K',
    })

    const jobId = 'job-1'
    const statusPromise = new Promise<ArtistryJobStatus>((resolve) => {
      provider.setJobCallback(jobId, (status) => {
        if (status.status === 'succeeded' || status.status === 'failed')
          resolve(status)
      })
    })

    await provider.generate({
      prompt: 'A banana',
      model: 'gemini-3.1-flash-image-preview',
      extra: { image: 'data:image/jpeg;base64,c291cmNl', internalJobId: jobId },
    })

    await expect(statusPromise).resolves.toEqual({
      status: 'succeeded',
      progress: 100,
      imageUrl: 'data:image/png;base64,aW1hZ2U=',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent')
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-key')

    const requestBody = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ text?: string, inlineData?: { data: string, mimeType: string } }> }>
      generationConfig: { imageConfig: { aspectRatio: string, imageSize: string } }
    }
    expect(requestBody.contents[0]?.parts[0]?.text).toBe('A banana')
    expect(requestBody.contents[0]?.parts[1]?.inlineData).toEqual({ data: 'c291cmNl', mimeType: 'image/jpeg' })
    expect(requestBody.generationConfig.imageConfig).toEqual({ aspectRatio: '1:1', imageSize: '2K' })

    await vi.advanceTimersByTimeAsync(10_000)
  })
})
