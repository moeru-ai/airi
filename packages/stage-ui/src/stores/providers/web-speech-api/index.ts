import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { StreamTranscriptionDelta, StreamTranscriptionResult } from '@xsai/stream-transcription'

// NOTICE: Copied/adapted from @xsai/stream-transcription delayed promise helper.
// Ref: @xsai/stream-transcription@0.4.0-beta.8 (dist/index.js DelayedPromise usage).
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  let _isResolved = false
  let _isRejected = false
  const promise = new Promise<T>((res, rej) => {
    resolve = (value) => {
      _isResolved = true
      res(value)
    }
    reject = (reason) => {
      _isRejected = true
      rej(reason)
    }
  })

  return {
    promise,
    resolve,
    reject,
    get isResolved() { return _isResolved },
    get isRejected() { return _isRejected },
    set isResolved(value: boolean) { _isResolved = value },
    set isRejected(value: boolean) { _isRejected = value },
  }
}

export interface WebSpeechAPIExtraOptions {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  maxAlternatives?: number
  abortSignal?: AbortSignal
}

/**
 * Web Speech API Speech Recognition provider
 *
 * This is a free, browser-native STT solution that requires no API keys.
 * Available in Chrome, Edge, Safari, and other Chromium-based browsers.
 *
 * Limitations:
 * - Only works in browser contexts (Electron renderer, web browsers)
 * - Requires user permission for microphone access
 * - Language support depends on browser implementation
 * - Not available in Node.js or Tauri main process
 */
export function createWebSpeechAPIProvider(): TranscriptionProviderWithExtraOptions<string, WebSpeechAPIExtraOptions> {
  // Check if Web Speech API is available
  const isAvailable = typeof window !== 'undefined'
    && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  if (!isAvailable) {
    throw new Error('Web Speech API is not available in this environment. It requires a browser context with SpeechRecognition support (Chrome, Edge, Safari).')
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  return {
    transcription: (model: string, extraOptions?: WebSpeechAPIExtraOptions) => {
      return {
        baseURL: 'about:blank', // Web Speech API doesn't use HTTP endpoints
        model: model || 'web-speech-api',
        fetch: async (_request: RequestInfo | URL, _init?: RequestInit) => {
          // Web Speech API does not support file-based transcription - it only supports live streaming
          // Check if a file is provided in the request body and reject it
          if (_init?.body) {
            // If body is FormData, it likely contains a file
            // If body is a Blob/File, it's definitely a file
            const body = _init.body
            if (body instanceof FormData || body instanceof Blob || body instanceof File) {
              const error = new Error('Web Speech API does not support file-based transcription. It only supports live streaming from a MediaStream. Please use the streaming transcription API or select a different provider that supports file-based transcription.')
              throw error
            }
          }

          const deferredText = createDeferred<string>()
          let fullText = ''
          let textStreamCtrl: ReadableStreamDefaultController<string> | undefined

          const textStream = new ReadableStream<string>({
            start(controller) {
              textStreamCtrl = controller
            },
          })

          const recognition = new SpeechRecognition()
          recognition.lang = extraOptions?.language || 'en-US'
          recognition.continuous = extraOptions?.continuous ?? true
          recognition.interimResults = extraOptions?.interimResults ?? true
          recognition.maxAlternatives = extraOptions?.maxAlternatives ?? 1

          recognition.onresult = (event: any) => {
            let finalTranscript = ''

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript
              if (event.results[i].isFinal) {
                finalTranscript += transcript
              }
            }

            // Emit final results as deltas
            if (finalTranscript) {
              fullText += finalTranscript
              textStreamCtrl?.enqueue(finalTranscript)
            }

            // Optionally emit interim results (commented out to avoid spam)
            // if (interimTranscript) {
            //   textStreamCtrl?.enqueue(interimTranscript)
            // }
          }

          recognition.onerror = (event: any) => {
            const error = new Error(`Speech recognition error: ${event.error}`)
            textStreamCtrl?.error(error)
            deferredText.reject(error)
            deferredText.isRejected = true
          }

          recognition.onend = () => {
            textStreamCtrl?.close()
            if (!deferredText.isResolved && !deferredText.isRejected) {
              deferredText.resolve(fullText)
              deferredText.isResolved = true
            }
          }

          // Handle abort signal
          if (extraOptions?.abortSignal) {
            extraOptions.abortSignal.addEventListener('abort', () => {
              recognition.stop()
              const error = new DOMException('Aborted', 'AbortError')
              textStreamCtrl?.error(error)
              deferredText.reject(error)
              deferredText.isRejected = true
            })
          }

          // Start recognition
          recognition.start()

          return textStream as unknown as Response
        },
      }
    },
  }
}

/**
 * Stream transcription using Web Speech API with MediaStream
 * This is designed to work with the existing hearing pipeline
 */
