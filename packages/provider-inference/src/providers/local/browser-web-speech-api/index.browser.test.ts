import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerBrowserWebSpeechApi } from '.'

class FakeSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ''
  maxAlternatives = 1
  onend: (() => void) | undefined

  start(): void {
    this.onend?.()
  }

  stop(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('browser Web Speech provider', () => {
  it('uses an explicit Browser capability fake', async () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)

    expect(await providerBrowserWebSpeechApi.isAvailableBy?.()).toBe(true)

    const provider = await providerBrowserWebSpeechApi.createProvider({
      continuous: true,
      interimResults: true,
      language: 'en-US',
      maxAlternatives: 1,
    })

    if (!('transcription' in provider))
      throw new Error('Web Speech API did not create a transcription provider.')

    const request = provider.transcription?.('web-speech-api')
    if (!request?.fetch)
      throw new Error('Web Speech API did not create a transcription request.')

    const response = await request.fetch(new URL('https://provider.test/transcription'), {})

    expect(response).toBeInstanceOf(ReadableStream)
  })
})
