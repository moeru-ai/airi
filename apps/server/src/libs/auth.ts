import type { Database } from './db'
import type { Env } from './env'
import type { AuthMetrics } from './otel'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
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

    // NOTICE: Store OAuth state in the database instead of cookies to avoid
    // state_mismatch errors on mobile browsers (iOS Safari/Chrome) where
    // cross-site cookies are blocked by system-level privacy restrictions.
    // https://github.com/better-auth/better-auth/issues/5892
    // https://github.com/better-auth/better-auth/issues/6207
    account: {
      storeStateStrategy: 'database',
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

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const isAuthAttempt = ctx.path.includes('/sign-in') || ctx.path.includes('/sign-up')
        if (isAuthAttempt) {
          metrics?.attempts.add(1, { 'auth.method': ctx.path.split('/').pop() ?? 'unknown' })
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Track auth failures via otel
        const isAuthAttempt = ctx.path.includes('/sign-in') || ctx.path.includes('/sign-up')
        if (isAuthAttempt && ctx.context.returned && typeof ctx.context.returned === 'object' && 'error' in ctx.context.returned) {
          metrics?.failures.add(1, { 'auth.method': ctx.path.split('/').pop() ?? 'unknown' })
        }

        // On OAuth callback errors, redirect back to the referer instead of returning API JSON
        if (ctx.path.startsWith('/callback') && ctx.context.returned && typeof ctx.context.returned === 'object' && 'error' in ctx.context.returned) {
          const referer = ctx.getHeader('referer')
          if (referer) {
            const url = new URL(referer)
            url.searchParams.set('error', 'auth_failed')
            throw ctx.redirect(url.toString())
          }
        }
      }),
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
