import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  MIMO_ASR_MODEL,
  parseMimoAsrResponse,
  providerMimoAudioTranscription,
} from './index'

const context = { t: (key: string) => key }
type Config = Parameters<typeof providerMimoAudioTranscription.createProvider>[0]
interface RequestPayload {
  model: string
  asr_options: { language: string }
  messages: Array<{ role: string, content: Array<{ type: string, input_audio: { data: string, format: string } }> }>
}

function createWavFile() {
  const pcm = new Uint8Array([0, 0, 0x40, 0, 0x80, 0, 0xC0, 0])
  return new File([toWavFromPCM16(pcm, 16_000)], 'recording.wav', { type: 'audio/wav' })
}

function createMp3File() {
  return new File([new Uint8Array([0xFF, 0xFB, 0x90, 0x64])], 'recording.mp3', { type: 'audio/mpeg' })
}

async function createProvider(config: Partial<Config> = {}) {
  return await providerMimoAudioTranscription.createProvider({
    apiKey: 'test-key',
    baseUrl: 'https://example.com/v1/',
    ...config,
  }) as TranscriptionProviderWithExtraOptions<string, Record<string, unknown>>
}

async function callProvider(file = createWavFile(), config: Partial<Config> = {}, model = 'mimo-v2.5', options?: { language?: string }) {
  const request = (await createProvider(config)).transcription(model, options)
  const form = new FormData()
  form.set('file', file)
  if (!request.fetch)
    throw new Error('MiMo transcription does not expose its HTTP adapter')
  return request.fetch('https://example.com/v1/audio/transcriptions', { method: 'POST', body: form })
}

function lastPayload(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls.at(-1)
  if (!call)
    throw new Error('No MiMo request was sent')
  return JSON.parse(String(call[1]?.body)) as RequestPayload
}

describe('xiaomi MiMo ASR transcription provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the dedicated ASR model by default and removes generic models from the catalog', async () => {
    const schema = await providerMimoAudioTranscription.createProviderConfig(context)
    const defaults = z.parse(schema, { apiKey: 'test-key' })
    const provider = await providerMimoAudioTranscription.createProvider(defaults)
    const models = await providerMimoAudioTranscription.extraMethods?.listModels?.(defaults, provider)

    expect(defaults).toMatchObject({ model: MIMO_ASR_MODEL, language: 'auto' })
    expect((await createProvider()).transcription('mimo-v2.5').model).toBe(MIMO_ASR_MODEL)
    expect(models?.map(model => model.id)).toEqual([MIMO_ASR_MODEL])
    expect(models?.some(model => model.id === 'mimo-v2.5')).toBe(false)
    expect(models?.some(model => model.id === 'mimo-v2-omni')).toBe(false)
  })

  it('sends one official input_audio part to the MiMo chat completions endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: '这是测试' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await callProvider()
    const payload = lastPayload(fetchMock)
    const inputAudio = payload.messages[0].content[0].input_audio

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://example.com/v1/chat/completions')
    expect(payload.model).toBe(MIMO_ASR_MODEL)
    expect(payload.asr_options).toEqual({ language: 'auto' })
    expect(payload.messages).toHaveLength(1)
    expect(payload.messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'input_audio', input_audio: inputAudio }],
    })
    expect(payload.messages[0].content).toHaveLength(1)
    expect(JSON.stringify(payload)).not.toContain('Transcribe the audio content.')
    expect(inputAudio.format).toBe('wav')
    expect(inputAudio.data).toMatch(/^data:audio\/wav;base64,/)
    expect(await response.json()).toEqual({ text: '这是测试' })
  })

  it('maps the supported Chinese and English language options', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: 'ok' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    for (const language of ['zh', 'en']) {
      await callProvider(createWavFile(), { language })
      expect(lastPayload(fetchMock).asr_options).toEqual({ language })
    }
  })

  it('prefers the current request language over cached provider configuration', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: 'ok' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await callProvider(createWavFile(), { language: 'auto' }, 'mimo-v2.5', { language: 'zh' })

    expect(lastPayload(fetchMock).asr_options).toEqual({ language: 'zh' })
  })

  it('preserves the actual WAV bytes in a matching data URL and format field', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: 'ok' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const file = createWavFile()

    await callProvider(file)

    const inputAudio = lastPayload(fetchMock).messages[0].content[0].input_audio
    const encoded = inputAudio.data.split(',')[1]
    const binary = atob(encoded)
    const decoded = Uint8Array.from(binary, character => character.charCodeAt(0))
    expect(inputAudio.format).toBe('wav')
    expect(decoded).toEqual(new Uint8Array(await file.arrayBuffer()))
  })

  it('preserves supported MP3 bytes in a matching data URL and format field', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: 'ok' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const file = createMp3File()

    await callProvider(file)

    const inputAudio = lastPayload(fetchMock).messages[0].content[0].input_audio
    const encoded = inputAudio.data.split(',')[1]
    const binary = atob(encoded)
    const decoded = Uint8Array.from(binary, character => character.charCodeAt(0))
    expect(inputAudio.format).toBe('mp3')
    expect(inputAudio.data).toMatch(/^data:audio\/mpeg;base64,/)
    expect(decoded).toEqual(new Uint8Array(await file.arrayBuffer()))
  })

  it('rejects unsupported or relabelled recorder bytes before sending a request', async () => {
    const request = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', request)
    for (const type of ['audio/webm', 'audio/wav', 'audio/mpeg']) {
      const file = new File([new Uint8Array([0x1A, 0x45, 0xDF, 0xA3])], 'recording.webm', { type })
      await expect(callProvider(file)).rejects.toThrow('only WAV or MP3')
    }
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects audio beyond the Base64 size limit before sending a request', async () => {
    const request = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', request)
    const bytes = new Uint8Array(8 * 1024 * 1024)
    bytes.set(new Uint8Array([0xFF, 0xFB]))
    await expect(callProvider(new File([bytes], 'recording.mp3'))).rejects.toThrow('10 MB Base64 limit')
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts an empty ASR transcript as an empty result', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: '   ' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect((await callProvider()).json()).resolves.toEqual({ text: '' })
  })

  it('rejects HTTP errors, malformed ASR responses, and generic assistant output', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('upstream error', { status: 401, statusText: 'Unauthorized' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(callProvider()).rejects.toThrow('MiMo ASR request failed: 401 Unauthorized')

    fetchMock.mockImplementationOnce(async () => new Response('not json', { status: 200 }))
    await expect(callProvider()).rejects.toThrow('not valid JSON')

    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: { text: 'not a string' } } }],
    }), { status: 200 }))
    await expect(callProvider()).rejects.toThrow('missing a string transcript')

    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({
      model: 'mimo-v2.5',
      choices: [{ message: { content: 'I am unable to process or transcribe audio content.' } }],
    }), { status: 200 }))
    await expect(callProvider()).rejects.toThrow('dedicated mimo-v2.5-asr model')
  })

  it('requires the dedicated response model even when content looks like a transcript', () => {
    expect(() => parseMimoAsrResponse({
      model: 'mimo-v2.5',
      choices: [{ message: { content: 'hello' } }],
    })).toThrow('dedicated mimo-v2.5-asr model')
  })
})
