import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

/**
 * Installs passive browser probes before the application starts.
 *
 * Triggering workflow:
 *
 * `BrowserContext.addInitScript`
 *   -> {@link stubForBrowser}
 *     -> `window.fetch`
 *     -> `BroadcastChannel('io-tracer-channel')`
 *
 * Upstream:
 * - `BrowserContext.addInitScript`
 *
 * Downstream:
 * - `window.__airiAudioInputE2E`
 */
export function stubForBrowser() {
  const state: BrowserAudioInputState = { spans: [], streamingTranscriptionReady: false, streamingTranscriptionUpdates: [], transcriptionAudio: [], transcriptionResults: [], vadReady: false }
  window.__airiAudioInputE2E = state

  const originalConsoleInfo = console.info.bind(console)
  console.info = (...values: unknown[]) => {
    if (typeof values[0] === 'string' && values[0].startsWith('[Voice Input] vad-ready:'))
      state.vadReady = true
    originalConsoleInfo(...values)
  }

  const originalFetch = window.fetch.bind(window)

  /**
   * Copies each ASR upload and response while it forwards the request.
   *
   * Triggering workflow:
   *
   * `window.fetch`
   *   -> `POST /audio/transcriptions`
   *     -> captureFetch
   *
   * Upstream:
   * - The OpenAI-compatible transcription Provider.
   *
   * Downstream:
   * - `window.__airiAudioInputE2E`
   * - The original `window.fetch` function.
   */
  const captureFetch: typeof window.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

    const capturesTranscription = new URL(requestUrl, window.location.href).pathname.endsWith('/audio/transcriptions')
    if (capturesTranscription && init?.body instanceof FormData) {
      const file = init.body.get('file')
      if (file instanceof Blob) {
        state.transcriptionAudio.push({
          base64: new Uint8Array(await file.arrayBuffer()).toBase64(),
          format: 'wav',
        })
      }
    }

    const response = await originalFetch(input, init)
    if (capturesTranscription && response.ok) {
      const payload = await response.clone().json() as { text?: unknown }
      if (typeof payload.text === 'string')
        state.transcriptionResults.push(payload.text)
    }

    return response
  }

  window.fetch = captureFetch

  const OriginalWebSocket = window.WebSocket
  const audioChunksBySocket = new WeakMap<WebSocket, Uint8Array[]>()
  const capturesAliyunNlsBySocket = new WeakMap<WebSocket, boolean>()
  const capturedSockets = new WeakSet<WebSocket>()

  function capturePcmAudio(socket: WebSocket) {
    const audioChunks = audioChunksBySocket.get(socket)
    if (!audioChunks || capturedSockets.has(socket) || !audioChunks.length)
      return

    const byteLength = audioChunks.reduce((total, chunk) => total + chunk.byteLength, 0)
    if (byteLength < 8192)
      return

    capturedSockets.add(socket)
    const audio = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of audioChunks) {
      audio.set(chunk, offset)
      offset += chunk.byteLength
    }
    state.transcriptionAudio.push({ base64: audio.toBase64(), format: 'pcm' })
  }

  class CaptureAliyunNlsWebSocket extends OriginalWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      const target = new URL(url.toString(), window.location.href)
      const capturesAliyunNls = target.hostname.startsWith('nls-gateway-') && target.hostname.endsWith('.aliyuncs.com')
      capturesAliyunNlsBySocket.set(this, capturesAliyunNls)

      if (capturesAliyunNls) {
        audioChunksBySocket.set(this, [])
        this.addEventListener('open', () => {
          state.streamingTranscriptionReady = true
        })
        this.addEventListener('message', (event) => {
          if (typeof event.data !== 'string')
            return

          try {
            const payload = JSON.parse(event.data) as { header?: { name?: string }, payload?: { result?: unknown } }
            if (payload.header?.name === 'SentenceEnd' && typeof payload.payload?.result === 'string')
              state.transcriptionResults.push(payload.payload.result)
          }
          catch {
            // NLS can send non-transcription frames. The Provider handles those frames.
          }
        })
      }
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      const audioChunks = audioChunksBySocket.get(this)
      if (capturesAliyunNlsBySocket.get(this) && audioChunks && typeof data !== 'string') {
        if (data instanceof Blob) {
          void data.arrayBuffer().then((buffer) => {
            audioChunks.push(new Uint8Array(buffer))
          })
        }
        else if (ArrayBuffer.isView(data)) {
          audioChunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
        }
        else {
          audioChunks.push(new Uint8Array(data))
        }
        capturePcmAudio(this)
      }

      let outboundData: string | Blob | BufferSource
      if (typeof data === 'string' || data instanceof Blob || data instanceof ArrayBuffer) {
        outboundData = data
      }
      else if (ArrayBuffer.isView(data)) {
        // WebSocket does not accept views backed by SharedArrayBuffer. The copy uses a regular ArrayBuffer.
        outboundData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
      }
      else {
        // ArrayBufferLike also includes SharedArrayBuffer. The copy keeps the original bytes in a supported buffer.
        outboundData = new Uint8Array(data).slice()
      }

      super.send(outboundData)
    }

    close(code?: number, reason?: string): void {
      const audioChunks = audioChunksBySocket.get(this)
      if (capturesAliyunNlsBySocket.get(this) && audioChunks && !capturedSockets.has(this) && audioChunks.length) {
        capturePcmAudio(this)
      }

      super.close(code, reason)
    }
  }

  window.WebSocket = CaptureAliyunNlsWebSocket

  const channel = new BroadcastChannel('io-tracer-channel')

  /**
   * Stores completed I/O spans for the case artifact.
   *
   * Triggering workflow:
   *
   * `BroadcastChannel('io-tracer-channel')`
   *   -> `message`
   *     -> captureSpan
   *
   * Upstream:
   * - The AIRI I/O trace exporter.
   *
   * Downstream:
   * - `window.__airiAudioInputE2E.spans`
   */
  const captureSpan = (event: MessageEvent) => {
    if (event.data?.type === 'span' && event.data.span?.ended)
      state.spans.push(event.data.span as SerializedIOSpan)
  }

  channel.addEventListener('message', captureSpan)
}

/** Returns the completed browser spans that match the optional span name. */
export function readCompletedSpans(name?: string) {
  const spans = window.__airiAudioInputE2E?.spans ?? []
  return name ? spans.filter(span => span.name === name) : spans
}
