import { envInt, envString } from '@proj-airi/visual-chat-shared'

import {
  WORKER_DEFAULT_GATEWAY_URL,
  WORKER_DEFAULT_HOST,
  WORKER_DEFAULT_LOG_LEVEL,
  WORKER_DEFAULT_OLLAMA_BASE_URL,
  WORKER_DEFAULT_OLLAMA_MODEL,
  WORKER_DEFAULT_PORT,
} from './defaults'

export interface WorkerConfig {
  host: string
  port: number
  gatewayUrl: string
  ollamaBaseUrl: string
  ollamaModel: string
  logLevel: string
}

export function parseWorkerConfig(): WorkerConfig {
  const host = envString('WORKER_HOST', WORKER_DEFAULT_HOST).trim()
  const port = envInt('WORKER_PORT', WORKER_DEFAULT_PORT)
  const gatewayUrl = envString('VISUAL_CHAT_GATEWAY_URL', WORKER_DEFAULT_GATEWAY_URL).trim()
  const ollamaBaseUrl = envString('OLLAMA_HOST', WORKER_DEFAULT_OLLAMA_BASE_URL).trim()
  const ollamaModel = envString('OLLAMA_MODEL', WORKER_DEFAULT_OLLAMA_MODEL).trim()
  const logLevel = envString('LOG_LEVEL', WORKER_DEFAULT_LOG_LEVEL)

  if (port < 1 || port > 65535)
    throw new Error(`Invalid WORKER_PORT: ${port} (expected 1-65535)`)

  if (!URL.canParse(ollamaBaseUrl))
    throw new Error(`Invalid OLLAMA_HOST: not a valid URL (${ollamaBaseUrl})`)

  if (!ollamaModel)
    throw new Error('Invalid OLLAMA_MODEL: must be a non-empty string')

  return {
    host,
    port,
    gatewayUrl,
    ollamaBaseUrl,
    ollamaModel,
    logLevel,
  }
}
