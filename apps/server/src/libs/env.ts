import type { InferOutput } from 'valibot'

import { env, exit } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { injeca } from 'injeca'
import { integer, maxValue, minValue, nonEmpty, object, optional, parse, pipe, string, transform } from 'valibot'

import { DEFAULT_BILLING_EVENTS_STREAM } from '../utils/redis-keys'

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

  STRIPE_SECRET_KEY: optional(string()),
  STRIPE_WEBHOOK_SECRET: optional(string()),

  BILLING_EVENTS_STREAM: optional(string(), DEFAULT_BILLING_EVENTS_STREAM),
  BILLING_EVENTS_CONSUMER_NAME: optional(string()),
  BILLING_EVENTS_BATCH_SIZE: optionalIntegerFromString(10, 'BILLING_EVENTS_BATCH_SIZE', 1),
  BILLING_EVENTS_BLOCK_MS: optionalIntegerFromString(5000, 'BILLING_EVENTS_BLOCK_MS', 1),
  BILLING_EVENTS_MIN_IDLE_MS: optionalIntegerFromString(30000, 'BILLING_EVENTS_MIN_IDLE_MS', 1),

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
