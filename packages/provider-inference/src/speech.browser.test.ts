import { describe, expect, it, vi } from 'vitest'

import { providerStepfunSpeech } from './providers/cloud/unspeech'
import { executeSpeech, SpeechUpstreamError } from './speech'

describe('shared speech execution in a browser', () => {
  it('keeps the host transport, language, and binary response', async () => {
    const bytes = new Uint8Array([0, 128, 255])
    const transport = vi.fn<typeof fetch>(async () => new Response(bytes, {
      headers: { 'Content-Type': 'audio/mpeg' },
    }))
    const provider = await providerStepfunSpeech.createProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.com/v1/',
    })

    const result = await executeSpeech(provider, {
      model: 'stepaudio-2.5-tts',
      text: 'Hello',
      voice: 'cixingnansheng',
      providerOptions: { language: 'en', endpointProfile: 'step-plan' },
      fetch: transport,
    })

    expect(new Uint8Array(result.body)).toEqual(bytes)
    expect(result.contentType).toBe('audio/mpeg')
    expect(String(transport.mock.calls[0][0])).toBe('https://example.com/v1/audio/speech')
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toMatchObject({
      model: 'stepfun/stepaudio-2.5-tts',
      extra_body: { language: 'en', endpoint_profile: 'step-plan' },
    })
  })

  it('preserves upstream errors from a provider-owned transport', async () => {
    const fallback = vi.fn<typeof fetch>()
    const transport = vi.fn<typeof fetch>(async () => new Response('busy', {
      status: 429,
      headers: { 'Retry-After': '3' },
    }))
    const error = await executeSpeech({
      speech: (model: string) => ({ model, baseURL: 'https://example.com/v1/', fetch: transport }),
    }, {
      model: 'tts-1',
      text: 'Hello',
      voice: 'alloy',
      fetch: fallback,
    }).catch((caught: unknown) => caught)

    expect(fallback).not.toHaveBeenCalled()
    expect(error).toBeInstanceOf(SpeechUpstreamError)
    if (!(error instanceof SpeechUpstreamError))
      throw error
    expect(error.status).toBe(429)
    expect(error.body).toBe('busy')
    expect(error.headers.get('retry-after')).toBe('3')
  })

  // https://github.com/moeru-ai/airi/pull/2838
  // ROOT CAUSE:
  // Chromium can replace the failed response stream's error with a transport error.
  // The execution boundary restores the caller's abort reason before HTTP error mapping.
  it('retains an abort while reading a failed upstream body (PR #2838)', async () => {
    const controller = new AbortController()
    const reason = new Error('caller-aborted-body')
    const body = new TransformStream<Uint8Array, Uint8Array>()
    const writer = body.writable.getWriter()
    const transport = vi.fn<typeof fetch>(async () => new Response(body.readable, { status: 429 }))
    const execution = executeSpeech({
      speech: (model: string) => ({ model, baseURL: 'https://example.com/v1/', fetch: transport }),
    }, { model: 'tts-1', text: 'Hello', voice: 'alloy', abortSignal: controller.signal })
    const rejection = expect(execution).rejects.toBe(reason)

    await vi.waitFor(() => expect(body.readable.locked).toBe(true))
    controller.abort(reason)
    await writer.abort(reason)

    await rejection
  })
})
