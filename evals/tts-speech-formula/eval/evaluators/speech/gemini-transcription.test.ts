import { generateTranscription } from '@xsai/generate-transcription'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGeminiTranscription } from './gemini-transcription'

const parameters = { apiKey: 'gemini-key', baseURL: 'https://gemini.example/v1beta' }

function transcribeClip() {
  const request = createGeminiTranscription().transcription({ language: 'ja', model: 'gemini-test', parameters })
  return generateTranscription({ ...request, file: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }), fileName: 'speech.mp3', language: 'ja' })
}

describe('createGeminiTranscription', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the clip as inline audio to generateContent and answers with the transcript', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: ' 2分の1 ' }] } }],
    })))

    const result = await transcribeClip()

    expect(result).toEqual({ text: '2分の1' })
    const [url, init] = upstream.mock.calls[0]!
    expect(String(url)).toBe('https://gemini.example/v1beta/models/gemini-test:generateContent')
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'gemini-key' })
    const body = JSON.parse(String(init?.body))
    expect(body.contents[0].parts[0].text).toContain('"ja"')
    expect(body.contents[0].parts[1].inline_data).toEqual({ data: 'AQID', mime_type: 'audio/mpeg' })
  })

  it('answers an empty transcript when Gemini returns no candidate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [] })))

    expect(await transcribeClip()).toEqual({ text: '' })
  })

  it('passes a failed upstream status through, so xsai reports it and vieval can retry it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 429 }))

    await expect(transcribeClip()).rejects.toThrow('429')
  })

  it('names the missing parameter of the provider', () => {
    expect(() => createGeminiTranscription().transcription({ model: 'gemini-test', parameters: { baseURL: parameters.baseURL } })).toThrow('has no "apiKey" parameter')
  })
})
