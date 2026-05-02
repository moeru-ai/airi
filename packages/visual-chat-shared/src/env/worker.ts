import process from 'node:process'

import { envInt } from './common'

export function getWorkerPort(): number {
  return envInt('WORKER_PORT', 6201)
}

export function getOllamaHost(): string {
  return process.env.OLLAMA_HOST?.trim() || 'http://localhost:11434'
}

export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || 'openbmb/minicpm-v4.5:latest'
}
