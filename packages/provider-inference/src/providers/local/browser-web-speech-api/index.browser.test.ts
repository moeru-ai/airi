import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerBrowserWebSpeechApi } from '.'
import { streamWebSpeechAPITranscription } from './provider'

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

it('reports capture failures and does not restart an errored stream', async () => {
  // ROOT CAUSE:
  // audio-capture returned without rejecting the result, leaving compact
  // hearing status at listening even though the browser could not capture audio.
  const instances: Recognition[] = []
  class Recognition {
    onerror?: (event: { error: string }) => void
    onend?: () => void
    start = vi.fn()
    constructor() { instances.push(this) }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  const result = streamWebSpeechAPITranscription(new MediaStream(), { continuous: true })
  const textFailure = expect(result.text).rejects.toThrow('audio-capture')
  const textStreamFailure = expect(result.textStream.getReader().read()).rejects.toThrow('audio-capture')
  const fullStreamFailure = expect(result.fullStream.getReader().read()).rejects.toThrow('audio-capture')
  const recognition = instances[0]!
  recognition.onerror?.({ error: 'audio-capture' })
  recognition.onend?.()
  await Promise.all([textFailure, textStreamFailure, fullStreamFailure])
  await new Promise(resolve => setTimeout(resolve, 150))
  expect(recognition.start).toHaveBeenCalledTimes(1)
})
