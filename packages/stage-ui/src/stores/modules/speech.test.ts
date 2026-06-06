import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  OFFICIAL_SPEECH_PROVIDER_ID,
  OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
} from '../../libs/providers/providers/official'
import { useProvidersStore } from '../providers'
import { toSignedPercent, useSpeechStore } from './speech'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en-US' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('speech store helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('formats positive percentages with a plus sign', () => {
    expect(toSignedPercent(25)).toBe('+25%')
  })

  it('formats negative percentages without a double minus', () => {
    expect(toSignedPercent(-20)).toBe('-20%')
    expect(toSignedPercent(-20)).not.toContain('--')
  })

  it('formats zero as 0%', () => {
    expect(toSignedPercent(0)).toBe('0%')
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { rate: '+20%' } })
   */
  it('maps Voice Pack rate params to provider speed', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: { rate: '+20%' },
    })

    expect(request.input).toBe('hello')
    expect(request.providerConfig.speed).toBe(1.2)
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { pitch: '+20%' }, supportsSSML: true })
   */
  it('applies Voice Pack prosody params through SSML when supported', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
      gender: 'neutral',
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: {
        pitch: '+20%',
        volume: '-5%',
      },
      supportsSSML: true,
    })

    expect(request.input).toContain('<prosody')
    expect(request.input).toContain('pitch="+20%"')
    expect(request.input).toContain('volume="-5%"')
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { pitch: '+20%' }, supportsAdapterProsody: true })
   */
  it('passes Voice Pack prosody params through adapter options when supported', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: {
        pitch: '+20%',
        volume: '+5%',
      },
      supportsAdapterProsody: true,
    })

    expect(request.input).toBe('hello')
    expect(request.providerConfig.extraBody).toEqual({
      voice_pack: {
        pitch: 20,
        volume: 5,
      },
    })
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, voicePack: { packId: 'vp-1', costMultiplier: 1.5 } })
   */
  it('passes Voice Pack snapshot billing metadata through adapter options', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: {},
      voicePack: {
        packId: 'vp-1',
        costMultiplier: 1.5,
      },
      supportsAdapterProsody: true,
    })

    expect(request.providerConfig.extraBody).toEqual({
      voice_pack: {
        pack_id: 'vp-1',
        cost_multiplier: 1.5,
      },
    })
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { pitch: '+20%' }, supportsSSML: false })
   */
  it('fails fast when Voice Pack prosody params cannot be applied', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    expect(() => speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: { pitch: '+20%' },
      supportsSSML: false,
    })).toThrow('SSML-capable speech provider')
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { emotion: 'happy' } })
   */
  it('fails fast on unsupported Voice Pack params', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    expect(() => speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: { emotion: 'happy' },
    })).toThrow('Unsupported Voice Pack parameter "emotion"')
  })

  /**
   * @example
   * await speechStore.loadVoicesForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, 'volcengine/seed-tts-2.0')
   */
  it('does not load streaming voices before server availability is confirmed', async () => {
    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    const listVoices = vi.fn(async () => [])
    const metadata = providersStore.providerMetadata[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID]
    metadata.capabilities.listVoices = listVoices
    providersStore.providerRuntimeState[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID].isConfigured = false

    const voices = await speechStore.loadVoicesForProvider(
      OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
      'volcengine/seed-tts-2.0',
    )

    expect(voices).toEqual([])
    expect(listVoices).not.toHaveBeenCalled()
  })

  /**
   * @example
   * speechStore.ensureActiveSpeechModel()
   */
  it('resets stale streaming model when the regular official speech provider is active', () => {
    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechModel = 'volcengine/seed-tts-2.0'
    speechStore.activeSpeechVoiceId = 'zh_female_x'
    speechStore.activeSpeechVoice = {
      id: 'zh_female_x',
      name: 'X',
      provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
      languages: [],
    }
    providersStore.providerRuntimeState[OFFICIAL_SPEECH_PROVIDER_ID].models = [
      { id: 'microsoft/v1', name: 'microsoft/v1', provider: OFFICIAL_SPEECH_PROVIDER_ID },
      { id: 'alibaba/cosyvoice-v2', name: 'alibaba/cosyvoice-v2', provider: OFFICIAL_SPEECH_PROVIDER_ID },
    ]

    speechStore.ensureActiveSpeechModel()

    expect(speechStore.activeSpeechModel).toBe('microsoft/v1')
    expect(speechStore.activeSpeechVoiceId).toBe('')
    expect(speechStore.activeSpeechVoice).toBeUndefined()
  })
})
