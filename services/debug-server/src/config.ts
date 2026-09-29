import process from 'node:process'

import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

export interface DebugServerConfig {
  allowedOrigins: Set<string>
  captureContent: boolean
  databasePath: string
  host: string
  maxRequestBytes: number
  maxConcurrentIngests: number
  maxStoredBytes: number
  port: number
  retentionDays: number
  token: string
  tokenGenerated: boolean
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined)
    return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`)
  return parsed
}

function boolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined)
    return fallback
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  throw new Error(`${name} must be true or false`)
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): DebugServerConfig {
  const host = environment.AIRI_DEBUG_HOST ?? '127.0.0.1'
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost')
    throw new Error('AIRI_DEBUG_HOST must be a loopback host')

  const configuredToken = environment.AIRI_DEBUG_TOKEN
  if (configuredToken === '')
    throw new Error('AIRI_DEBUG_TOKEN must not be empty')
  const token = configuredToken ?? randomBytes(24).toString('base64url')
  const origins = environment.AIRI_DEBUG_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173'
  const port = positiveInteger(environment.AIRI_DEBUG_PORT, 6122, 'AIRI_DEBUG_PORT')
  if (port > 65535)
    throw new Error('AIRI_DEBUG_PORT must not exceed 65535')

  return {
    allowedOrigins: new Set(origins.split(',').map(value => value.trim()).filter(Boolean)),
    captureContent: boolean(environment.AIRI_DEBUG_CAPTURE_CONTENT, false, 'AIRI_DEBUG_CAPTURE_CONTENT'),
    databasePath: resolve(environment.AIRI_DEBUG_DB_PATH ?? '.airi/debug.duckdb'),
    host,
    maxRequestBytes: positiveInteger(environment.AIRI_DEBUG_MAX_REQUEST_BYTES, 1024 * 1024, 'AIRI_DEBUG_MAX_REQUEST_BYTES'),
    maxConcurrentIngests: positiveInteger(environment.AIRI_DEBUG_MAX_CONCURRENT_INGESTS, 8, 'AIRI_DEBUG_MAX_CONCURRENT_INGESTS'),
    maxStoredBytes: positiveInteger(environment.AIRI_DEBUG_MAX_STORED_BYTES, 1024 * 1024 * 1024, 'AIRI_DEBUG_MAX_STORED_BYTES'),
    port,
    retentionDays: positiveInteger(environment.AIRI_DEBUG_RETENTION_DAYS, 7, 'AIRI_DEBUG_RETENTION_DAYS'),
    token,
    tokenGenerated: configuredToken === undefined,
  }
}
