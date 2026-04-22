import { afterEach, describe, expect, it, vi } from 'vitest'

import { streamDoubaoRealtimeTranscription } from './stream-transcription'

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: MockWebSocket[] = []

  readonly url: string | URL
  readonly sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = []
  binaryType: BinaryType = 'blob'
  readyState = MockWebSocket.CONNECTING
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null

  constructor(url: string | URL) {
    this.url = url
    MockWebSocket.instances.push(this)

    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.call(this as unknown as WebSocket, new Event('open'))
    })
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(data)

    if (typeof data !== 'string') {
      return
    }

    const payload = JSON.parse(data) as { type?: string }
    if (payload.type === 'start') {
      queueMicrotask(() => {
        this.onmessage?.call(this as unknown as WebSocket, {
          data: JSON.stringify({ type: 'ready' }),
        } as MessageEvent)
      })
      return
    }

    if (payload.type === 'end_asr') {
      queueMicrotask(() => {
        this.onmessage?.call(this as unknown as WebSocket, {
          data: JSON.stringify({ type: 'asr-ended' }),
        } as MessageEvent)
      })
    }
  }

  close(code = 1000, reason = '') {
    if (this.readyState >= MockWebSocket.CLOSING) {
      return
    }

    this.readyState = MockWebSocket.CLOSING
    queueMicrotask(() => {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.call(this as unknown as WebSocket, {
        code,
        reason,
      } as CloseEvent)
    })
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true
  }
}

describe('doubao realtime transcription', () => {
  afterEach(() => {
    MockWebSocket.instances = []
    vi.unstubAllGlobals()
  })

  it('appends lesson backend auth onto the websocket proxy url', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)

    const result = streamDoubaoRealtimeTranscription({
      baseURL: 'https://lesson.example.test/api/peptutor/doubao-realtime-asr',
      apiKey: 'doubao-token',
      appId: 'doubao-app-id',
      proxyAuth: {
        accessToken: 'lesson-jwt',
        apiKey: 'lesson-api-key',
      },
      inputAudioStream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      }),
    })

    await expect(result.text).resolves.toBe('')
    expect(String(MockWebSocket.instances[0]?.url)).toBe(
      'wss://lesson.example.test/api/peptutor/doubao-realtime-asr?access_token=lesson-jwt',
    )
  })
})
