import type { RawData } from 'ws'

import type { AliyunNlsCredentials } from './config'

import { createHmac, randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import { merge } from '@moeru/std'
import { ofetch } from 'ofetch'

interface AliyunNlsToken {
  token: string
  expiresAt: number
}

interface AliyunNlsStartPayload {
  format?: 'pcm' | 'wav' | 'opus' | 'speex' | 'amr' | 'mp3' | 'aac'
  sample_rate?: 8000 | 16000
  enable_intermediate_result?: boolean
  enable_punctuation_prediction?: boolean
  enable_inverse_text_normalization?: boolean
  enable_words?: boolean
  max_sentence_silence?: number
}

interface AliyunNlsServerEvent {
  header?: {
    name?: string
  }
  payload?: {
    result?: string
  }
}

/** Controls one upstream Aliyun NLS WebSocket task and its lifecycle. */
export interface AliyunNlsSession {
  /** Opens the upstream WebSocket and starts the Aliyun transcription task. */
  start: () => Promise<void>
  /** Sends one PCM chunk after Aliyun confirms that the task is ready. */
  sendAudio: (chunk: Uint8Array) => void
  /** Requests the final transcript once for the current task. */
  stop: () => void
  /** Closes the upstream task without waiting for a final transcript. */
  cancel: () => void
}

interface CreateAliyunNlsSessionOptions {
  credentials: AliyunNlsCredentials
  createToken?: (credentials: AliyunNlsCredentials) => Promise<AliyunNlsToken>
  sessionOptions?: AliyunNlsStartPayload
  websocketBaseURL?: string
  onStarted: () => void
  onTranscriptDelta: (delta: string) => void
  onTranscriptDone: () => void
  onFinished: () => void
  onError: (error: Error) => void
}

type SessionState = 'idle' | 'connecting' | 'ready' | 'stopping' | 'finished'

// A session follows idle -> connecting -> ready -> stopping -> finished.
// Cancellation and errors move any active state directly to finished.

const DEFAULT_SESSION_OPTIONS: AliyunNlsStartPayload = {
  format: 'pcm',
  sample_rate: 16000,
  enable_intermediate_result: true,
  enable_punctuation_prediction: true,
  enable_words: true,
}

function nlsMetaEndpointFromRegion(region: AliyunNlsCredentials['region']): URL {
  return new URL(`http://nls-meta.${region}.aliyuncs.com`)
}

function nlsWebSocketEndpointFromRegion(region: AliyunNlsCredentials['region']): URL {
  const websocketURL = new URL('/ws/v1', 'https://example.com')

  switch (region) {
    case 'cn-shanghai':
    case 'cn-beijing':
    case 'cn-shenzhen':
      websocketURL.protocol = 'wss:'
      websocketURL.hostname = `nls-gateway-${region}.aliyuncs.com`
      break
    case 'cn-shanghai-internal':
    case 'cn-beijing-internal':
    case 'cn-shenzhen-internal':
      websocketURL.protocol = 'wss:'
      websocketURL.hostname = `nls-gateway-${region}-internal.aliyuncs.com:80`
      break
  }

  return websocketURL
}

function canonicalizeQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')
}

function signStringToBase64(method: string, path: string, canonicalQuery: string, accessKeySecret: string): string {
  const stringToSign = `${method}&${encodeURIComponent(path)}&${encodeURIComponent(canonicalQuery)}`
  return createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64')
}

function aliyunTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
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
  const signature = encodeURIComponent(signStringToBase64('POST', '/', canonicalQuery, credentials.accessKeySecret))
  const endpoint = nlsMetaEndpointFromRegion(credentials.region).toString().replace(/\/$/, '')
  const response = await ofetch<{
    Token?: { ExpireTime?: number, Id?: string }
    Message?: string
  }>(`${endpoint}/?Signature=${signature}&${canonicalQuery}`, { method: 'POST' })

  if (typeof response.Token?.Id === 'string' && typeof response.Token?.ExpireTime === 'number')
    return { token: response.Token.Id, expiresAt: response.Token.ExpireTime * 1000 }

  throw new Error(`Aliyun NLS token request failed: ${response.Message || 'unknown error'}`)
}

