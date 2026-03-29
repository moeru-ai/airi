import type { Database } from './db'
import type { Env } from './env'
import type { AuthMetrics } from './otel'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { bearer, jwt, oidcProvider } from 'better-auth/plugins'

import { getAuthTrustedOrigins } from '../utils/origin'

import * as authSchema from '../schemas/accounts'

interface TrustedClient {
  clientId: string
  clientSecret: string
  name: string
  type: 'web' | 'native'
  redirectUrls: string[]
  disabled: boolean
  skipConsent: boolean
  metadata: Record<string, any> | null
}

/**
 * Build the list of trusted OIDC clients for first-party applications.
 * Trusted clients bypass DB lookups and skip consent screens.
 */
function buildTrustedClients(env: Env) {
  const clients: TrustedClient[] = []

  // Web app (production + dev)
  if (env.OIDC_CLIENT_ID_WEB && env.OIDC_CLIENT_SECRET_WEB) {
    clients.push({
      clientId: env.OIDC_CLIENT_ID_WEB,
      clientSecret: env.OIDC_CLIENT_SECRET_WEB,
      name: 'AIRI Stage Web',
      type: 'web' as const,
      redirectUrls: [
        'https://airi.moeru.ai/auth/callback',
        // Development
        'http://localhost:5173/auth/callback',
        'http://localhost:4173/auth/callback',
      ],
      disabled: false,
      skipConsent: true,
      metadata: null,
    })
  }

  // Electron desktop app
  if (env.OIDC_CLIENT_ID_ELECTRON && env.OIDC_CLIENT_SECRET_ELECTRON) {
    clients.push({
      clientId: env.OIDC_CLIENT_ID_ELECTRON,
      clientSecret: env.OIDC_CLIENT_SECRET_ELECTRON,
      name: 'AIRI Stage Desktop',
      type: 'native' as const,
      redirectUrls: [
        // Loopback redirect (RFC 8252 S7.3) — fixed ports because
        // better-auth validates redirect_uri via exact string match.
        'http://127.0.0.1:19721/callback',
        'http://127.0.0.1:19722/callback',
        'http://127.0.0.1:19723/callback',
        'http://127.0.0.1:19724/callback',
        'http://127.0.0.1:19725/callback',
      ],
      disabled: false,
      skipConsent: true,
      metadata: null,
    })
  }

  // Capacitor mobile app
  if (env.OIDC_CLIENT_ID_POCKET && env.OIDC_CLIENT_SECRET_POCKET) {
    clients.push({
      clientId: env.OIDC_CLIENT_ID_POCKET,
      clientSecret: env.OIDC_CLIENT_SECRET_POCKET,
      name: 'AIRI Stage Mobile',
      type: 'native' as const,
      redirectUrls: [
        'capacitor://localhost/auth/callback',
      ],
      disabled: false,
      skipConsent: true,
      metadata: null,
    })
  }

  return clients
}

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
      jwt(),
      oidcProvider({
        loginPage: '/sign-in',
        consentPage: '/oauth/authorize',
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
        trustedClients: buildTrustedClients(env),
      }),
    ],

    emailAndPassword: {
      enabled: true,
    },

    baseURL: env.API_SERVER_URL,
    trustedOrigins: request => getAuthTrustedOrigins(env, request),

    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
    },

    advanced: {},

    // NOTICE: skipStateCookieCheck required for Capacitor mobile apps.
    // Default state strategy is 'database' (we have a DB), but better-auth
    // still validates a signed state cookie (state.mjs L89-94). In Capacitor,
    // OAuth opens a system browser with a separate cookie jar from the WebView,
    // so the signed cookie is always missing → state_security_mismatch.
    // https://github.com/better-auth/better-auth/issues/5892
    account: {
      skipStateCookieCheck: true,
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
