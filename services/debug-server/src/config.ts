import type { InferOutput } from 'valibot'

import process from 'node:process'

import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

import { maxValue, minLength, minValue, number, object, optional, parse, picklist, pipe, regex, safeInteger, string, transform } from 'valibot'

function positiveInteger(fallback: number, name: string) {
  const message = `${name} must be a positive integer`
  return pipe(optional(string(), String(fallback)), transform(Number), number(message), safeInteger(message), minValue(1, message))
}

const environmentSchema = pipe(object({
  AIRI_DEBUG_HOST: optional(picklist(['127.0.0.1', '::1', 'localhost'], 'AIRI_DEBUG_HOST must be a loopback host'), '127.0.0.1'),
  AIRI_DEBUG_TOKEN: optional(pipe(string(), minLength(1, 'AIRI_DEBUG_TOKEN must not be empty'), regex(/^[\w.~+/-]+=*$/, 'AIRI_DEBUG_TOKEN must be a valid Bearer token'))),
  AIRI_DEBUG_ALLOWED_ORIGINS: optional(string(), 'http://localhost:5173,http://127.0.0.1:5173'),
  AIRI_DEBUG_DB_PATH: optional(string(), '.airi/debug.duckdb'),
  AIRI_DEBUG_MAX_REQUEST_BYTES: positiveInteger(1024 * 1024, 'AIRI_DEBUG_MAX_REQUEST_BYTES'),
  AIRI_DEBUG_MAX_CONCURRENT_INGESTS: positiveInteger(8, 'AIRI_DEBUG_MAX_CONCURRENT_INGESTS'),
  AIRI_DEBUG_MAX_STORED_BYTES: positiveInteger(1024 * 1024 * 1024, 'AIRI_DEBUG_MAX_STORED_BYTES'),
  AIRI_DEBUG_PORT: pipe(positiveInteger(6122, 'AIRI_DEBUG_PORT'), maxValue(65535, 'AIRI_DEBUG_PORT must not exceed 65535')),
  AIRI_DEBUG_RETENTION_DAYS: positiveInteger(7, 'AIRI_DEBUG_RETENTION_DAYS'),
}), transform(environment => ({
  allowedOrigins: new Set(environment.AIRI_DEBUG_ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean)),
  databasePath: resolve(environment.AIRI_DEBUG_DB_PATH),
  host: environment.AIRI_DEBUG_HOST,
  maxRequestBytes: environment.AIRI_DEBUG_MAX_REQUEST_BYTES,
  maxConcurrentIngests: environment.AIRI_DEBUG_MAX_CONCURRENT_INGESTS,
  maxStoredBytes: environment.AIRI_DEBUG_MAX_STORED_BYTES,
  port: environment.AIRI_DEBUG_PORT,
  retentionDays: environment.AIRI_DEBUG_RETENTION_DAYS,
  token: environment.AIRI_DEBUG_TOKEN ?? randomBytes(24).toString('base64url'),
  tokenGenerated: environment.AIRI_DEBUG_TOKEN === undefined,
})))

export type DebugServerConfig = InferOutput<typeof environmentSchema>

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): DebugServerConfig {
  return parse(environmentSchema, environment)
}
