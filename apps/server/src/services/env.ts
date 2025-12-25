import { env } from 'node:process'

import { injeca } from 'injeca'

export interface Env {
  DATABASE_URL: string
  AUTH_GOOGLE_CLIENT_ID: string
  AUTH_GOOGLE_CLIENT_SECRET: string
  AUTH_GITHUB_CLIENT_ID: string
  AUTH_GITHUB_CLIENT_SECRET: string
}

export function parseEnv(inputEnv: Record<string, string> | typeof env): Env {
  return {
    DATABASE_URL: inputEnv.DATABASE_URL!,
    AUTH_GOOGLE_CLIENT_ID: inputEnv.AUTH_GOOGLE_CLIENT_ID!,
    AUTH_GOOGLE_CLIENT_SECRET: inputEnv.AUTH_GOOGLE_CLIENT_SECRET!,
    AUTH_GITHUB_CLIENT_ID: inputEnv.AUTH_GITHUB_CLIENT_ID!,
    AUTH_GITHUB_CLIENT_SECRET: inputEnv.AUTH_GITHUB_CLIENT_SECRET!,
  }
}

export const parsedEnv = injeca.provide('env', () => parseEnv(env))
