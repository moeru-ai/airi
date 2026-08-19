import type { WSContext, WSEvents } from 'hono/ws'

import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { createAudioTranscriptionWsHandlers } from './index'

interface MockClient {
  close: ReturnType<typeof vi.fn>
  context: WSContext
  sent: string[]
}

function createMockClient(): MockClient {
  const sent: string[] = []
  const close = vi.fn()
  const context = {
    send(data: string) {
      sent.push(data)
    },
    close,
    readyState: 1,
    binaryType: 'arraybuffer',
    raw: {},
    protocol: '',
    url: null,
  } as unknown as WSContext

  return { close, context, sent }
}

function createHandlers(): WSEvents {
  const setup = createAudioTranscriptionWsHandlers({
    configKV: { getOptional: vi.fn(async () => null) } as never,
    envelopeCrypto: {} as never,
    providerCatalogService: {} as never,
  })
  return setup('user-123')
}

function open(events: WSEvents, client: MockClient) {
  events.onOpen?.(new Event('open'), client.context)
}

function message(events: WSEvents, client: MockClient, data: string | Buffer) {
  events.onMessage?.(new MessageEvent('message', { data }), client.context)
}

describe('audio transcription WebSocket route', () => {
  it('rejects invalid control frames', () => {
    const events = createHandlers()
    const client = createMockClient()
    open(events, client)

    message(events, client, JSON.stringify({ event: 'start', model: 'auto', format: 'mp3', sample_rate: 16000 }))

    expect(client.sent.map(frame => JSON.parse(frame))).toEqual([{
      event: 'error',
      code: 'invalid_control_frame',
      message: 'The control frame is invalid.',
    }])
    expect(client.close).toHaveBeenCalledWith(1008, 'invalid_control_frame')
  })

  it('rejects audio before the upstream session is ready', () => {
    const events = createHandlers()
    const client = createMockClient()
    open(events, client)

    message(events, client, Buffer.from([1, 2]))

    expect(client.sent.map(frame => JSON.parse(frame))).toEqual([{
      event: 'error',
      code: 'invalid_audio_frame',
      message: 'The audio frame is not valid in the current state.',
    }])
    expect(client.close).toHaveBeenCalledWith(1008, 'invalid_audio_frame')
  })

  it('reports missing official ASR configuration after start', async () => {
    const events = createHandlers()
    const client = createMockClient()
    open(events, client)

    message(events, client, JSON.stringify({ event: 'start', model: 'auto', format: 'pcm', sample_rate: 16000 }))

    await expect.poll(() => client.sent.map(frame => JSON.parse(frame))).toEqual([{
      event: 'error',
      code: 'official_asr_not_configured',
      message: 'Official ASR is not configured.',
    }])
    expect(client.close).toHaveBeenCalledWith(1008, 'official_asr_not_configured')
  })
})
