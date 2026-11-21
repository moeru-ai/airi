import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OpenAIImageProvider } from './openai-image'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
let provider: OpenAIImageProvider

beforeEach(() => {
  provider = new OpenAIImageProvider()
})

afterEach(() => {
  provider.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function completed(jobId: string) {
  await vi.waitFor(async () => {
    expect((await provider.getStatus(jobId)).status).not.toBe('running')
  })
  return provider.getStatus(jobId)
}

describe('openAI Images provider', () => {
  it.each(['https://example.com/openai/v1', 'https://example.com/openai/v1/'])(
    'preserves the configured prefix %s and uses separate credentials',
    async (baseUrl) => {
      const request = vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: png }] }))
      vi.stubGlobal('fetch', request)
      await provider.initialize({ openaiImageApiKey: ' image-key ', openaiImageBaseUrl: baseUrl, apiKey: 'chat-key' })
      const job = await provider.generate({ prompt: 'A small cat.' })
      expect(await completed(job.jobId)).toMatchObject({ status: 'succeeded', imageUrl: `data:image/png;base64,${png}` })
      expect(String(request.mock.calls[0]![0])).toBe('https://example.com/openai/v1/images/generations')
      const init = request.mock.calls[0]![1]!
      expect(init.headers).toEqual({ 'authorization': 'Bearer image-key', 'content-type': 'application/json' })
      expect(JSON.parse(String(init.body))).toEqual({
        model: 'gpt-image-2.6-sunburst',
        prompt: 'A small cat.',
        n: 1,
        output_format: 'png',
      })
    },
  )

  it('uses the configured model and lets the character override it', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: png }] }))
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key', openaiImageModel: 'gpt-image-2', openaiImageWidth: '1024', openaiImageHeight: '1024' })
    const first = await provider.generate({ prompt: 'A cat.' })
    await completed(first.jobId)
    const second = await provider.generate({ prompt: 'A cat.', model: 'gpt-image-2.6-sunburst', width: 1536, height: 1024 })
    await completed(second.jobId)
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body)).model).toBe('gpt-image-2')
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toMatchObject({ model: 'gpt-image-2.6-sunburst', size: '1536x1024' })
  })

  it.each([png, `data:image/png;base64,${png}`])('sends source images to the native multipart edit endpoint', async (image) => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: png }] }))
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key' })
    const job = await provider.generate({ prompt: 'Make the sky blue.', extra: { image } })
    await completed(job.jobId)
    expect(String(request.mock.calls[0]![0])).toBe('https://api.openai.com/v1/images/edits')
    const init = request.mock.calls[0]![1]!
    expect(init.headers).toEqual({ authorization: 'Bearer image-key' })
    expect(init.body).toBeInstanceOf(FormData)
    const body = init.body as FormData
    expect(body.get('model')).toBe('gpt-image-2.6-sunburst')
    expect(body.get('prompt')).toBe('Make the sky blue.')
    expect(body.get('response_format')).toBeNull()
    expect(body.get('size')).toBeNull()
    const file = body.get('image') as File
    expect(file.type).toBe('image/png')
    expect(file.size).toBeGreaterThan(0)
  })

  it.each([401, 429, 500])('reports HTTP %s without leaking response content', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('image-key sensitive response', { status })))
    await provider.initialize({ openaiImageApiKey: 'image-key' })
    const job = await provider.generate({ prompt: 'A cat.' })
    expect(await completed(job.jobId)).toEqual({ status: 'failed', error: `OpenAI Images API returned HTTP ${status}.` })
  })

  it.each([{ data: [] }, { data: [{ url: 'https://example.com/image.png' }] }, { data: [{ b64_json: '' }] }])(
    'rejects responses without a base64 image',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json(response)))
      await provider.initialize({ openaiImageApiKey: 'image-key' })
      const job = await provider.generate({ prompt: 'A cat.' })
      expect(await completed(job.jobId)).toMatchObject({ status: 'failed' })
    },
  )

  it('rejects invalid configuration and never reuses an earlier key', async () => {
    await provider.initialize({ openaiImageApiKey: 'image-key' })
    await expect(provider.initialize({ apiKey: 'chat-key' })).rejects.toThrow()
    await expect(provider.generate({ prompt: 'A cat.' })).rejects.toThrow('Configure')
    await expect(provider.initialize({ openaiImageApiKey: 'image-key', openaiImageBaseUrl: 'file:///tmp/' })).rejects.toThrow()
    await expect(provider.initialize({ openaiImageApiKey: 'image-key', openaiImageBaseUrl: 'https://example.com/v1?key=value' })).rejects.toThrow()
  })

  it('reports malformed JSON without exposing the response body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('image-key sensitive response')))
    await provider.initialize({ openaiImageApiKey: 'image-key' })
    const job = await provider.generate({ prompt: 'A cat.' })
    expect(await completed(job.jobId)).toEqual({ status: 'failed', error: 'OpenAI Images API returned an invalid JSON response.' })
  })

  it('rejects invalid prompts, sizes, and edit images before a request', async () => {
    const request = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key' })
    await expect(provider.generate({ prompt: ' ' })).rejects.toThrow()
    await expect(provider.generate({ prompt: 'A cat.', width: 100 })).rejects.toThrow()
    await expect(provider.generate({ prompt: 'A cat.', extra: { image: 'https://example.com/image.png' } })).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })

  it.each([undefined, png])('uses configured dimensions for generation and editing', async (image) => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: png }] }))
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key', openaiImageWidth: '1536', openaiImageHeight: '1024' })
    const job = await provider.generate({ prompt: 'A landscape.', extra: { image } })
    expect(await completed(job.jobId)).toMatchObject({ status: 'succeeded' })
    const body = request.mock.calls[0]![1]!.body
    expect(body instanceof FormData ? body.get('size') : JSON.parse(String(body)).size).toBe('1536x1024')
  })

  // A retry must override an invalid saved default rather than validate that default again.
  it.each([undefined, png])('uses explicit 1024x1024 dimensions despite invalid saved defaults', async (image) => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: png }] }))
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key', openaiImageWidth: '1920', openaiImageHeight: '1080' })
    const job = await provider.generate({ prompt: 'A landscape.', width: 1024, height: 1024, extra: { image } })
    expect(await completed(job.jobId)).toMatchObject({ status: 'succeeded' })
    const body = request.mock.calls[0]![1]!.body
    expect(body instanceof FormData ? body.get('size') : JSON.parse(String(body)).size).toBe('1024x1024')
  })

  it.each([
    ['1024', ''],
    ['', '1024'],
    ['0', '1024'],
    ['1920', '1080'],
    ['9007199254740992', '1024'],
    ['invalid', '1024'],
    ['1024.5', '1024'],
  ])('rejects invalid configured dimensions %s by %s before sending a request', async (width, height) => {
    const request = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key', openaiImageWidth: width, openaiImageHeight: height })
    await expect(provider.generate({ prompt: 'A cat.' })).rejects.toThrow('Set both width and height to positive multiples of 16')
    expect(request).not.toHaveBeenCalled()
  })

  it('does not fill a partial request size from the configured defaults', async () => {
    const request = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key', openaiImageWidth: '1024', openaiImageHeight: '1024' })
    await expect(provider.generate({ prompt: 'A cat.', width: 1536 })).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })

  it('aborts cancellation, ignores late results, and expires retained jobs', async () => {
    vi.useFakeTimers()
    let resolveResponse!: (response: Response) => void
    const request = vi.fn<typeof fetch>(() => new Promise(resolve => resolveResponse = resolve))
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key' })
    const job = await provider.generate({ prompt: 'A cat.' })
    const result = completed(job.jobId)
    await provider.cancel(job.jobId)
    expect(await result).toEqual({ status: 'failed', error: 'Image generation was cancelled.' })
    expect(request.mock.calls[0]![1]!.signal!.aborted).toBe(true)
    resolveResponse(Response.json({ data: [{ b64_json: png }] }))
    await vi.advanceTimersByTimeAsync(1)
    expect(await provider.getStatus(job.jobId)).toMatchObject({ status: 'failed' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await provider.getStatus(job.jobId)).toMatchObject({ error: 'The image job does not exist or has expired.' })
  })

  it('aborts requests when the generation deadline expires', async () => {
    vi.useFakeTimers()
    const request = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
    }))
    vi.stubGlobal('fetch', request)
    await provider.initialize({ openaiImageApiKey: 'image-key' })
    const job = await provider.generate({ prompt: 'A cat.' })
    const result = completed(job.jobId)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(await result).toEqual({ status: 'failed', error: 'Image generation timed out.' })
  })
})
