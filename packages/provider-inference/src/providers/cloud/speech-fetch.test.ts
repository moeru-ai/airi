import { describe, expect, it } from 'vitest'

import { enrichSpeechRequestBody, isChatAudioModel } from './speech-fetch'

describe('speech-fetch', () => {
  it('treats gpt-audio as chat-audio and fish as dedicated speech', () => {
    expect(isChatAudioModel('openai/gpt-audio-mini')).toBe(true)
    expect(isChatAudioModel('google/lyria-3-pro-preview')).toBe(true)
    expect(isChatAudioModel('fish-audio/s2-pro')).toBe(false)
  })

  it('adds Fish reference_id from the voice code', () => {
    const body = enrichSpeechRequestBody(JSON.stringify({
      model: 'fish-audio/s2-pro',
      input: 'hello',
      voice: 'df3144db39a34a02bdeeb2d3ad172211',
    }))
    expect(JSON.parse(body)).toMatchObject({
      model: 'fish-audio/s2-pro',
      voice: 'df3144db39a34a02bdeeb2d3ad172211',
      response_format: 'mp3',
      extra_body: { reference_id: 'df3144db39a34a02bdeeb2d3ad172211' },
    })
  })
})
