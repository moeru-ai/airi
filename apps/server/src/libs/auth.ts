import type { Database } from './db'
import type { Env } from './env'
import type { AuthMetrics } from './otel'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'

import { getAuthTrustedOrigins } from '../utils/origin'

import * as authSchema from '../schemas/accounts'

// NOTICE: return type uses `any` to avoid TS2742 — betterAuth's inferred type
// references internal pnpm paths (@better-auth/core) that aren't directly accessible

export function createAuth(db: Database, env: Env, metrics?: AuthMetrics | null): any {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        ...authSchema,
      },
    }),

    plugins: [
      bearer(),
    ],

    emailAndPassword: {
      enabled: true,
    },

    baseURL: env.API_SERVER_URL,
    trustedOrigins: request => getAuthTrustedOrigins(env, request),

    // To skip state-mismatch errors
    // https://github.com/better-auth/better-auth/issues/4969#issuecomment-3397804378
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'None', // this enables cross-site cookies
        secure: true, // required for SameSite=None
      },
    },

    socialProviders: {
      google: {
        clientId: env.AUTH_GOOGLE_CLIENT_ID,
        clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientId: env.AUTH_GITHUB_CLIENT_ID,
        clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async () => {
            metrics?.userRegistered.add(1)
          },
        },
      },
      session: {
        create: {
          after: async () => {
            metrics?.userLogin.add(1)
            metrics?.activeSessions.add(1)
          },
        },
        delete: {
          after: async () => {
            metrics?.activeSessions.add(-1)
          },
        },
      },
    },
  })
}
