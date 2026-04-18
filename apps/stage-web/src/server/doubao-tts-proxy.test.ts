import { describe, expect, it } from 'vitest'

import { buildDoubaoTtsHttpBody, decodeDoubaoTtsAudio } from './doubao-tts-proxy'

describe('doubao tts proxy helpers', () => {
  it('builds official Doubao TTS payload with default cluster and encoding', () => {
    const result = buildDoubaoTtsHttpBody({
      input: 'Hello from PepTutor.',
      voice: 'zh_female_vv_uranus_bigtts',
    }, {
      VITE_PEPTUTOR_TTS_API_KEY: 'tts-token',
      VITE_PEPTUTOR_TTS_APP_ID: 'tts-app',
    })

    expect(result.headers.Authorization).toBe('Bearer;tts-token')
    expect(result.requestBody).toMatchObject({
      app: {
        appid: 'tts-app',
        token: 'tts-token',
        cluster: 'volcano_tts',
      },
      user: {
        uid: 'peptutor-browser',
      },
      audio: {
        voice_type: 'zh_female_vv_uranus_bigtts',
        encoding: 'mp3',
      },
      request: {
        text: 'Hello from PepTutor.',
        text_type: 'plain',
        operation: 'query',
      },
    })
    expect(result.requestBody.request.reqid).toBeTruthy()
  })

  it('decodes base64 audio payload into bytes', () => {
    const audio = decodeDoubaoTtsAudio({
      code: 3000,
      message: 'Success',
      data: Buffer.from('hello').toString('base64'),
    })

    expect(audio.toString('utf8')).toBe('hello')
  })
})
