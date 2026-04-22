import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { RawData } from 'ws'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

import { WebSocket as UpstreamWebSocket, WebSocketServer } from 'ws'

import {
  buildDoubaoRealtimeFrame,
  decodeDoubaoRealtimeTextPayload,
  DOUBAO_REALTIME_EVENT_FLAG,
  DoubaoRealtimeCompressionMethod,
  DoubaoRealtimeMessageType,
  DoubaoRealtimeSerializationMethod,
  parseDoubaoRealtimeFrame,
} from './doubao-realtime-protocol'

export const DOUBAO_REALTIME_ASR_PROXY_PATH = '/api/peptutor/doubao-realtime-asr'
const DOUBAO_REALTIME_WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
const DOUBAO_REALTIME_RESOURCE_ID = 'volc.speech.dialog'
const DOUBAO_REALTIME_APP_KEY = 'PlgvMymc7f3tQnJ6'
const DOUBAO_REALTIME_DEFAULT_MODEL = '1.2.1.1'

interface BrowserStartMessage {
  type: 'start'
  apiKey?: string
  appId?: string
  model?: string
  appKey?: string
  resourceId?: string
  asr?: {
    audio_info?: {
      format?: string
      sample_rate?: number
      channel?: number
    }
    extra?: Record<string, unknown>
  }
  dialog?: {
    extra?: Record<string, unknown>
  }
}

interface BrowserEndMessage {
  type: 'end_asr'
}

interface BrowserClientMessageByType {
  start: BrowserStartMessage
  end_asr: BrowserEndMessage
}

type BrowserClientMessage = BrowserClientMessageByType[keyof BrowserClientMessageByType]

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function readJSONMessage(data: RawData): BrowserClientMessage | null {
  try {
    if (typeof data === 'string')
      return JSON.parse(data) as BrowserClientMessage

    if (data instanceof ArrayBuffer)
      return JSON.parse(Buffer.from(data).toString('utf8')) as BrowserClientMessage

    if (Array.isArray(data))
      return JSON.parse(Buffer.concat(data.map(item => Buffer.from(item))).toString('utf8')) as BrowserClientMessage

    if (Buffer.isBuffer(data))
      return JSON.parse(data.toString('utf8')) as BrowserClientMessage
  }
  catch {
    return null
  }

  return null
}

function rawDataToUint8Array(data: RawData) {
  if (data instanceof ArrayBuffer)
    return new Uint8Array(data)

  if (Array.isArray(data))
    return new Uint8Array(Buffer.concat(data.map(item => Buffer.from(item))))

  if (Buffer.isBuffer(data))
    return new Uint8Array(data)

  return new Uint8Array(0)
}

function decodeFramePayload(frame: ReturnType<typeof parseDoubaoRealtimeFrame>) {
  if (frame.compression === DoubaoRealtimeCompressionMethod.Gzip)
    return decodeDoubaoRealtimeTextPayload(gunzipSync(frame.payload))

  return decodeDoubaoRealtimeTextPayload(frame.payload)
}

function upstreamHeaders(message: BrowserStartMessage, env: Record<string, string | undefined>) {
  const appId = message.appId
    || env.VITE_PEPTUTOR_ASR_APP_ID
    || env.VITE_DOUBAO_ASR_APP_ID
    || env.VITE_DOUBAO_TTS_APP_ID
    || env.VITE_PEPTUTOR_TTS_APP_ID
    || ''
  const accessKey = message.apiKey
    || env.VITE_PEPTUTOR_ASR_API_KEY
    || env.VITE_DOUBAO_ASR_API_KEY
    || env.VITE_DOUBAO_TTS_API_KEY
    || env.VITE_PEPTUTOR_TTS_API_KEY
    || ''
  const resourceId = message.resourceId || DOUBAO_REALTIME_RESOURCE_ID
  const appKey = message.appKey || DOUBAO_REALTIME_APP_KEY

  if (!appId || !accessKey)
    throw new Error('Doubao realtime ASR proxy is missing appId or apiKey.')

  return {
    appId,
    accessKey,
    resourceId,
    appKey,
  }
}

