import type { RawData } from 'ws'

import type { AliyunNlsCredentials } from './config'

import { createHmac, randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import { merge } from '@moeru/std'
import { ofetch } from 'ofetch'
import { literal, number, object, optional, safeParse, string, union } from 'valibot'

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

const AliyunNlsServerEventSchema = union([
  object({ header: object({ name: literal('TranscriptionStarted') }) }),
  object({ header: object({ name: literal('SentenceBegin') }) }),
  object({ header: object({ name: literal('TranscriptionResultChanged') }), payload: object({ result: string(), time: optional(number()) }) }),
  object({ header: object({ name: literal('SentenceEnd') }), payload: object({ result: string(), time: optional(number()) }) }),
  object({ header: object({ name: literal('TaskFailed') }) }),
  object({ header: object({ name: literal('TranscriptionCompleted') }) }),
])

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
  /** Maximum time to obtain a token and receive TranscriptionStarted. @default 15000 */
  startupTimeoutMs?: number
  onStarted: () => void
  onTranscriptSnapshot: (text: string, isFinal: boolean, durationMilliseconds: number) => void
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
  const publicRegion = region.replace(/-internal$/, '')
  return new URL(`https://nls-meta.${publicRegion}.aliyuncs.com`)
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
      websocketURL.protocol = 'ws:'
      websocketURL.hostname = `nls-gateway-${region}.aliyuncs.com`
      websocketURL.port = '80'
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
    RegionId: credentials.region.replace(/-internal$/, ''),
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
  }>(`${endpoint}/?Signature=${signature}&${canonicalQuery}`, { method: 'POST', timeout: 10000 })

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
  let committedText = ''
  let startupTimer: ReturnType<typeof setTimeout> | undefined

  function clearStartupTimer() {
    if (startupTimer)
      clearTimeout(startupTimer)
    startupTimer = undefined
  }

  function reportError(error: Error) {
    if (state === 'finished')
      return

    state = 'finished'
    clearStartupTimer()
    options.onError(error)
    try {
      upstream?.close(1011, 'upstream_error')
    }
    catch {}
  }

  function handleMessage(data: RawData) {
    if (state === 'finished')
      return

    let parsed: unknown
    try {
      parsed = JSON.parse(data.toString())
    }
    catch {
      reportError(new Error('Aliyun NLS returned an invalid JSON frame.'))
      return
    }

    const result = safeParse(AliyunNlsServerEventSchema, parsed)
    if (!result.success) {
      reportError(new Error('Aliyun NLS returned an invalid frame.'))
      return
    }
    const event = result.output

    switch (event.header?.name) {
      case 'TranscriptionStarted':
        if (state !== 'connecting') {
          reportError(new Error('Aliyun NLS started the task in an invalid state.'))
          return
        }
        state = 'ready'
        clearStartupTimer()
        options.onStarted()
        break
      case 'SentenceBegin':
        break
      case 'TranscriptionResultChanged':
        if (!('payload' in event)) {
          reportError(new Error('Aliyun NLS returned an invalid frame.'))
          return
        }
        if (state === 'ready' || state === 'stopping')
          options.onTranscriptSnapshot(committedText + event.payload.result, false, event.payload.time ?? 0)
        break
      case 'SentenceEnd': {
        if (!('payload' in event)) {
          reportError(new Error('Aliyun NLS returned an invalid frame.'))
          return
        }
        const delta = event.payload.result ? `${event.payload.result}\n` : ''
        if (delta) {
          committedText += delta
          options.onTranscriptSnapshot(committedText, true, event.payload.time ?? 0)
        }
        options.onTranscriptDone()
        break
      }
      case 'TaskFailed':
        reportError(new Error('Aliyun NLS transcription task failed.'))
        break
      case 'TranscriptionCompleted':
        state = 'finished'
        clearStartupTimer()
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
      startupTimer = setTimeout(() => reportError(new Error('Aliyun NLS did not start in time.')), options.startupTimeoutMs ?? 15000)
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
        clearStartupTimer()
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
      clearStartupTimer()
      try {
        upstream?.close(1000, 'cancelled')
      }
      catch {}
    },
  }
}
