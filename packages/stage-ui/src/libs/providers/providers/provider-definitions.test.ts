import type { ComposerTranslation } from 'vue-i18n'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { providerBrowserWebSpeechApi } from './browser-web-speech-api'
import { providerElevenLabs } from './elevenlabs'
import {
  providerAppLocalAudioSpeech,
  providerAppLocalAudioTranscription,
  providerBrowserLocalAudioSpeech,
  providerBrowserLocalAudioTranscription,
} from './local-audio'
import { getDefinedProvider } from './registry'
import { providerSpeechNoop } from './speech-noop'

import './index'

const translate = ((key: string) => key) as unknown as ComposerTranslation

describe('migrated provider definitions', () => {
  it('registers every provider that moved out of the legacy store', () => {
    const providerIds = [
      'speech-noop',
      'app-local-audio-speech',
      'app-local-audio-transcription',
      'browser-local-audio-speech',
      'browser-local-audio-transcription',
      'openai-audio-speech',
      'openai-compatible-audio-speech',
      'openai-audio-transcription',
      'openai-compatible-audio-transcription',
      'aliyun-nls-transcription',
      'browser-web-speech-api',
      'elevenlabs',
      'deepgram-tts',
      'microsoft-speech',
      'index-tts-vllm',
      'alibaba-cloud-model-studio',
      'volcengine',
      'minimax-speech',
      'openrouter-audio-speech',
      'mimo-audio-speech',
      'comet-api-speech',
      'comet-api-transcription',
      'mimo-audio-transcription',
      'player2-speech',
      'kokoro-local',
      'google-gemini-audio-speech',
    ]

    for (const providerId of providerIds)
      expect(getDefinedProvider(providerId), providerId).toBeDefined()
  })

  it('creates the no-op speech provider through ProviderDefinition', () => {
    const provider = providerSpeechNoop.createProvider({})

    expect(provider).toHaveProperty('speech')
    expect('speech' in provider && provider.speech('unused')).toMatchObject({
      baseURL: 'http://speech-noop.invalid/v1/',
      model: 'noop',
    })
  })

  it('keeps local audio providers split by inference task', () => {
    expect(providerAppLocalAudioSpeech.tasks).toContain('text-to-speech')
    expect(providerBrowserLocalAudioSpeech.tasks).toContain('text-to-speech')
    expect(providerAppLocalAudioTranscription.tasks).toContain('speech-to-text')
    expect(providerBrowserLocalAudioTranscription.tasks).toContain('speech-to-text')
    expect(providerAppLocalAudioTranscription.capabilities?.transcription).toEqual({
      protocol: 'http',
      generateOutput: true,
      streamOutput: false,
      streamInput: false,
    })
  })

  it('keeps the local audio base URL validation in the definition', async () => {
    const validator = providerAppLocalAudioSpeech.validators?.validateConfig?.[0]({ t: translate })

    const missing = await validator?.validator({}, { t: translate })
    const configured = await validator?.validator({ baseUrl: 'http://localhost:1234/v1/' }, { t: translate })

    expect(missing?.valid).toBe(false)
    expect(missing?.reason).toContain('Base URL is required.')
    expect(configured?.valid).toBe(true)
  })

  it('describes Web Speech API streaming support without runtime state', async () => {
    const defaults = z.parse(providerBrowserWebSpeechApi.createProviderConfig({ t: translate }), {})

    expect(defaults).toEqual({
      language: 'en-US',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
    })
    expect(providerBrowserWebSpeechApi.capabilities?.transcription).toEqual({
      protocol: 'http',
      generateOutput: false,
      streamOutput: true,
      streamInput: true,
    })
    expect(await providerBrowserWebSpeechApi.isAvailableBy?.()).toBe(false)
  })

  it('keeps ElevenLabs configuration and model discovery in the definition', async () => {
    const defaults = z.parse(providerElevenLabs.createProviderConfig({ t: translate }), { apiKey: 'test' })
    const models = await providerElevenLabs.extraMethods?.listModels?.(defaults, providerElevenLabs.createProvider(defaults))

    expect(defaults).toMatchObject({
      baseUrl: 'https://unspeech.hyp3r.link/v1/',
      voiceSettings: {
        similarityBoost: 0.75,
        stability: 0.5,
      },
    })
    expect(models?.length).toBeGreaterThan(0)
    expect(models?.every(model => model.provider === 'elevenlabs')).toBe(true)
  })
})
