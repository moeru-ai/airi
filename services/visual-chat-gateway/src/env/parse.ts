import { envInt, envString } from '@proj-airi/visual-chat-shared'

import {
  GATEWAY_DEFAULT_HOST,
  GATEWAY_DEFAULT_LIVEKIT_API_KEY,
  GATEWAY_DEFAULT_LIVEKIT_API_SECRET,
  GATEWAY_DEFAULT_LIVEKIT_URL,
  GATEWAY_DEFAULT_LOG_LEVEL,
  GATEWAY_DEFAULT_PORT,
  GATEWAY_DEFAULT_WORKER_URL,
} from './defaults'

export interface GatewayConfig {
  host: string
  port: number
  livekitUrl: string
  livekitApiKey: string
  livekitApiSecret: string
  workerUrl: string
  logLevel: string
}

function assertNonEmpty(name: string, value: string): void {
  if (!value.trim())
    throw new Error(`Invalid ${name}: must be a non-empty string`)
}

export function parseGatewayConfig(): GatewayConfig {
  const host = envString('VISUAL_CHAT_HOST', GATEWAY_DEFAULT_HOST).trim()
  const port = envInt('VISUAL_CHAT_PORT', GATEWAY_DEFAULT_PORT)
  const livekitUrl = envString('LIVEKIT_URL', GATEWAY_DEFAULT_LIVEKIT_URL)
  const livekitApiKey = envString('LIVEKIT_API_KEY', GATEWAY_DEFAULT_LIVEKIT_API_KEY)
  const livekitApiSecret = envString('LIVEKIT_API_SECRET', GATEWAY_DEFAULT_LIVEKIT_API_SECRET)
  const workerUrl = envString('WORKER_URL', GATEWAY_DEFAULT_WORKER_URL)
  const logLevel = envString('LOG_LEVEL', GATEWAY_DEFAULT_LOG_LEVEL)

  if (port < 1 || port > 65535)
    throw new Error(`Invalid VISUAL_CHAT_PORT: ${port} (expected 1–65535)`)

  assertNonEmpty('LIVEKIT_URL', livekitUrl)
  assertNonEmpty('LIVEKIT_API_KEY', livekitApiKey)
  assertNonEmpty('LIVEKIT_API_SECRET', livekitApiSecret)
  assertNonEmpty('WORKER_URL', workerUrl)

  if (!URL.canParse(workerUrl)) {
    throw new Error(`Invalid WORKER_URL: not a valid URL (${workerUrl})`)
  }

  return {
    host,
    port,
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    workerUrl,
    logLevel,
  }
}