function startSessionPayload(message: BrowserStartMessage) {
  return JSON.stringify({
    asr: {
      audio_info: {
        format: message.asr?.audio_info?.format || 'pcm',
        sample_rate: message.asr?.audio_info?.sample_rate || 16000,
        channel: message.asr?.audio_info?.channel || 1,
      },
      extra: message.asr?.extra || {},
    },
    dialog: {
      extra: {
        input_mod: 'push_to_talk',
        model: message.dialog?.extra?.model || message.model || DOUBAO_REALTIME_DEFAULT_MODEL,
        ...message.dialog?.extra,
      },
    },
  })
}

function sendJSON(socket: { send: (data: string) => void }, payload: Record<string, unknown>) {
  socket.send(JSON.stringify(payload))
}

function isUpgradeForPath(request: IncomingMessage, path: string) {
  const url = request.url ? new URL(request.url, 'http://127.0.0.1') : null
  return url?.pathname === path
}

function createProxyWSServer(env: Record<string, string | undefined>) {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (client: UpstreamWebSocket) => {
    let upstream: UpstreamWebSocket | undefined
    let sessionId: string | undefined
    let closing = false
    let sessionStarted = false

    async function closeUpstream() {
      if (!upstream || closing)
        return
      closing = true

      try {
        if (upstream.readyState === UpstreamWebSocket.OPEN && sessionId) {
          upstream.send(buildDoubaoRealtimeFrame({
            messageType: DoubaoRealtimeMessageType.FullClientRequest,
            messageFlags: DOUBAO_REALTIME_EVENT_FLAG,
            serialization: DoubaoRealtimeSerializationMethod.JSON,
            event: 102,
            sessionId,
            payload: '{}',
          }))
          upstream.send(buildDoubaoRealtimeFrame({
            messageType: DoubaoRealtimeMessageType.FullClientRequest,
            messageFlags: DOUBAO_REALTIME_EVENT_FLAG,
            serialization: DoubaoRealtimeSerializationMethod.JSON,
            event: 2,
            payload: '{}',
          }))
        }
      }
      catch {
      }
      finally {
        upstream?.close()
        upstream = undefined
      }
    }

    client.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        if (!upstream || upstream.readyState !== UpstreamWebSocket.OPEN || !sessionId || !sessionStarted)
          return

        upstream.send(buildDoubaoRealtimeFrame({
          messageType: DoubaoRealtimeMessageType.AudioOnlyRequest,
          messageFlags: DOUBAO_REALTIME_EVENT_FLAG,
          serialization: DoubaoRealtimeSerializationMethod.Raw,
          event: 200,
          sessionId,
          payload: rawDataToUint8Array(data),
        }))
        return
      }

      const message = readJSONMessage(data)
      if (!message) {
        sendJSON(client, {
          type: 'error',
          error: 'Malformed ASR control frame.',
        })
        return
      }

      if (message.type === 'end_asr') {
        if (!upstream || upstream.readyState !== UpstreamWebSocket.OPEN || !sessionId || !sessionStarted)
          return

        upstream.send(buildDoubaoRealtimeFrame({
          messageType: DoubaoRealtimeMessageType.FullClientRequest,
          messageFlags: DOUBAO_REALTIME_EVENT_FLAG,
          serialization: DoubaoRealtimeSerializationMethod.JSON,
          event: 400,
          sessionId,
          payload: '{}',
        }))
        return
      }

      if (message.type !== 'start' || upstream)
        return

      try {
        const headers = upstreamHeaders(message, env)
        sessionId = randomUUID()
        const connectId = randomUUID()
        upstream = new UpstreamWebSocket(DOUBAO_REALTIME_WS_URL, {
          headers: {
            'X-Api-App-ID': headers.appId,
            'X-Api-Access-Key': headers.accessKey,
            'X-Api-Resource-Id': headers.resourceId,
            'X-Api-App-Key': headers.appKey,
            'X-Api-Connect-Id': connectId,
          },
        })

        upstream.binaryType = 'arraybuffer'

        upstream.on('open', () => {
          upstream?.send(buildDoubaoRealtimeFrame({
            messageType: DoubaoRealtimeMessageType.FullClientRequest,
            messageFlags: DOUBAO_REALTIME_EVENT_FLAG,
            serialization: DoubaoRealtimeSerializationMethod.JSON,
            event: 1,
            payload: '{}',
          }))

          upstream?.send(buildDoubaoRealtimeFrame({
            messageType: DoubaoRealtimeMessageType.FullClientRequest,
            messageFlags: DOUBAO_REALTIME_EVENT_FLAG,
            serialization: DoubaoRealtimeSerializationMethod.JSON,
            event: 100,
            sessionId,
            payload: startSessionPayload(message),
          }))
        })

        upstream.on('message', (upstreamData: RawData, upstreamBinary: boolean) => {
          if (!upstreamBinary)
            return

          try {
            const frame = parseDoubaoRealtimeFrame(rawDataToUint8Array(upstreamData))

            if (frame.messageType === DoubaoRealtimeMessageType.AudioOnlyResponse)
              return

            const payloadText = decodeFramePayload(frame)
            const payload = payloadText ? JSON.parse(payloadText) as Record<string, unknown> : {}

            switch (frame.event) {
              case 50:
                sendJSON(client, { type: 'connection-started' })
                break
              case 150:
                sessionStarted = true
                sendJSON(client, { type: 'ready', sessionId, dialogId: payload.dialog_id })
                break
              case 450:
                sendJSON(client, {
                  type: 'asr-info',
                  questionId: payload.question_id,
                  payload,
                })
                break
              case 451:
                sendJSON(client, {
                  type: 'asr-response',
                  results: payload.results || [],
                  payload,
                })
                break
              case 459:
                sendJSON(client, { type: 'asr-ended' })
                break
              case 51:
              case 153:
              case 599:
                sendJSON(client, {
                  type: 'error',
                  error: (payload.message || payload.error || 'Doubao realtime ASR session failed') as string,
                  statusCode: payload.status_code || frame.errorCode,
                })
                break
              default:
                break
            }
          }
          catch (error) {
            sendJSON(client, {
              type: 'error',
              error: errorMessage(error),
            })
          }
        })

        upstream.on('error', (error: Error) => {
          sendJSON(client, {
            type: 'error',
            error: errorMessage(error),
          })
        })

        upstream.on('close', () => {
          if (client.readyState === UpstreamWebSocket.OPEN)
            client.close()
        })
      }
      catch (error) {
        sendJSON(client, {
          type: 'error',
          error: errorMessage(error),
        })
      }
    })

    client.on('close', () => {
      void closeUpstream()
    })

    client.on('error', () => {
      void closeUpstream()
    })
  })

  return wss
}

function attachProxyServer(httpServer: ViteDevServer['httpServer'] | PreviewServer['httpServer'], env: Record<string, string | undefined>) {
  if (!httpServer)
    return

  const wss = createProxyWSServer(env)
  const upgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isUpgradeForPath(request, DOUBAO_REALTIME_ASR_PROXY_PATH))
      return

    wss.handleUpgrade(request, socket, head, (client: UpstreamWebSocket) => {
      wss.emit('connection', client, request)
    })
  }

  httpServer.on('upgrade', upgradeHandler)
  httpServer.once('close', () => {
    httpServer.off('upgrade', upgradeHandler)
    wss.close()
  })
}

export function serveDoubaoRealtimeAsrProxy(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'peptutor-doubao-realtime-asr-proxy',
    configureServer(server) {
      attachProxyServer(server.httpServer, env)
    },
    configurePreviewServer(server) {
      attachProxyServer(server.httpServer, env)
    },
  }
}
