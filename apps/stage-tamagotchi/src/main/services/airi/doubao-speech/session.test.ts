import type { DoubaoSpeechSessionConfig } from '@proj-airi/stage-shared/doubao-speech'

import { parseDoubaoSpeechRequest } from '@proj-airi/stage-shared/doubao-speech'
import { describe, expect, it } from 'vitest'

import { DoubaoSpeechEvent } from './protocol'
import { createDoubaoSessionPayload, createDoubaoTaskPayload } from './session'

const config: DoubaoSpeechSessionConfig = {
  apiKey: 'test-key',
  baseUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
  resourceId: 'seed-tts-2.0',
  speaker: 'zh_female_test',
  audio: {
    format: 'mp3',
    sampleRate: 24000,
    speechRate: 12,
    loudnessRate: -5,
    pitch: 2,
  },
  explicitLanguage: 'zh-cn',
  explicitDialect: 'beijing',
  voiceInstruction: 'Speak gently.',
}

describe('doubao speech session requests', () => {
  it('maps configured native options into StartSession req_params', () => {
    expect(createDoubaoSessionPayload(config)).toEqual({
      event: DoubaoSpeechEvent.StartSession,
      req_params: {
        audio_params: {
          format: 'mp3',
          loudness_rate: -5,
          sample_rate: 24000,
          speech_rate: 12,
        },
        context_texts: ['Speak gently.'],
        explicit_dialect: 'beijing',
        explicit_language: 'zh-cn',
        post_process: { pitch: 2 },
        speaker: 'zh_female_test',
      },
    })
  })

  it('sends each text chunk with the same session options', () => {
    expect(createDoubaoTaskPayload(config, '你好')).toEqual({
      event: DoubaoSpeechEvent.TaskRequest,
      req_params: {
        audio_params: {
          format: 'mp3',
          loudness_rate: -5,
          sample_rate: 24000,
          speech_rate: 12,
        },
        context_texts: ['Speak gently.'],
        explicit_dialect: 'beijing',
        explicit_language: 'zh-cn',
        post_process: { pitch: 2 },
        speaker: 'zh_female_test',
        text: '你好',
      },
    })
  })

  it('omits official-voice instructions for a cloned voice resource', () => {
    expect(createDoubaoSessionPayload({
      ...config,
      resourceId: 'seed-icl-2.0',
    }).req_params).not.toHaveProperty('context_texts')
  })

  it('rejects a non-official upstream URL at the IPC boundary', () => {
    expect(() => parseDoubaoSpeechRequest({
      type: 'start',
      config: { ...config, baseUrl: 'wss://example.com/speech' },
    })).toThrow('Invalid Doubao speech stream request')
  })

  it('rejects an unsupported Opus sample rate at the IPC boundary', () => {
    expect(() => parseDoubaoSpeechRequest({
      type: 'start',
      config: {
        ...config,
        audio: { ...config.audio, format: 'ogg_opus', sampleRate: 24000 },
      },
    })).toThrow('Invalid Doubao speech stream request')
  })
})
