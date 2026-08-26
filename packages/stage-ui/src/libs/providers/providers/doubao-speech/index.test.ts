import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { ZodType } from 'zod'

import type { DoubaoSpeechConfig } from '.'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { providerDoubaoSpeech } from '.'

const mocks = vi.hoisted(() => ({
  synthesize: vi.fn(),
  webSocketFactory: vi.fn(() => ({ close: vi.fn() })),
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isElectronWindow: () => true,
  isStageTamagotchi: () => true,
}))

vi.mock('./runtime', () => ({
  createDoubaoSpeechWebSocketFactory: () => mocks.webSocketFactory,
  synthesizeDoubaoSpeech: mocks.synthesize,
}))

const config: DoubaoSpeechConfig = {
  apiKey: 'test-key',
  baseUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
  resourceId: 'seed-tts-2.0',
  speaker: 'zh_female_vv_uranus_bigtts',
  audio: {
    format: 'mp3',
    sampleRate: 24000,
    speechRate: 10,
    loudnessRate: -5,
    pitch: 2,
  },
  explicitLanguage: 'zh-cn',
  explicitDialect: 'beijing',
  voiceInstruction: 'Speak gently.',
}

describe('doubao speech Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.synthesize.mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer)
  })

  it('builds a direct streaming session from persisted settings', () => {
    const session = providerDoubaoSpeech.capabilities?.speech?.createSession?.({ config })

    expect(session).toMatchObject({
      bufferEntireSession: true,
      model: 'seed-tts-2.0',
      voice: 'zh_female_vv_uranus_bigtts',
      webSocketFactory: mocks.webSocketFactory,
    })
    expect(session?.extraBody).toEqual({})
  })

  it('uses the Eventa session for a complete speech preview', async () => {
    const provider = await providerDoubaoSpeech.createProvider(config) as SpeechProviderWithExtraOptions<string, Record<string, unknown>>
    const request = provider.speech('seed-tts-2.0')
    const response = await request.fetch?.(new URL('https://doubao-speech.invalid/v1/audio/speech'), {
      body: JSON.stringify({ input: '你好', voice: 'zh_female_preview' }),
      method: 'POST',
    })

    expect(mocks.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        resourceId: 'seed-tts-2.0',
        speaker: 'zh_female_preview',
      }),
      '你好',
      undefined,
    )
    await expect(response?.arrayBuffer()).resolves.toEqual(Uint8Array.from([1, 2, 3]).buffer)
    expect(response?.headers.get('Content-Type')).toBe('audio/mpeg')
  })

  it('lists the configured clone voice for the clone resource', async () => {
    const provider = await providerDoubaoSpeech.createProvider(config)
    const voices = await providerDoubaoSpeech.extraMethods?.listVoices?.({
      ...config,
      speaker: 'S_test_clone_voice',
    }, provider, 'seed-icl-2.0')

    expect(voices).toEqual([expect.objectContaining({
      compatibleModels: ['seed-icl-2.0'],
      id: 'S_test_clone_voice',
      provider: 'doubao-speech',
    })])
  })

  it('lists official bidirectional voices for the TTS 2.0 resource', async () => {
    const provider = await providerDoubaoSpeech.createProvider(config)
    const voices = await providerDoubaoSpeech.extraMethods?.listVoices?.(config, provider, 'seed-tts-2.0')

    expect(voices).toHaveLength(429)
    expect(voices?.[0]).toMatchObject({
      compatibleModels: ['seed-tts-2.0'],
      id: 'zh_female_vv_uranus_bigtts',
      name: 'Vivi 2.0',
    })
    expect(voices?.some(voice => voice.id === 'de_male_sven_uranus_bigtts')).toBe(false)
  })

  it('requires 48000 Hz for ogg_opus output', async () => {
    const schema = await providerDoubaoSpeech.createProviderConfig({ t: input => input }) as ZodType<DoubaoSpeechConfig>
    const result = schema.safeParse({
      ...config,
      audio: { ...config.audio, format: 'ogg_opus', sampleRate: 24000 },
    })

    expect(result.success).toBe(false)
  })
})
