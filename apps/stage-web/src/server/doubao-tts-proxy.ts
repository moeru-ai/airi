import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const DOUBAO_TTS_PROXY_PATH = '/api/peptutor/doubao-tts'
const DOUBAO_TTS_HTTP_URL = 'https://openspeech.bytedance.com/api/v1/tts'
const DOUBAO_TTS_DEFAULT_CLUSTER = 'volcano_tts'
const DOUBAO_TTS_DEFAULT_ENCODING = 'mp3'
const REPO_ENV_PATH = resolve(import.meta.dirname, '../../../../../../.env')

interface DoubaoTtsProxyRequest {
  input?: string
  voice?: string
  model?: string
  appId?: string
  apiKey?: string
  cluster?: string
  user?: {
    uid?: string
  }
  audio?: {
    encoding?: string
    speed_ratio?: number
    volume_ratio?: number
    pitch_ratio?: number
  }
}

interface DoubaoTtsSuccessResponse {
  reqid?: string
  code?: number
  message?: string
  data?: string
  addition?: Record<string, unknown>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function readRepoEnvFallback() {
  try {
    const text = readFileSync(REPO_ENV_PATH, 'utf8')
    const env: Record<string, string> = {}
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) {
        continue
      }

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }

      env[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1)
    }

    return env
  }
  catch {
    return {}
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const body = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(body) as T
}

function resolveCredentials(
  requestBody: DoubaoTtsProxyRequest,
  env: Record<string, string | undefined>,
) {
  const envFallback = readRepoEnvFallback()
  const appId = requestBody.appId
    || env.VITE_PEPTUTOR_TTS_APP_ID
    || env.VITE_DOUBAO_TTS_APP_ID
    || env.VITE_PEPTUTOR_ASR_APP_ID
    || env.VITE_DOUBAO_ASR_APP_ID
    || envFallback.VITE_PEPTUTOR_TTS_APP_ID
    || envFallback.VITE_DOUBAO_TTS_APP_ID
    || envFallback.VITE_PEPTUTOR_ASR_APP_ID
    || envFallback.VITE_DOUBAO_ASR_APP_ID
    || ''

  const apiKey = requestBody.apiKey
    || env.VITE_PEPTUTOR_TTS_API_KEY
    || env.VITE_DOUBAO_TTS_API_KEY
    || env.VITE_PEPTUTOR_ASR_API_KEY
    || env.VITE_DOUBAO_ASR_API_KEY
    || envFallback.VITE_PEPTUTOR_TTS_API_KEY
    || envFallback.VITE_DOUBAO_TTS_API_KEY
    || envFallback.VITE_PEPTUTOR_ASR_API_KEY
    || envFallback.VITE_DOUBAO_ASR_API_KEY
    || ''

  const cluster = requestBody.cluster
    || env.VITE_PEPTUTOR_TTS_CLUSTER
    || env.VITE_DOUBAO_TTS_CLUSTER
    || envFallback.VITE_PEPTUTOR_TTS_CLUSTER
    || envFallback.VITE_DOUBAO_TTS_CLUSTER
    || DOUBAO_TTS_DEFAULT_CLUSTER

  if (!appId || !apiKey) {
    throw new Error('Doubao TTS proxy is missing appId or apiKey.')
  }

  return { apiKey, appId, cluster }
}

export function buildDoubaoTtsHttpBody(
  requestBody: DoubaoTtsProxyRequest,
  env: Record<string, string | undefined>,
) {
  const { apiKey, appId, cluster } = resolveCredentials(requestBody, env)
  const input = (requestBody.input || '').trim()
  const voice = (requestBody.voice || '').trim()

  if (!input) {
    throw new Error('Doubao TTS proxy requires non-empty input text.')
  }

  if (!voice) {
    throw new Error('Doubao TTS proxy requires a voice id.')
  }

  const encoding = requestBody.audio?.encoding || DOUBAO_TTS_DEFAULT_ENCODING

  return {
    headers: {
      'Authorization': `Bearer;${apiKey}`,
      'Content-Type': 'application/json',
    },
    requestBody: {
      app: {
        appid: appId,
        token: apiKey,
        cluster,
      },
      user: {
        uid: requestBody.user?.uid || 'peptutor-browser',
      },
      audio: {
        voice_type: voice,
        encoding,
        ...(typeof requestBody.audio?.speed_ratio === 'number' ? { speed_ratio: requestBody.audio.speed_ratio } : {}),
        ...(typeof requestBody.audio?.volume_ratio === 'number' ? { volume_ratio: requestBody.audio.volume_ratio } : {}),
        ...(typeof requestBody.audio?.pitch_ratio === 'number' ? { pitch_ratio: requestBody.audio.pitch_ratio } : {}),
      },
      request: {
        reqid: randomUUID(),
        text: input,
        text_type: 'plain',
        operation: 'query',
      },
    },
  }
}

export function decodeDoubaoTtsAudio(responseJson: DoubaoTtsSuccessResponse) {
  if (responseJson.code !== 3000 || !responseJson.data) {
    throw new Error(responseJson.message || 'Doubao TTS request failed.')
  }

  return Buffer.from(responseJson.data, 'base64')
}

async function handleTtsProxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  env: Record<string, string | undefined>,
) {
  try {
    const requestBody = await readJsonBody<DoubaoTtsProxyRequest>(request)
    const { headers, requestBody: officialBody } = buildDoubaoTtsHttpBody(requestBody, env)

    const upstream = await fetch(DOUBAO_TTS_HTTP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(officialBody),
    })

    const upstreamJson = await upstream.json() as DoubaoTtsSuccessResponse

    if (!upstream.ok || upstreamJson.code !== 3000 || !upstreamJson.data) {
      response.statusCode = upstream.status || 502
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify(upstreamJson))
      return
    }

    const audio = decodeDoubaoTtsAudio(upstreamJson)
    const encoding = officialBody.audio.encoding || DOUBAO_TTS_DEFAULT_ENCODING
    const contentType = encoding === 'wav' ? 'audio/wav' : 'audio/mpeg'

    response.statusCode = 200
    response.setHeader('Content-Type', contentType)
    response.setHeader('Content-Length', audio.byteLength)
    response.end(audio)
  }
  catch (error) {
    response.statusCode = 500
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({
      error: errorMessage(error),
    }))
  }
}

function isProxyRequest(request: IncomingMessage, path: string) {
  const url = request.url ? new URL(request.url, 'http://127.0.0.1') : null
  return request.method === 'POST' && url?.pathname === path
}

function attachProxyMiddleware(
  middlewares: ViteDevServer['middlewares'] | PreviewServer['middlewares'],
  env: Record<string, string | undefined>,
) {
  middlewares.use((request, response, next) => {
    if (!isProxyRequest(request, DOUBAO_TTS_PROXY_PATH)) {
      next()
      return
    }

    void handleTtsProxyRequest(request, response, env)
  })
}

export function serveDoubaoTtsProxy(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'peptutor-doubao-tts-proxy',
    configureServer(server) {
      attachProxyMiddleware(server.middlewares, env)
    },
    configurePreviewServer(server) {
      attachProxyMiddleware(server.middlewares, env)
    },
  }
}
