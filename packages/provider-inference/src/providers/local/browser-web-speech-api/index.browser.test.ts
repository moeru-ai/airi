import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerBrowserWebSpeechApi, streamWebSpeechAPITranscription } from '.'

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

describe('streaming dictation updates', () => {
  it('preserves an unexpected browser interruption instead of resolving empty text', async () => {
    const recognitions: Recognition[] = []
    class Recognition extends FakeSpeechRecognition {
      onerror?: (event: { error: string }) => void
      constructor() {
        super()
        recognitions.push(this)
      }

      start() {}
    }
    vi.stubGlobal('SpeechRecognition', Recognition)
    const result = streamWebSpeechAPITranscription(new MediaStream(), { continuous: false })
    const rejected = expect(result.text).rejects.toThrow('Speech recognition error: aborted')
    recognitions[0].onerror?.({ error: 'aborted' })
    recognitions[0].onend?.()
    await rejected
  })

  it('finishes during the continuous restart delay without starting again', async () => {
    const starts = vi.fn()
    class Recognition extends FakeSpeechRecognition {
      start() {
        starts()
        this.onend?.()
      }
    }
    vi.stubGlobal('SpeechRecognition', Recognition)
    const result = streamWebSpeechAPITranscription(new MediaStream(), { continuous: true })
    result.stop()
    expect(await result.text).toBe('')
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(starts).toHaveBeenCalledOnce()
  })

  it('discards results after cancellation without writing to closed streams', async () => {
    const recognitions: Recognition[] = []
    class Recognition extends FakeSpeechRecognition {
      onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
      constructor() {
        super()
        recognitions.push(this)
      }

      start() {}
      abort() { this.onend?.() }
    }
    vi.stubGlobal('SpeechRecognition', Recognition)
    const abort = new AbortController()
    const sentence = vi.fn()
    const result = streamWebSpeechAPITranscription(new MediaStream(), { abortSignal: abort.signal, onSentenceEnd: sentence })
    const rejected = expect(result.text).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await rejected
    recognitions[0].onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'discard this' } }] })
    expect(sentence).not.toHaveBeenCalled()
  })

  it('replaces interim text and commits each final sentence once', async () => {
    const recognitions: StreamingRecognition[] = []
    class StreamingRecognition extends FakeSpeechRecognition {
      onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
      constructor() {
        super()
        recognitions.push(this)
      }

      start() {}
      stop() { this.onend?.() }
    }
    vi.stubGlobal('SpeechRecognition', StreamingRecognition)
    const update = vi.fn()
    const sentence = vi.fn()
    const result = streamWebSpeechAPITranscription(new MediaStream(), {
      continuous: false,
      onTranscriptionUpdate: update,
      onSentenceEnd: sentence,
    })
    const recognition = recognitions[0]
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'hello' } }] })
    expect(update).toHaveBeenLastCalledWith('hello')
    expect(sentence).not.toHaveBeenCalled()
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'hello world' } }] })
    expect(update).toHaveBeenLastCalledWith('hello world')
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'hello world' } }] })
    expect(sentence).toHaveBeenCalledExactlyOnceWith('hello world')
    expect(update).toHaveBeenLastCalledWith('')
    recognition.stop()
    expect((await result.text).trim()).toBe('hello world')
  })
})
