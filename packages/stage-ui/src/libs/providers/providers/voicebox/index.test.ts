import type { SpeechProviderWithExtraOptions, TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { generateSpeech } from '@xsai/generate-speech'
import { generateTranscription } from '@xsai/generate-transcription'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  providerVoiceboxSpeech,
  providerVoiceboxTranscription,
  VOICEBOX_SPEECH_PROVIDER_ID,
  VOICEBOX_TRANSCRIPTION_PROVIDER_ID,
} from './index'

const config = {
  baseUrl: 'http://127.0.0.1:17493/',
  language: 'zh',
  model: 'qwen-tts-1.7B',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('voicebox local speech provider', () => {
  it('adapts OpenAI-shaped speech requests to the Voicebox Qwen stream endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new Uint8Array([82, 73, 70, 70]), {
      headers: { 'Content-Type': 'audio/wav' },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = providerVoiceboxSpeech.createProvider(config) as SpeechProviderWithExtraOptions<string, { language?: string }>
    const audio = await generateSpeech({
      ...provider.speech('qwen-tts-1.7B', { language: 'zh' }),
      input: '你好',
      voice: 'profile-1',
    })

    expect(audio.byteLength).toBe(4)
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://127.0.0.1:17493/generate/stream')

    const request = fetchMock.mock.calls[0][1]
    expect(request?.method).toBe('POST')
    expect(JSON.parse(String(request?.body))).toEqual({
      engine: 'qwen',
      language: 'zh',
      model_size: '1.7B',
      profile_id: 'profile-1',
      text: '你好',
    })
  })

  it('routes local development requests through the Voicebox Vite proxy', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([82, 73, 70, 70]), {
      headers: { 'Content-Type': 'audio/wav' },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('location', {
      hostname: '127.0.0.1',
      origin: 'http://127.0.0.1:5173',
      protocol: 'http:',
    })

    const provider = providerVoiceboxSpeech.createProvider(config) as SpeechProviderWithExtraOptions<string, { language?: string }>
    await generateSpeech({
      ...provider.speech('qwen-tts-1.7B', { language: 'zh' }),
      input: '你好',
      voice: 'profile-1',
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://127.0.0.1:5173/__voicebox/generate/stream')
  })

  it('loads Qwen models and cloned voice profiles from Voicebox', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        models: [
          {
            display_name: 'Qwen TTS 1.7B',
            downloaded: true,
            downloading: false,
            model_name: 'qwen-tts-1.7B',
          },
        ],
      }))
      .mockResolvedValueOnce(Response.json([
        {
          description: null,
          id: 'profile-1',
          language: 'zh',
          name: '我的声音',
        },
      ]))
    vi.stubGlobal('fetch', fetchMock)

    const provider = providerVoiceboxSpeech.createProvider(config)
    const models = await providerVoiceboxSpeech.extraMethods?.listModels?.(config, provider)
    const voices = await providerVoiceboxSpeech.extraMethods?.listVoices?.(config, provider)

    expect(models).toEqual([
      {
        id: 'qwen-tts-1.7B',
        name: 'Qwen TTS 1.7B',
        provider: VOICEBOX_SPEECH_PROVIDER_ID,
        description: 'Ready',
      },
    ])
    expect(voices).toEqual([
      {
        id: 'profile-1',
        name: '我的声音',
        provider: VOICEBOX_SPEECH_PROVIDER_ID,
        description: undefined,
        languages: [{ code: 'zh', title: 'ZH' }],
      },
    ])
  })
})

describe('voicebox local transcription provider', () => {
  it('adapts OpenAI-shaped transcription uploads to the Voicebox endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
      duration: 1.25,
      text: '你好',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const transcriptionConfig = {
      ...config,
      model: 'base',
    }
    const provider = providerVoiceboxTranscription.createProvider(transcriptionConfig) as TranscriptionProviderWithExtraOptions<string, { language?: string }>
    const result = await generateTranscription({
      ...provider.transcription('base', { language: 'zh' }),
      file: new File([new Uint8Array([1, 2, 3])], 'recording.wav', { type: 'audio/wav' }),
      fileName: 'recording.wav',
      language: 'zh',
    })

    expect(result.text).toBe('你好')
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://127.0.0.1:17493/transcribe')

    const request = fetchMock.mock.calls[0][1]
    expect(request?.method).toBe('POST')
    expect(request?.body).toBeInstanceOf(FormData)

    const body = request?.body as FormData
    expect(body.get('model')).toBe('base')
    expect(body.get('language')).toBe('zh')
    expect((body.get('file') as File).name).toBe('recording.wav')
  })

  it('surfaces the recoverable Whisper download state as a provider error', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      detail: {
        message: 'Whisper model base is being downloaded. Please wait and try again.',
        model_name: 'whisper-base',
      },
    }, { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = providerVoiceboxTranscription.createProvider({
      ...config,
      model: 'base',
    }) as TranscriptionProviderWithExtraOptions<string, { language?: string }>

    await expect(generateTranscription({
      ...provider.transcription('base', { language: 'zh' }),
      file: new File([new Uint8Array([1, 2, 3])], 'recording.wav', { type: 'audio/wav' }),
      fileName: 'recording.wav',
    })).rejects.toThrow(/Whisper model base is being downloaded/)
  })

  it('lists Voicebox Whisper models using the model name expected by the transcription endpoint', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      models: [
        {
          display_name: 'Whisper Base',
          downloaded: true,
          downloading: false,
          model_name: 'whisper-base',
        },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const transcriptionConfig = {
      ...config,
      model: 'base',
    }
    const provider = providerVoiceboxTranscription.createProvider(transcriptionConfig)
    const models = await providerVoiceboxTranscription.extraMethods?.listModels?.(transcriptionConfig, provider)

    expect(models).toEqual([
      {
        id: 'base',
        name: 'Whisper Base',
        provider: VOICEBOX_TRANSCRIPTION_PROVIDER_ID,
        description: 'Ready',
      },
    ])
  })
})
