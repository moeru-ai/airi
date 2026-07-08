import type { InferOutput } from 'valibot'

import { Buffer } from 'node:buffer'
import { env, exit } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { injeca } from 'injeca'
import { check, integer, maxValue, minValue, nonEmpty, object, optional, parse, pipe, string, transform } from 'valibot'

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

  // Standalone auth UI base URL. The server keeps `/auth/*` as the historical
  // entrypoint and redirects those requests here after ui-server-auth moved out
  // of the server image.
  AUTH_UI_URL: optional(string(), 'https://accounts.airi.build/ui'),

  // Standalone admin UI base URL. The server keeps `/admin/*` as the historical
  // entrypoint and redirects those requests here after the admin UI moved to
  // the standalone proj-airi repository.
  ADMIN_UI_URL: optional(string(), 'https://admin.airi.build'),

  // Canonical user-facing web app origin. Used as the Stripe redirect base
  // (success_url / cancel_url / portal return_url) when a request has no trusted
  // browser origin — notably the Electron desktop renderer, which loads from
  // file:// and sends no usable web origin. Web/mobile requests keep returning to
  // their own origin; only origin-less clients fall back to this.
  WEB_APP_URL: optional(string(), 'https://airi.moeru.ai'),

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

  // Testing-only bearer token bypass. Keep unset in production. When set,
  // Authorization: Bearer $TEST_AUTH_TOKEN resolves to the virtual user below
  // through resolveRequestAuth without creating a better-auth session row.
  TEST_AUTH_TOKEN: optional(string(), ''),
  TEST_AUTH_USER_ID: optional(pipe(string(), nonEmpty('TEST_AUTH_USER_ID must not be empty when set')), 'test-user'),
  TEST_AUTH_USER_EMAIL: optional(pipe(string(), nonEmpty('TEST_AUTH_USER_EMAIL must not be empty when set')), 'test@example.com'),
  TEST_AUTH_USER_NAME: optional(pipe(string(), nonEmpty('TEST_AUTH_USER_NAME must not be empty when set')), 'Test User'),
  TEST_AUTH_USER_ROLE: optional(string(), ''),

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

  // LLM/TTS gateway is fully internalised by the in-process router; provider
  // baseURLs live per-upstream inside LLM_ROUTER_CONFIG, and the default chat /
  // tts model aliases moved to configKV (DEFAULT_CHAT_MODEL / DEFAULT_TTS_MODEL)
  // so they're hot-swappable via Pub/Sub invalidation. No env entries needed
  // here.

  // Envelope-encryption master key for in-process LLM/TTS router (KTD-5).
  // Stored as base64-encoded 32 random bytes. Validator decodes + asserts the
  // 32-byte length at parse time so a misconfigured key fails the deploy
  // rather than passing readiness and breaking on first router request.
  // Required: the router has no fallback path, so an unset master key means
  // chat completions cannot serve at all.
  LLM_ROUTER_MASTER_KEY: pipe(
    string(),
    nonEmpty('LLM_ROUTER_MASTER_KEY is required'),
    transform(b64 => Buffer.from(b64, 'base64')),
    check(buf => buf.length === 32, 'LLM_ROUTER_MASTER_KEY must decode to exactly 32 bytes (base64-encoded 32-byte random)'),
  ),
  // Optional second master key used only during rotation: encrypts under
  // LLM_ROUTER_MASTER_KEY (new), retries decrypt against LLM_ROUTER_MASTER_KEY_PREVIOUS
  // (old). Drop after re-encrypting every stored ciphertext.
  LLM_ROUTER_MASTER_KEY_PREVIOUS: optional(pipe(
    string(),
    nonEmpty('LLM_ROUTER_MASTER_KEY_PREVIOUS must not be empty when set'),
    transform(b64 => Buffer.from(b64, 'base64')),
    check(buf => buf.length === 32, 'LLM_ROUTER_MASTER_KEY_PREVIOUS must decode to exactly 32 bytes when set'),
  )),

  // Database pool
  DB_POOL_MAX: optionalIntegerFromString(20, 'DB_POOL_MAX', 1),
  DB_POOL_IDLE_TIMEOUT_MS: optionalIntegerFromString(30000, 'DB_POOL_IDLE_TIMEOUT_MS', 1),
  DB_POOL_CONNECTION_TIMEOUT_MS: optionalIntegerFromString(5000, 'DB_POOL_CONNECTION_TIMEOUT_MS', 1),
  DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: optionalIntegerFromString(10000, 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS', 1),

  // PostHog product-event forwarding (signup / payment / subscription facts).
  // Defaults to the shared AIRI project key (same browser-safe phc_* key the
  // client surfaces embed in posthog.config.ts), so forwarding is on out of
  // the box. Set to an empty string to disable; Postgres `product_events`
  // stays the source of truth either way.
  POSTHOG_PROJECT_KEY: optional(string(), 'phc_pzjziJjrVZpa9SqnQqq0QEKvkmuCPH7GDTA6TbRTEf9'), // cspell:disable-line
  POSTHOG_API_HOST: optional(string(), 'https://us.i.posthog.com'),

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
