import type { InferOutput } from 'valibot'

import { env, exit } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { injeca } from 'injeca'
import { nonEmpty, object, optional, parse, pipe, string, transform } from 'valibot'

const EnvSchema = object({
  API_SERVER_URL: optional(string(), 'http://localhost:3000'),
  CLIENT_URL: optional(string(), 'https://airi.moerui.ai'),
  DATABASE_URL: pipe(string(), nonEmpty('DATABASE_URL is required')),

  AUTH_GOOGLE_CLIENT_ID: pipe(string(), nonEmpty('AUTH_GOOGLE_CLIENT_ID is required')),
  AUTH_GOOGLE_CLIENT_SECRET: pipe(string(), nonEmpty('AUTH_GOOGLE_CLIENT_SECRET is required')),
  AUTH_GITHUB_CLIENT_ID: pipe(string(), nonEmpty('AUTH_GITHUB_CLIENT_ID is required')),
  AUTH_GITHUB_CLIENT_SECRET: pipe(string(), nonEmpty('AUTH_GITHUB_CLIENT_SECRET is required')),

  STRIPE_SECRET_KEY: optional(string()),
  STRIPE_WEBHOOK_SECRET: optional(string()),

  FLUX_PER_CENT: optional(pipe(string(), transform(Number)), '1'),
  FLUX_PER_REQUEST: optional(pipe(string(), transform(Number)), '1'),

  BACKEND_LLM_BASE_URL: optional(string()),
  BACKEND_LLM_API_KEY: optional(string()),
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
