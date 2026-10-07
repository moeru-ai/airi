import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { StreamTranscriptionDelta } from '@xsai/stream-transcription'

import type { StreamTranscriptionSnapshot } from '../../../types'

export interface WebSpeechAPIExtraOptions {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  maxAlternatives?: number
  abortSignal?: AbortSignal
}

/** The catalog exposes settings here. Recognition requires the native media entry point below. */
export function createWebSpeechAPIProvider(): TranscriptionProviderWithExtraOptions<string, WebSpeechAPIExtraOptions> {
  const available = typeof window !== 'undefined'
    && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  if (!available)
    throw new Error('Web Speech API is not available in this browser')

  return {
    transcription: model => ({
      baseURL: 'about:blank',
      model: model || 'web-speech-api',
      fetch: async () => {
        throw new Error('Web Speech API requires a native MediaStream. Use streamWebSpeechAPITranscription.')
      },
    }),
  }
}

/** Browser recognition is absent from lib.dom. This boundary describes the native operations used by the provider. */
interface NativeSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  start: (track: MediaStreamTrack) => void
  stop: () => void
  abort: () => void
}

/** Recognition callbacks report provider facts. Capture ownership remains with the supplied media stream. */
interface WebSpeechStreamOptions extends WebSpeechAPIExtraOptions {
  onSentenceEnd?: (delta: string) => void
  onSpeechEnd?: (text: string) => void
  onTranscriptionUpdate?: (text: string) => void
  onSpeechStart?: () => void
  onSpeechCaptureEnd?: () => void
  onRecognitionCycleEnd?: () => void
}

/** Owns recognition cycles for one supplied track. Stop drains final results. Abort rejects the request. */
class WebSpeechSession {
  readonly textStream: ReadableStream<string>
  readonly fullStream: ReadableStream<StreamTranscriptionDelta | StreamTranscriptionSnapshot>
  readonly text: Promise<string>
  private readonly completion = Promise.withResolvers<string>()
  private textOutput!: ReadableStreamDefaultController<string>
  private fullOutput!: ReadableStreamDefaultController<StreamTranscriptionDelta | StreamTranscriptionSnapshot>
  private recognition: NativeSpeechRecognition | undefined
  private readonly track: MediaStreamTrack | undefined
  private completedText = ''
  private cycleText = ''
  private finalCount = 0
  private stopping = false
  private closed = false
  private restart: ReturnType<typeof setTimeout> | undefined

  constructor(media: MediaStream, private readonly options: WebSpeechStreamOptions) {
    this.text = this.completion.promise
    this.textStream = new ReadableStream({ start: (output) => {
      this.textOutput = output
    }, cancel: () => this.abort() })
    this.fullStream = new ReadableStream({ start: (output) => {
      this.fullOutput = output
    }, cancel: () => this.abort() })
    this.track = media.getAudioTracks()[0]
    try {
      const browser = globalThis as typeof globalThis & { SpeechRecognition?: new () => NativeSpeechRecognition, webkitSpeechRecognition?: new () => NativeSpeechRecognition }
      const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
      if (!Recognition)
        throw new Error('Web Speech API is not available in this browser')
      if (!this.track || this.track.readyState !== 'live')
        throw new Error('Web Speech API requires a live audio track')
      this.recognition = new Recognition()
      this.recognition.lang = options.language ?? 'en-US'
      this.recognition.continuous = options.continuous ?? true
      this.recognition.interimResults = options.interimResults ?? true
      this.recognition.maxAlternatives = options.maxAlternatives ?? 1
      this.recognition.onresult = event => this.result(event)
      this.recognition.onerror = (event) => {
        if (event.error !== 'no-speech')
          this.fail(new Error(`Speech recognition error: ${event.error}`))
      }
      this.recognition.onend = () => this.ended()
      this.recognition.onspeechstart = () => this.notify(options.onSpeechStart)
      this.recognition.onspeechend = () => this.notify(options.onSpeechCaptureEnd)
      options.abortSignal?.addEventListener('abort', this.abort, { once: true })
      options.abortSignal?.throwIfAborted()
      this.start()
    }
    catch (error) {
      this.fail(error)
    }
  }

