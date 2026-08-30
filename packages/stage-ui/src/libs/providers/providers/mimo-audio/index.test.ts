import type { ComposerTranslation } from 'vue-i18n'

import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  MIMO_ASR_MODEL,
  parseMimoAsrResponse,
  providerMimoAudioTranscription,
} from './index'

const translate = ((key: string) => key) as unknown as ComposerTranslation

function createWavFile() {
  const pcm = new Uint8Array([0, 0, 0x40, 0, 0x80, 0, 0xC0, 0])
  return new File([toWavFromPCM16(pcm, 16_000)], 'recording.wav', { type: 'audio/wav' })
}

function createMp3File() {
  return new File([new Uint8Array([0xFF, 0xFB, 0x90, 0x64])], 'recording.mp3', { type: 'audio/mpeg' })
}

function createProvider(config: Record<string, unknown> = {}) {
  return providerMimoAudioTranscription.createProvider({
    apiKey: 'test-key',
    baseUrl: 'https://api.xiaomimimo.com/v1/',
    ...config,
  } as never) as {
    transcription: (model: string, options?: { language?: string }) => {
      model: string
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    }
  }
}

async function callProvider(file = createWavFile(), config: Record<string, unknown> = {}, model = 'mimo-v2.5') {
  const request = createProvider(config).transcription(model)
  const form = new FormData()
  form.set('file', file)
  return await request.fetch('https://unused.invalid/v1/audio/transcriptions', { method: 'POST', body: form })
}

function lastPayload(fetchMock: ReturnType<typeof vi.fn>) {
  const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>
  const call = calls.at(-1)!
  return JSON.parse(String(call[1].body)) as Record<string, any>
}

describe('xiaomi MiMo ASR transcription provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the dedicated ASR model by default and removes generic models from the catalog', async () => {
    const schema = await providerMimoAudioTranscription.createProviderConfig({ t: translate })
    const defaults = z.parse(schema, { apiKey: 'test-key' }) as {
      apiKey: string
      baseUrl?: string
      model?: typeof MIMO_ASR_MODEL
      language?: 'auto' | 'zh' | 'en'
    }
    const provider = await providerMimoAudioTranscription.createProvider(defaults)
    const models = await providerMimoAudioTranscription.extraMethods?.listModels?.(defaults, provider)

    expect(defaults).toMatchObject({ model: MIMO_ASR_MODEL, language: 'auto' })
    expect(createProvider().transcription('mimo-v2.5').model).toBe(MIMO_ASR_MODEL)
    expect(models?.map(model => model.id)).toEqual([MIMO_ASR_MODEL])
    expect(models?.some(model => model.id === 'mimo-v2.5')).toBe(false)
    expect(models?.some(model => model.id === 'mimo-v2-omni')).toBe(false)
  })

  it('sends one official input_audio part to the MiMo chat completions endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: '这是测试' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await callProvider()
    const payload = lastPayload(fetchMock)
    const inputAudio = payload.messages[0].content[0].input_audio
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>

    expect(String(calls[0][0])).toBe('https://api.xiaomimimo.com/v1/chat/completions')
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: 'ok' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    for (const language of ['zh', 'en']) {
      await callProvider(createWavFile(), { language })
      expect(lastPayload(fetchMock).asr_options).toEqual({ language })
    }
  })

  it('preserves the actual WAV bytes in a matching data URL and format field', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
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

  it('converts an unsupported recorder container to a real WAV before sending', async () => {
    class FakeAudioContext {
      async decodeAudioData() {
        return {
          length: 2,
          numberOfChannels: 1,
          sampleRate: 16_000,
          getChannelData: () => new Float32Array([0.5, -0.5]),
        }
      }

      async close() {}
    }

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: 'converted' } }],
    }), { status: 200 }))
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('fetch', fetchMock)

    await callProvider(new File([new Uint8Array([0x1A, 0x45, 0xDF, 0xA3])], 'recording.webm', { type: 'audio/webm' }))

    const inputAudio = lastPayload(fetchMock).messages[0].content[0].input_audio
    const binary = atob(inputAudio.data.split(',')[1])
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    expect(inputAudio.format).toBe('wav')
    expect(inputAudio.data).toMatch(/^data:audio\/wav;base64,/)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
  })

  it('accepts an empty ASR transcript as an empty result', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: MIMO_ASR_MODEL,
      choices: [{ message: { content: '   ' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect((await callProvider()).json()).resolves.toEqual({ text: '' })
  })

  it('rejects HTTP errors, malformed ASR responses, and generic assistant output', async () => {
    const fetchMock = vi.fn(async () => new Response('upstream error', { status: 401, statusText: 'Unauthorized' }))
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