function createClientEvent(credentials: AliyunNlsCredentials, name: 'StartTranscription' | 'StopTranscription', sessionId: string, payload?: AliyunNlsStartPayload) {
  return JSON.stringify({
    header: {
      appkey: credentials.appKey,
      message_id: randomUUID().replaceAll('-', ''),
      task_id: sessionId,
      namespace: 'SpeechTranscriber',
      name,
    },
    payload,
  })
}

/** Creates one connection-scoped Aliyun NLS transcription state machine. */
export function createAliyunNlsSession(options: CreateAliyunNlsSessionOptions): AliyunNlsSession {
  const sessionId = randomUUID().replaceAll('-', '')
  let state: SessionState = 'idle'
  let upstream: WebSocket | undefined

  function reportError(error: Error) {
    if (state === 'finished')
      return

    state = 'finished'
    options.onError(error)
    try {
      upstream?.close(1011, 'upstream_error')
    }
    catch {}
  }

  function handleMessage(data: RawData) {
    if (state === 'finished')
      return

    let event: AliyunNlsServerEvent
    try {
      event = JSON.parse(data.toString()) as AliyunNlsServerEvent
    }
    catch {
      reportError(new Error('Aliyun NLS returned an invalid JSON frame.'))
      return
    }

    switch (event.header?.name) {
      case 'TranscriptionStarted':
        if (state !== 'connecting') {
          reportError(new Error('Aliyun NLS started the task in an invalid state.'))
          return
        }
        state = 'ready'
        options.onStarted()
        break
      case 'SentenceEnd': {
        const delta = event.payload?.result ? `${event.payload.result}\n` : ''
        if (delta)
          options.onTranscriptDelta(delta)
        options.onTranscriptDone()
        break
      }
      case 'TranscriptionCompleted':
        state = 'finished'
        options.onFinished()
        upstream?.close(1000, 'completed')
        break
    }
  }

  return {
    async start() {
      if (state !== 'idle')
        throw new Error('Aliyun NLS session already started.')

      state = 'connecting'
      try {
        const createToken = options.createToken ?? createAliyunNlsToken
        const token = await createToken(options.credentials)
        if (state !== 'connecting')
          return
        const upstreamURL = new URL(options.websocketBaseURL ?? nlsWebSocketEndpointFromRegion(options.credentials.region))
        upstreamURL.searchParams.set('token', token.token)
        upstream = new WebSocket(upstreamURL)
      }
      catch (error) {
        state = 'finished'
        throw error
      }

      upstream.on('open', () => {
        upstream?.send(createClientEvent(
          options.credentials,
          'StartTranscription',
          sessionId,
          merge(DEFAULT_SESSION_OPTIONS, options.sessionOptions),
        ))
      })
      upstream.on('message', handleMessage)
      upstream.on('error', error => reportError(error))
      upstream.on('close', (code, reason) => {
        if (state === 'finished')
          return
        reportError(new Error(`Aliyun NLS closed before completion: ${code} ${reason.toString()}`.trim()))
      })
    },
    sendAudio(chunk) {
      if (state !== 'ready' || !upstream)
        throw new Error('Aliyun NLS is not ready for audio.')
      upstream.send(chunk, { binary: true })
    },
    stop() {
      if (state === 'stopping' || state === 'finished')
        return
      if (state !== 'ready' || !upstream)
        throw new Error('Aliyun NLS is not ready to stop.')

      state = 'stopping'
      upstream.send(createClientEvent(options.credentials, 'StopTranscription', sessionId))
    },
    cancel() {
      if (state === 'finished')
        return
      state = 'finished'
      try {
        upstream?.close(1000, 'cancelled')
      }
      catch {}
    },
  }
}
