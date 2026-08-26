import { createHmac, randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import { merge } from '@moeru/std'
import { ofetch } from 'ofetch'

interface AliyunNlsCredentials {
  accessKeyId: string
  accessKeySecret: string
  appKey: string
  region: AliyunNlsRegion
}

type AliyunNlsRegion = 'cn-beijing' | 'cn-beijing-internal' | 'cn-shanghai' | 'cn-shanghai-internal' | 'cn-shenzhen' | 'cn-shenzhen-internal'

interface AliyunNlsServerEvent {
  header?: {
    name?: string
  }
  payload?: {
    result?: string
  }
}

interface AliyunNlsStartPayload {
  enable_intermediate_result?: boolean
  enable_inverse_text_normalization?: boolean
  enable_punctuation_prediction?: boolean
  enable_words?: boolean
  format?: 'aac' | 'amr' | 'mp3' | 'opus' | 'pcm' | 'speex' | 'wav'
  max_sentence_silence?: number
  sample_rate?: 8000 | 16000
}

interface AliyunNlsToken {
  expiresAt: number
  token: string
}

interface CreateAliyunNlsStreamResponseOptions {
  audioStream: ReadableStream<Uint8Array>
  createToken?: (credentials: AliyunNlsCredentials) => Promise<AliyunNlsToken>
  credentials: AliyunNlsCredentials
  sessionOptions?: AliyunNlsStartPayload
  websocketBaseURL?: string
}

const encoder = new TextEncoder()
const DEFAULT_SESSION_OPTIONS: AliyunNlsStartPayload = {
  enable_intermediate_result: true,
  enable_punctuation_prediction: true,
  enable_words: true,
  format: 'pcm',
  sample_rate: 16000,
}

/**
 * Streams client microphone PCM through Aliyun NLS and returns xsai-compatible SSE transcript deltas.
 *
 * Use when:
 * - AIRI owns the Aliyun NLS credentials server-side.
 * - The browser uploads a realtime audio `ReadableStream` and expects transcript deltas.
 *
 * Expects:
 * - `audioStream` contains 16 kHz PCM chunks by default, matching the Hearing worklet output.
 *
 * Returns:
 * - A `text/event-stream` response consumable by the shared `streamTranscription` adapter.
 */
export function createAliyunNlsStreamResponse(options: CreateAliyunNlsStreamResponseOptions): Response {
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      // The upstream websocket is closed by its own completion/error handlers.
    },
    async start(controller) {
      const createToken = options.createToken ?? createAliyunNlsToken
      const token = await createToken(options.credentials)
      const sessionId = randomUUID().replaceAll('-', '')
      const upstreamURL = new URL(options.websocketBaseURL ?? nlsWebSocketEndpointFromRegion(options.credentials.region))
      upstreamURL.searchParams.set('token', token.token)

      const ws = new WebSocket(upstreamURL)

      ws.on('open', () => {
        ws.send(createClientEvent(options.credentials, 'StartTranscription', sessionId, merge(DEFAULT_SESSION_OPTIONS, options.sessionOptions)))
      })

      ws.on('message', (data) => {
        const event = JSON.parse(data.toString()) as AliyunNlsServerEvent
        switch (event.header?.name) {
          case 'SentenceEnd': {
            const text = event.payload?.result ? `${event.payload.result}\n` : ''
            if (text)
              controller.enqueue(sse({ delta: text, type: 'transcript.text.delta' }))
            controller.enqueue(sse({ delta: '', type: 'transcript.text.done' }))
            break
          }
          case 'TranscriptionCompleted':
            controller.close()
            ws.close(1000, 'completed')
            break
          case 'TranscriptionStarted':
            void writeAudioToUpstream(options.audioStream, ws, options.credentials, sessionId)
            break
        }
      })

      ws.on('error', (error) => {
        controller.error(error)
      })

      ws.on('close', () => {
        try {
          controller.close()
        }
        catch {}
      })
    },
  })

  return new Response(body, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    },
  })
}

function aliyunTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function canonicalizeQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')
}

async function createAliyunNlsToken(credentials: AliyunNlsCredentials): Promise<AliyunNlsToken> {
  const params: Record<string, string> = {
    AccessKeyId: credentials.accessKeyId,
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: credentials.region,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: aliyunTimestamp(new Date()),
    Version: '2019-02-28',
  }
  const canonicalQuery = canonicalizeQuery(params)
  const signature = encodeURIComponent(signStringToBase64(createStringToSign('POST', '/', canonicalQuery), credentials.accessKeySecret))
  const endpoint = nlsMetaEndpointFromRegion(credentials.region).toString().replace(/\/$/, '')
  const response = await ofetch<{
    Message?: string
    Token?: { ExpireTime?: number, Id?: string }
  }>(`${endpoint}/?Signature=${signature}&${canonicalQuery}`, { method: 'POST' })

  if (typeof response.Token?.Id === 'string' && typeof response.Token?.ExpireTime === 'number')
    return { expiresAt: response.Token.ExpireTime * 1000, token: response.Token.Id }

  throw new Error(`Failed to create Aliyun NLS token: ${response.Message || 'unknown error'}`)
}

function createClientEvent(credentials: AliyunNlsCredentials, name: 'StartTranscription' | 'StopTranscription', sessionId: string, payload?: AliyunNlsStartPayload) {
  return JSON.stringify({
    header: {
      appkey: credentials.appKey,
      message_id: randomUUID().replaceAll('-', ''),
      name,
      namespace: 'SpeechTranscriber',
      task_id: sessionId,
    },
    payload,
  })
}

function createStringToSign(method: string, path: string, canonicalQuery: string): string {
  return `${method}&${encodeURIComponent(path)}&${encodeURIComponent(canonicalQuery)}`
}

function nlsMetaEndpointFromRegion(region: AliyunNlsRegion): URL {
  return new URL(`http://nls-meta.${region}.aliyuncs.com`)
}

function nlsWebSocketEndpointFromRegion(region: AliyunNlsRegion): URL {
  const websocketURL = new URL('/ws/v1', 'https://example.com')

  switch (region) {
    case 'cn-beijing':
    case 'cn-shanghai':
    case 'cn-shenzhen':
      websocketURL.protocol = 'wss:'
      websocketURL.hostname = `nls-gateway-${region}.aliyuncs.com`
      break
    case 'cn-beijing-internal':
    case 'cn-shanghai-internal':
    case 'cn-shenzhen-internal':
      websocketURL.protocol = 'wss:'
      websocketURL.hostname = `nls-gateway-${region}-internal.aliyuncs.com:80`
      break
  }

  return websocketURL
}

function signStringToBase64(stringToSign: string, accessKeySecret: string): string {
  return createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64')
}

function sse(payload: { delta: string, type: 'transcript.text.delta' | 'transcript.text.done' }): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

async function writeAudioToUpstream(audioStream: ReadableStream<Uint8Array>, ws: WebSocket, credentials: AliyunNlsCredentials, sessionId: string) {
  const reader = audioStream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (value)
        ws.send(value, { binary: true })
    }
  }
  finally {
    ws.send(createClientEvent(credentials, 'StopTranscription', sessionId))
  }
}