  /** Triggering workflow: provider stop or capture completion → native stop → final result and end events. */
  stop() {
    if (this.closed || this.stopping)
      return
    this.stopping = true
    if (this.restart) {
      clearTimeout(this.restart)
      this.ended()
      return
    }
    try {
      this.recognition?.stop()
    }
    catch (error) {
      this.fail(error)
    }
  }

  private start() {
    if (this.closed || this.stopping)
      return
    try {
      this.recognition!.start(this.track!)
    }
    catch (error) {
      this.fail(error)
    }
  }

  /** Triggering workflow: native result event → complete revision and committed sentence callbacks → Hearing. */
  private result(event: SpeechRecognitionEvent) {
    if (this.closed)
      return
    const final: string[] = []
    const interim: string[] = []
    for (let index = 0; index < event.results.length; index++) {
      const result = event.results[index]
      const text = result[0]?.transcript ?? ''
      if (result.isFinal)
        final.push(text)
      else
        interim.push(text)
    }
    const delta = final.slice(this.finalCount).join(' ')
    this.finalCount = final.length
    this.cycleText = final.join(' ')
    const text = [this.completedText, this.cycleText, ...interim].filter(Boolean).join(' ')
    this.fullOutput.enqueue({ type: 'transcript.text.snapshot', text, isFinal: !interim.length, locale: this.recognition!.lang, startMilliseconds: 0, durationMilliseconds: 0 })
    if (delta) {
      this.textOutput.enqueue(delta)
      this.notify(this.options.onSentenceEnd, delta)
    }
    this.notify(this.options.onTranscriptionUpdate, text)
  }

  /** Triggering workflow: native end event → restart an open request or complete a stopped request. */
  private ended() {
    if (this.closed)
      return
    this.completedText = [this.completedText, this.cycleText].filter(Boolean).join(' ')
    this.cycleText = ''
    this.finalCount = 0
    this.notify(this.options.onRecognitionCycleEnd)
    if (!this.stopping && this.options.continuous !== false) {
      // Keep the existing restart delay between browser recognition cycles.
      this.restart = setTimeout(() => {
        this.restart = undefined
        this.start()
      }, 100)
      return
    }
    this.closed = true
    this.options.abortSignal?.removeEventListener('abort', this.abort)
    this.fullOutput.enqueue({ type: 'transcript.text.done', delta: '' })
    this.fullOutput.close()
    this.textOutput.close()
    this.completion.resolve(this.completedText)
    this.notify(this.options.onSpeechEnd, this.completedText)
  }

  private readonly abort = () => this.fail(this.options.abortSignal?.reason ?? new DOMException('Recognition cancelled', 'AbortError'))

  private fail(cause: unknown) {
    if (this.closed)
      return
    this.closed = true
    clearTimeout(this.restart)
    this.options.abortSignal?.removeEventListener('abort', this.abort)
    const error = cause instanceof Error ? cause : new Error('Speech recognition failed', { cause })
    this.fullOutput.error(error)
    this.textOutput.error(error)
    this.completion.reject(error)
    try {
      this.recognition?.abort()
    }
    catch { /* The streams already report the original failure. */ }
  }

  private notify<Args extends unknown[]>(callback: ((...args: Args) => void) | undefined, ...args: Args) {
    try {
      callback?.(...args)
    }
    catch (error) {
      console.error('Speech recognition observer failed', error)
    }
  }
}

/** Uses the caller's track. Stop preserves final text, while request abort cancels recognition and its output streams. */
export function streamWebSpeechAPITranscription(media: MediaStream, options: WebSpeechStreamOptions = {}) {
  const session = new WebSpeechSession(media, options)
  return { fullStream: session.fullStream, text: session.text, textStream: session.textStream, recognition: session }
}
