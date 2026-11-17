import type { InferOutput } from 'valibot'

import { exit } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { array, check, integer, minValue, nonEmpty, number, object, optional, parse, picklist, pipe, string, transform, url } from 'valibot'

import { GoogleNativeClientIdsSchema } from './google-client-ids'

function optionalIntegerFromString(defaultValue: number, envKey: string, minimum: number) {
  return optional(
    pipe(
      string(),
      nonEmpty(`${envKey} must not be empty`),
      transform(input => Number(input)),
      integer(`${envKey} must be an integer`),
      minValue(minimum, `${envKey} must be at least ${minimum}`),
    ),
    String(defaultValue),
  )
}

const AdditionalTrustedOriginsSchema = pipe(
  string(),
  transform(raw => raw.split(',').map(origin => origin.trim()).filter(Boolean)),
  array(pipe(
    string(),
    url('ADDITIONAL_TRUSTED_ORIGINS entries must be valid URLs'),
    transform(origin => new URL(origin).origin),
  )),
  transform(origins => [...new Set(origins)]),
)

/**
 * Versioned Better Auth secrets, written as `<version>:<secret>` pairs joined by commas.
 * The first pair is the current secret. Later pairs only decrypt older values.
 */
const BetterAuthSecretsSchema = pipe(
  string(),
  transform(raw => raw.split(',').map((entry) => {
    const separator = entry.indexOf(':')
    if (separator < 0)
      return { version: Number.NaN, value: '' }
    return { version: Number(entry.slice(0, separator).trim()), value: entry.slice(separator + 1).trim() }
  })),
  array(object({
    version: pipe(number(), integer('BETTER_AUTH_SECRETS versions must be integers'), minValue(0, 'BETTER_AUTH_SECRETS versions must be at least 0')),
    value: pipe(string(), nonEmpty('BETTER_AUTH_SECRETS entries must have a secret')),
  })),
  check(secrets => new Set(secrets.map(secret => secret.version)).size === secrets.length, 'BETTER_AUTH_SECRETS versions must be unique'),
)

const AuthEnvSchema = object({
  HOST: optional(string(), '0.0.0.0'),
  PORT: optionalIntegerFromString(3000, 'PORT', 1),
  PUBLIC_URL: optional(string(), 'http://localhost:3000'),
  RESOURCE_SERVER_URL: optional(string(), 'http://localhost:3001'),
  RATE_LIMIT_TRUSTED_PROXY: optional(picklist(['railway'])),
  AUTH_UI_URL: optional(string(), 'https://accounts.airi.build/ui'),
  ADDITIONAL_TRUSTED_ORIGINS: optional(AdditionalTrustedOriginsSchema, ''),
  DATABASE_URL: pipe(string(), nonEmpty('DATABASE_URL is required')),
  REDIS_URL: pipe(string(), nonEmpty('REDIS_URL is required')),
  BETTER_AUTH_SECRET: pipe(string(), nonEmpty('BETTER_AUTH_SECRET is required')),
  // Set during and after a secret rotation. Then BETTER_AUTH_SECRET only opens values from before versioning.
  BETTER_AUTH_SECRETS: optional(BetterAuthSecretsSchema),
  AUTH_GOOGLE_CLIENT_ID: pipe(string(), nonEmpty('AUTH_GOOGLE_CLIENT_ID is required')),
  AUTH_GOOGLE_NATIVE_CLIENT_IDS: optional(GoogleNativeClientIdsSchema),
  AUTH_GOOGLE_CLIENT_SECRET: pipe(string(), nonEmpty('AUTH_GOOGLE_CLIENT_SECRET is required')),
  AUTH_GITHUB_CLIENT_ID: pipe(string(), nonEmpty('AUTH_GITHUB_CLIENT_ID is required')),
  AUTH_GITHUB_CLIENT_SECRET: pipe(string(), nonEmpty('AUTH_GITHUB_CLIENT_SECRET is required')),
  STEAM_PUBLISHER_KEY: optional(string(), ''),
  AUTH_APPLE_CLIENT_ID: optional(string(), ''),
  AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: optional(
    pipe(
      string(),
      transform(raw => [...new Set(
        raw
          .split(',')
          .map(bundleIdentifier => bundleIdentifier.trim())
          .filter(Boolean),
      )]),
    ),
    '',
  ),
  AUTH_APPLE_TEAM_ID: optional(string(), ''),
  AUTH_APPLE_KEY_ID: optional(string(), ''),
  AUTH_APPLE_PRIVATE_KEY_PEM: optional(
    pipe(
      string(),
      // Deployment dashboards commonly store multiline secrets with escaped
      // newlines. jose's PKCS8 importer requires the original PEM layout.
      transform(raw => raw.replaceAll(String.raw`\n`, '\n')),
    ),
    '',
  ),
  RESEND_API_KEY: optional(string(), ''),
  RESEND_FROM_EMAIL: optional(string(), 'noreply@airi.moeru.ai'),
  RESEND_FROM_NAME: optional(string(), 'Project AIRI'),
  DB_POOL_MAX: optionalIntegerFromString(20, 'DB_POOL_MAX', 1),
  DB_POOL_IDLE_TIMEOUT_MS: optionalIntegerFromString(30000, 'DB_POOL_IDLE_TIMEOUT_MS', 1),
  DB_POOL_CONNECTION_TIMEOUT_MS: optionalIntegerFromString(5000, 'DB_POOL_CONNECTION_TIMEOUT_MS', 1),
  DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: optionalIntegerFromString(10000, 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS', 1),
  OTEL_SERVICE_NAME: optional(string(), 'auth-server'),
  OTEL_EXPORTER_OTLP_ENDPOINT: optional(string()),
})

/** Environment owned exclusively by the standalone Auth process. */
export type AuthEnv = InferOutput<typeof AuthEnvSchema>

/** Parses only Auth-owned configuration; business-only secrets are ignored. */
export function parseAuthEnv(inputEnv: Record<string, string> | NodeJS.ProcessEnv): AuthEnv {
  try {
    return parse(AuthEnvSchema, inputEnv)
  }
  catch (err) {
    useLogger().withError(err).error('Invalid auth environment variables')
    exit(1)
  }
}
