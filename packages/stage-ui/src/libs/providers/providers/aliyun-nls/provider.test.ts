import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAliyunNLSProvider } from './provider'

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static readonly instances: FakeWebSocket[] = []

  binaryType: BinaryType = 'blob'
  onclose: ((event: { code: number, reason: string }) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = FakeWebSocket.CONNECTING
  sent: unknown[] = []

  constructor(readonly url: string | URL) {
    super()
    FakeWebSocket.instances.push(this)
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  receive(payload: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }))
  }

  send(data: unknown) {
    this.sent.push(data)
  }
}

afterEach(() => {
  FakeWebSocket.instances.length = 0
  vi.unstubAllGlobals()
})

describe('aliyun NLS provider', () => {
  it('forwards interim corrections and the final sentence as transcript snapshots', async () => {
    // ROOT CAUSE:
    //
    // Aliyun emits each volatile hypothesis as `TranscriptionResultChanged`.
    // The provider ignored these events and emitted only the final sentence.
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        NlsRequestId: 'nls-request',
        RequestId: 'request',
        ErrMsg: '',
        Token: {
          ExpireTime: Math.floor(Date.now() / 1000) + 3600,
          Id: 'token',
          UserId: 'user',
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )))

    const inputAudioStream = new ReadableStream<ArrayBuffer>()
    const provider = createAliyunNLSProvider('access-key-id', 'access-key-secret', 'app-key')
    const speech = provider.speech('aliyun-nls-v1', { inputAudioStream })
    if (!speech.fetch)
      throw new Error('The Aliyun provider did not create its streaming transport.')

    const response = await speech.fetch(new URL('https://example.invalid/transcription'), {})
    const responseText = response.text()

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const socket = FakeWebSocket.instances[0]
    if (!socket)
      throw new Error('The Aliyun provider did not open its streaming socket.')
    socket.open()
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))
    const startEvent = JSON.parse(socket.sent[0] as string)
    expect(startEvent.payload.enable_intermediate_result).toBe(true)

    socket.receive(serverEvent('SentenceBegin', { index: 1, time: 200 }))
    socket.receive(serverEvent('TranscriptionResultChanged', {
      index: 1,
      result: '今天天气很号',
      status: 20000000,
      time: 1000,
    }))
    socket.receive(serverEvent('TranscriptionResultChanged', {
      index: 1,
      result: '今天天气很好',
      status: 20000000,
      time: 1200,
    }))
    socket.receive(serverEvent('SentenceEnd', {
      begin_time: 200,
      confidence: 0.95,
      index: 1,
      result: '今天天气很好',
      stash_result: {
        beginTime: 0,
        currentTime: 1200,
        sentenceId: 2,
        text: '',
      },
      status: 20000000,
      time: 1200,
    }))
    socket.receive(serverEvent('TranscriptionCompleted', undefined))

    await expect(responseText).resolves.toContain('"type":"transcript.text.snapshot","text":"今天天气很号","isFinal":false')
    await expect(responseText).resolves.toContain('"type":"transcript.text.snapshot","text":"今天天气很好","isFinal":true')
  })
})

function serverEvent(name: string, payload: unknown) {
  return {
    header: {
      appkey: 'app-key',
      message_id: 'message-id',
      name,
      namespace: 'SpeechTranscriber',
      status: 20000000,
      status_message: 'SUCCESS',
      task_id: 'task-id',
    },
    payload,
  }
}