export function streamWebSpeechAPITranscription(
  _mediaStream: MediaStream,
  options?: WebSpeechAPIExtraOptions & {
    onSentenceEnd?: (delta: string) => void
    onSpeechEnd?: (text: string) => void
  },
): StreamTranscriptionResult & { recognition?: any } {
  const deferredText = createDeferred<string>()
  let fullText = ''
  let textStreamCtrl: ReadableStreamDefaultController<string> | undefined
  let fullStreamCtrl: ReadableStreamDefaultController<StreamTranscriptionDelta> | undefined
  let recognitionInstance: any = null

  const fullStream = new ReadableStream<StreamTranscriptionDelta>({
    start(controller) {
      fullStreamCtrl = controller
    },
  })

  const textStream = new ReadableStream<string>({
    start(controller) {
      textStreamCtrl = controller
    },
    cancel: () => {
      // Clean up recognition when stream is cancelled
      if (recognitionInstance) {
        try {
          recognitionInstance.stop()
        }
        catch {}
      }
    },
  })

  const isAvailable = typeof window !== 'undefined'
    && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  if (!isAvailable) {
    const error = new Error('Web Speech API is not available in this environment.')
    deferredText.reject(error)
    deferredText.isRejected = true
    textStreamCtrl?.error(error)
    fullStreamCtrl?.error(error)
    return {
      fullStream,
      text: deferredText.promise,
      textStream,
    }
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const recognition = new SpeechRecognition()
  recognitionInstance = recognition

  recognition.lang = options?.language || 'en-US'
  recognition.continuous = options?.continuous ?? true
  recognition.interimResults = options?.interimResults ?? true // Default to true for real-time feedback
  recognition.maxAlternatives = options?.maxAlternatives ?? 1

  console.info('Web Speech API configured:', {
    lang: recognition.lang,
    continuous: recognition.continuous,
    interimResults: recognition.interimResults,
  })

  recognition.onresult = (event: any) => {
    let finalTranscript = ''
    let interimTranscript = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript = result[0]?.transcript || ''

      if (result.isFinal) {
        finalTranscript = `${finalTranscript}${transcript} ` // Add space between final results
      }
      else if (recognition.interimResults) {
        // Collect interim results but don't emit them as final yet
        interimTranscript += transcript
      }
    }

    // Emit final results when we have them
    if (finalTranscript.trim()) {
      const trimmedTranscript = finalTranscript.trim()
      fullText = `${fullText}${trimmedTranscript} `
      const delta: StreamTranscriptionDelta = {
        type: 'transcript.text.delta',
        delta: trimmedTranscript,
      }
      fullStreamCtrl?.enqueue(delta)
      textStreamCtrl?.enqueue(trimmedTranscript)
      options?.onSentenceEnd?.(trimmedTranscript)
      console.info('Web Speech API transcribed (final):', trimmedTranscript)
    }

    // Log interim results for debugging (don't emit as final)
    if (interimTranscript && recognition.interimResults) {
      console.info('Web Speech API transcribed (interim):', interimTranscript)
    }
  }

  recognition.onerror = (event: any) => {
    const errorType = event.error || 'unknown'
    console.warn('Web Speech API error:', errorType)

    if (errorType === 'no-speech') {
      return
    }

    if (errorType === 'audio-capture') {
      console.warn('Web Speech API: Microphone access issue. Please check microphone permissions.')
      return
    }

    if (errorType === 'network' || errorType === 'aborted') {
      return
    }
    const error = new Error(`Speech recognition error: ${errorType}`)
    fullStreamCtrl?.error(error)
    textStreamCtrl?.error(error)
    deferredText.reject(error)
    deferredText.isRejected = true
    options?.onSpeechEnd?.(fullText)
  }

  recognition.onend = () => {
    console.info('Web Speech API recognition ended. Continuous mode:', options?.continuous !== false, 'Aborted:', options?.abortSignal?.aborted)

    // If continuous mode and not aborted, restart recognition
    if (options?.continuous !== false && !options?.abortSignal?.aborted) {
      // Use the current recognitionInstance to ensure we're using the correct instance
      const currentRecognition = recognitionInstance || recognition

      // Small delay before restarting to avoid rapid restart loops
      setTimeout(() => {
        try {
          currentRecognition.start()
          console.info('Web Speech API recognition restarted (continuous mode)')
        }
        catch (err) {
          console.warn('Web Speech API failed to restart, creating new instance:', err)
          // If restart fails, create a new instance
          try {
            createAndStartNewRecognitionInstance(recognition)
            console.info('Web Speech API created new instance and started')
          }
          catch (newErr) {
            console.error('Web Speech API failed to create new instance:', newErr)
            const error = new Error(`Failed to restart recognition: ${newErr instanceof Error ? newErr.message : String(newErr)}`)
            fullStreamCtrl?.error(error)
            textStreamCtrl?.error(error)
            deferredText.reject(error)
            deferredText.isRejected = true
          }
        }
      }, 100)
    }
    else {
      // Don't try to enqueue/close if the stream has already been aborted/errored
      if (options?.abortSignal?.aborted || deferredText.isRejected) {
        return
      }

      const doneDelta: StreamTranscriptionDelta = {
        type: 'transcript.text.done',
        delta: '',
      }
      fullStreamCtrl?.enqueue(doneDelta)
      fullStreamCtrl?.close()
      textStreamCtrl?.close()
      if (!deferredText.isResolved && !deferredText.isRejected) {
        deferredText.resolve(fullText)
        deferredText.isResolved = true
      }
      options?.onSpeechEnd?.(fullText)
    }
  }

  // Handle abort signal
  if (options?.abortSignal) {
    options.abortSignal.addEventListener('abort', () => {
      try {
        recognition.stop()
      }
      catch {}
      const error = new DOMException('Aborted', 'AbortError')
      fullStreamCtrl?.error(error)
      textStreamCtrl?.error(error)
      deferredText.reject(error)
      deferredText.isRejected = true
    })
  }

  function createAndStartNewRecognitionInstance(sourceRecognition: any): any {
    const newRecognition = new SpeechRecognition()
    newRecognition.lang = sourceRecognition.lang
    newRecognition.continuous = sourceRecognition.continuous
    newRecognition.interimResults = sourceRecognition.interimResults
    newRecognition.maxAlternatives = sourceRecognition.maxAlternatives
    newRecognition.onresult = sourceRecognition.onresult
    newRecognition.onerror = sourceRecognition.onerror
    newRecognition.onend = sourceRecognition.onend
    recognitionInstance = newRecognition
    newRecognition.start()
    return newRecognition
  }

  function startRecognition() {
    try {
      recognition.start()
      console.info('Web Speech API recognition started successfully')
      return true
    }
    catch (error: any) {
      // Common errors:
      // - "already started": Recognition is already running
      // - "not-allowed": Microphone permission denied
      // - "service-not-allowed": Service not available
      const errorMessage = error?.message || String(error)
      console.warn('Web Speech API recognition start failed:', errorMessage, error)

      if (errorMessage.includes('already') || errorMessage.includes('started')) {
        // Recognition is already running, this is OK
        console.info('Web Speech API recognition already running')
        return true
      }

      if (errorMessage.includes('not-allowed') || errorMessage.includes('permission')) {
        // Permission denied - user needs to grant microphone access
        const err = new Error('Microphone permission denied. Please grant microphone access and try again.')
        console.error('Web Speech API: Microphone permission denied')
        fullStreamCtrl?.error(err)
        textStreamCtrl?.error(err)
        deferredText.reject(err)
        deferredText.isRejected = true
        return false
      }

      // For other errors, try creating a new instance
      console.warn('Creating new recognition instance due to error')
      try {
        createAndStartNewRecognitionInstance(recognition)
        console.info('Web Speech API recognition restarted successfully with new instance')
        return true
      }
      catch (restartError: any) {
        const err = new Error(`Failed to start Web Speech API recognition: ${restartError?.message || String(restartError)}`)
        fullStreamCtrl?.error(err)
        textStreamCtrl?.error(err)
        deferredText.reject(err)
        deferredText.isRejected = true
        console.error('Web Speech API recognition failed to start after retry:', restartError)
        return false
      }
    }
  }

  // Add event listeners for debugging before starting
  recognition.onstart = () => {
    console.info('Web Speech API recognition started (onstart event)')
  }

  recognition.onaudiostart = () => {
    console.info('Web Speech API audio capture started')
  }

  recognition.onsoundstart = () => {
    console.info('Web Speech API sound detected')
  }

  recognition.onspeechstart = () => {
    console.info('Web Speech API speech detected')
  }

  recognition.onspeechend = () => {
    console.info('Web Speech API speech ended')
  }

  recognition.onsoundend = () => {
    console.info('Web Speech API sound ended')
  }

  recognition.onaudioend = () => {
    console.info('Web Speech API audio capture ended')
  }

  recognition.onnomatch = () => {
    console.info('Web Speech API: No speech match')
  }

  const started = startRecognition()
  if (!started) {
    // If immediate start failed, it might be a permission issue
    // Web Speech API will prompt for permission automatically, so we just log
    console.warn('Web Speech API recognition did not start immediately. This might be due to:')
    console.warn('1. Microphone permission not granted - browser should prompt automatically')
    console.warn('2. Recognition already running - this is normal if called multiple times')
    console.warn('3. Browser requires user gesture - ensure microphone was enabled by user action')

    // Don't retry immediately - wait for permission or user action
    // The recognition instance is already created, so it can be started later if needed
  }

  return {
    fullStream,
    text: deferredText.promise,
    textStream,
    recognition: recognitionInstance,
  }
}
