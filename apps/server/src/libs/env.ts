import type { InferOutput } from 'valibot'

import { env, exit } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { injeca } from 'injeca'
import { nonEmpty, object, optional, parse, pipe, string } from 'valibot'

const EnvSchema = object({
  HOST: optional(string(), '0.0.0.0'),
  PORT: optional(string(), '3000'),

  API_SERVER_URL: optional(string(), 'http://localhost:3000'),
  CLIENT_URL: optional(string(), 'https://airi.moerui.ai'),

  DATABASE_URL: pipe(string(), nonEmpty('DATABASE_URL is required')),
  REDIS_URL: pipe(string(), nonEmpty('REDIS_URL is required')),

  AUTH_GOOGLE_CLIENT_ID: pipe(string(), nonEmpty('AUTH_GOOGLE_CLIENT_ID is required')),
  AUTH_GOOGLE_CLIENT_SECRET: pipe(string(), nonEmpty('AUTH_GOOGLE_CLIENT_SECRET is required')),
  AUTH_GITHUB_CLIENT_ID: pipe(string(), nonEmpty('AUTH_GITHUB_CLIENT_ID is required')),
  AUTH_GITHUB_CLIENT_SECRET: pipe(string(), nonEmpty('AUTH_GITHUB_CLIENT_SECRET is required')),

  STRIPE_SECRET_KEY: optional(string()),
  STRIPE_WEBHOOK_SECRET: optional(string()),

  BILLING_EVENTS_STREAM: optional(string(), 'billing-events'),
  BILLING_EVENTS_CONSUMER_NAME: optional(string()),
  BILLING_EVENTS_BATCH_SIZE: optional(string(), '10'),
  BILLING_EVENTS_BLOCK_MS: optional(string(), '5000'),
  BILLING_EVENTS_MIN_IDLE_MS: optional(string(), '30000'),

  OUTBOX_DISPATCHER_NAME: optional(string()),
  OUTBOX_DISPATCHER_BATCH_SIZE: optional(string(), '10'),
  OUTBOX_DISPATCHER_CLAIM_TTL_MS: optional(string(), '30000'),
  OUTBOX_DISPATCHER_POLL_MS: optional(string(), '1000'),

  // OpenTelemetry
  OTEL_SERVICE_NAMESPACE: optional(string(), 'airi'),
  OTEL_SERVICE_NAME: optional(string(), 'server'),
  OTEL_TRACES_SAMPLING_RATIO: optional(string(), '1.0'),
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
