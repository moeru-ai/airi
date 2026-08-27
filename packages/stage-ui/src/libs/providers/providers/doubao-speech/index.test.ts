import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { ZodType } from 'zod'

import type { DoubaoSpeechConfig } from '.'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { providerDoubaoSpeech } from '.'

const mocks = vi.hoisted(() => ({
  createWebSocketFactory: vi.fn(() => vi.fn(() => ({ close: vi.fn() }))),
  synthesize: vi.fn(),
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isElectronWindow: () => true,
  isStageTamagotchi: () => true,
}))

vi.mock('./runtime', () => ({
  createDoubaoSpeechWebSocketFactory: mocks.createWebSocketFactory,
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
      webSocketFactory: expect.any(Function),
    })
    expect(session?.extraBody).toEqual({})
  })

  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3865631757
  // ROOT CAUSE:
  //
  // `createSession` used only the persisted Provider configuration. Stage
  // passed the active model and voice, but the session ignored both values.
  // This could connect with credentials for one selection and synthesize with
  // a different model and voice.
  //
  // We fix this by applying the active selections before the immutable
  // transport configuration is created.
  it('uses the active model and voice for the streaming session', () => {
    const session = providerDoubaoSpeech.capabilities?.speech?.createSession?.({
      config,
      model: 'seed-icl-2.0',
      voice: {
        id: 'S_test_clone_voice',
        name: 'Test clone voice',
        provider: 'doubao-speech',
        languages: [],
      },
    })

    expect(session).toMatchObject({
      model: 'seed-icl-2.0',
      voice: 'S_test_clone_voice',
    })
    expect(mocks.createWebSocketFactory).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 'seed-icl-2.0',
      speaker: 'S_test_clone_voice',
    }))
  })

  // ROOT CAUSE:
  //
  // A card can select a cloned voice that is not in the renderer's current
  // voice catalog. The synchronized voice ID was available, but Stage passed
  // only the missing renderer-local VoiceInfo to the provider session. The
  // session then used the unrelated speaker from the Provider configuration.
  //
  // We pass the synchronized voice ID into the session context and give it
  // precedence over renderer-local metadata and Provider configuration.
  it('uses the active card voice ID before renderer-local metadata loads', () => {
    const session = providerDoubaoSpeech.capabilities?.speech?.createSession?.({
      config,
      model: 'seed-icl-2.0',
      voiceId: 'S_card_clone_voice',
      voice: {
        id: 'zh_female_vv_uranus_bigtts',
        name: 'Stale local voice',
        provider: 'doubao-speech',
        languages: [],
      },
    })

    expect(session).toMatchObject({
      model: 'seed-icl-2.0',
      voice: 'S_card_clone_voice',
    })
    expect(mocks.createWebSocketFactory).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 'seed-icl-2.0',
      speaker: 'S_card_clone_voice',
    }))
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

  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3875415188
  // ROOT CAUSE:
  //
  // A resource change clears the previous speaker before the voice catalog
  // reloads. `listVoices` used the complete synthesis schema, so the empty
  // speaker rejected the request and hid every official voice.
  //
  // We fixed this by validating only the resource and optional selected voice
  // when the provider lists voices. Synthesis keeps the complete schema.
  it('lists official voices before a speaker is selected', async () => {
    const provider = await providerDoubaoSpeech.createProvider(config)
    const voices = await providerDoubaoSpeech.extraMethods?.listVoices?.({
      ...config,
      speaker: '',
    }, provider, 'seed-tts-2.0')

    expect(voices).toHaveLength(429)
    expect(voices?.[0]).toMatchObject({
      compatibleModels: ['seed-tts-2.0'],
      id: 'zh_female_vv_uranus_bigtts',
      name: 'Vivi 2.0',
    })
  })

  it('requires 48000 Hz for ogg_opus output', async () => {
    const schema = await providerDoubaoSpeech.createProviderConfig({ t: input => input }) as ZodType<DoubaoSpeechConfig>
    const result = schema.safeParse({
      ...config,
      audio: { ...config.audio, format: 'ogg_opus', sampleRate: 24000 },
    })

    expect(result.success).toBe(false)
  })

  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3874221722
  // ROOT CAUSE:
  //
  // Changing the Doubao resource kept the previous speaker. The configuration
  // schema accepted an official voice with the clone resource, so synthesis
  // failed only after the request reached Doubao.
  //
  // The settings pages now clear the speaker with the resource change. The
  // schema also rejects known official voices for the clone resource.
  it('rejects an official voice for the clone resource', async () => {
    const schema = await providerDoubaoSpeech.createProviderConfig({ t: input => input }) as ZodType<DoubaoSpeechConfig>
    const result = schema.safeParse({
      ...config,
      resourceId: 'seed-icl-2.0',
    })

    expect(result.success).toBe(false)
  })
})
