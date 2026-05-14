import type { InferOutput } from 'valibot'

import { env, exit } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { injeca } from 'injeca'
import { integer, maxValue, minValue, nonEmpty, object, optional, parse, pipe, string, transform } from 'valibot'

import { DEFAULT_BILLING_EVENTS_STREAM } from '../utils/redis-keys'

/**
 * Parses `ADDITIONAL_TRUSTED_ORIGINS`: comma-separated absolute origins used for
 * CORS (`/api/*`) and request-derived trusted bases (e.g. Stripe return URLs).
 * Each segment is normalized via `URL.origin` so trailing slashes are stripped.
 *
 * Before:
 * - `" https://10.0.0.129:5273/ , https://198.18.0.1:5273 "`
 *
 * After:
 * - `["https://10.0.0.129:5273", "https://198.18.0.1:5273"]`
 */
export function parseAdditionalTrustedOriginsEnv(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed)
    return []

  const seen = new Set<string>()
  const out: string[] = []

  for (const part of trimmed.split(',')) {
    const entry = part.trim()
    if (!entry)
      continue

    let normalized: string
    try {
      normalized = new URL(entry).origin
    }
    catch {
      throw new TypeError(`ADDITIONAL_TRUSTED_ORIGINS: invalid URL origin segment "${entry}"`)
    }

    if (!seen.has(normalized)) {
      seen.add(normalized)
      out.push(normalized)
    }
  }

  return out
}

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

function optionalNumberFromString(defaultValue: number, envKey: string, minimum: number, maximum: number) {
  return optional(
    pipe(
      string(),
      nonEmpty(`${envKey} must not be empty`),
      transform(input => Number(input)),
      minValue(minimum, `${envKey} must be at least ${minimum}`),
      maxValue(maximum, `${envKey} must be at most ${maximum}`),
    ),
    String(defaultValue),
  )
}

const EnvSchema = object({
  HOST: optional(string(), '0.0.0.0'),
  PORT: optionalIntegerFromString(3000, 'PORT', 1),

  API_SERVER_URL: optional(string(), 'http://localhost:3000'),

  // Comma-separated exact origins (e.g. Capacitor dev server `https://10.x:5273`).
  // Prefer this over broad private-IP regex heuristics in production-like configs.
  ADDITIONAL_TRUSTED_ORIGINS: optional(
    pipe(
      string(),
      transform(raw => parseAdditionalTrustedOriginsEnv(raw)),
    ),
    '',
  ),

  DATABASE_URL: pipe(string(), nonEmpty('DATABASE_URL is required')),
  REDIS_URL: pipe(string(), nonEmpty('REDIS_URL is required')),

  // Required: signs session cookies and encrypts JWKS private keys in DB.
  // Must be stable across deploys/instances, otherwise every redeploy invalidates
  // all existing sessions and forces users to re-login.
  BETTER_AUTH_SECRET: pipe(string(), nonEmpty('BETTER_AUTH_SECRET is required')),

  AUTH_GOOGLE_CLIENT_ID: pipe(string(), nonEmpty('AUTH_GOOGLE_CLIENT_ID is required')),
  AUTH_GOOGLE_CLIENT_SECRET: pipe(string(), nonEmpty('AUTH_GOOGLE_CLIENT_SECRET is required')),
  AUTH_GITHUB_CLIENT_ID: pipe(string(), nonEmpty('AUTH_GITHUB_CLIENT_ID is required')),
  AUTH_GITHUB_CLIENT_SECRET: pipe(string(), nonEmpty('AUTH_GITHUB_CLIENT_SECRET is required')),

  // Resend transactional email. RESEND_API_KEY required when emailAndPassword
  // sign-up / forgot-password / change-email / magic-link is exercised. Service
  // boots without it but those flows will throw at send-time.
  RESEND_API_KEY: optional(string(), ''),
  // From address must be a verified Resend sender (e.g. `noreply@your-domain`).
  RESEND_FROM_EMAIL: optional(string(), 'noreply@airi.moeru.ai'),
  // Optional friendly name; rendered as `Name <email>` per Resend's RFC 5322 display-name format.
  RESEND_FROM_NAME: optional(string(), 'Project AIRI'),

  STRIPE_SECRET_KEY: optional(string()),
  STRIPE_WEBHOOK_SECRET: optional(string()),

  // LLM gateway (infrastructure config — baked per deployment)
  GATEWAY_BASE_URL: pipe(string(), nonEmpty('GATEWAY_BASE_URL is required')),
  DEFAULT_CHAT_MODEL: pipe(string(), nonEmpty('DEFAULT_CHAT_MODEL is required')),
  DEFAULT_TTS_MODEL: pipe(string(), nonEmpty('DEFAULT_TTS_MODEL is required')),

  // Database pool
  DB_POOL_MAX: optionalIntegerFromString(20, 'DB_POOL_MAX', 1),
  DB_POOL_IDLE_TIMEOUT_MS: optionalIntegerFromString(30000, 'DB_POOL_IDLE_TIMEOUT_MS', 1),
  DB_POOL_CONNECTION_TIMEOUT_MS: optionalIntegerFromString(5000, 'DB_POOL_CONNECTION_TIMEOUT_MS', 1),
  DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: optionalIntegerFromString(10000, 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS', 1),

  // OpenTelemetry
  OTEL_SERVICE_NAMESPACE: optional(string(), 'airi'),
  OTEL_SERVICE_NAME: optional(string(), 'server'),
  OTEL_TRACES_SAMPLING_RATIO: optionalNumberFromString(1, 'OTEL_TRACES_SAMPLING_RATIO', 0, 1),
  OTEL_EXPORTER_OTLP_ENDPOINT: optional(string()),
  OTEL_EXPORTER_OTLP_HEADERS: optional(string()),
  OTEL_DEBUG: optional(string()),
  // Admin allowlist for /api/admin/* routes. Comma-separated email addresses.
  // Match is case-insensitive, but the user must also have `email_verified = true`
  // — otherwise an attacker could register a fresh account with the admin email
  // before verification and slip past the check.
  // Empty (default) = no one is admin — production safe by default.
  // Example: ADMIN_EMAILS=alice@example.com,bob@example.com
  ADMIN_EMAILS: optional(string(), ''),
})

export type Env = InferOutput<typeof EnvSchema>

export function parseEnv(inputEnv: Record<string, string> | typeof env): Env {
  try {
    return parse(EnvSchema, inputEnv)
  }
  catch (err) {
    useLogger().withError(err).error('Invalid environment variables')
    exit(1)
  }
}

export const parsedEnv = injeca.provide('env', () => parseEnv(env))
