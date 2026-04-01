import type { Database } from './db'
import type { Env } from './env'
import type { AuthMetrics } from './otel'

import { oauthProvider } from '@better-auth/oauth-provider'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { bearer, jwt } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'

import { getAuthTrustedOrigins } from '../utils/origin'

import * as authSchema from '../schemas/accounts'

interface TrustedClientSeed {
  clientId: string
  clientSecret: string
  name: string
  type: 'web' | 'native'
  redirectUris: string[]
  skipConsent: boolean
}

/**
 * Build the list of first-party OIDC clients to seed into the database.
 */
function buildTrustedClientSeeds(env: Env): TrustedClientSeed[] {
  const clients: TrustedClientSeed[] = []

  // Web app (production + dev)
  if (env.OIDC_CLIENT_ID_WEB && env.OIDC_CLIENT_SECRET_WEB) {
    clients.push({
      clientId: env.OIDC_CLIENT_ID_WEB,
      clientSecret: env.OIDC_CLIENT_SECRET_WEB,
      name: 'AIRI Stage Web',
      type: 'web',
      redirectUris: [
        'https://airi.moeru.ai/auth/callback',
        'http://localhost:5173/auth/callback',
        'http://localhost:4173/auth/callback',
      ],
      skipConsent: true,
    })
  }

  // Electron desktop app
  if (env.OIDC_CLIENT_ID_ELECTRON && env.OIDC_CLIENT_SECRET_ELECTRON) {
    clients.push({
      clientId: env.OIDC_CLIENT_ID_ELECTRON,
      clientSecret: env.OIDC_CLIENT_SECRET_ELECTRON,
      name: 'AIRI Stage Desktop',
      type: 'native',
      redirectUris: [
        // Server-side relay: the OIDC redirect lands on the server, which
        // serves an HTML page that forwards the code to the Electron
        // loopback via JS fetch(). The loopback port is encoded in the
        // `state` parameter. This avoids navigating the browser to a
        // loopback URL and removes the need for per-port redirect URIs.
        `${env.API_SERVER_URL}/api/auth/oidc/electron-callback`,
      ],
      skipConsent: true,
    })
  }

  // Capacitor mobile app
  if (env.OIDC_CLIENT_ID_POCKET && env.OIDC_CLIENT_SECRET_POCKET) {
    clients.push({
      clientId: env.OIDC_CLIENT_ID_POCKET,
      clientSecret: env.OIDC_CLIENT_SECRET_POCKET,
      name: 'AIRI Stage Mobile',
      type: 'native',
      redirectUris: [
        'capacitor://localhost/auth/callback',
      ],
      skipConsent: true,
    })
  }

  return clients
}

/**
 * Ensure trusted OIDC clients exist in the `oauth_client` table.
 * The oauthProvider plugin's `cachedTrustedClients` caches DB lookups, but
 * the `oauth_access_token` table has a FK to `oauth_client.client_id`.
 * Without a matching row, token INSERT fails with a constraint violation.
 */
export async function seedTrustedClients(db: Database, env: Env): Promise<void> {
  const seeds = buildTrustedClientSeeds(env)
  if (seeds.length === 0)
    return

  for (const seed of seeds) {
    const existing = await db
      .select({ clientId: authSchema.oauthClient.clientId })
      .from(authSchema.oauthClient)
      .where(eq(authSchema.oauthClient.clientId, seed.clientId))
      .limit(1)

    if (existing.length > 0)
      continue

    await db.insert(authSchema.oauthClient).values({
      id: crypto.randomUUID(),
      clientId: seed.clientId,
      clientSecret: seed.clientSecret,
      name: seed.name,
      type: seed.type,
      redirectUris: seed.redirectUris,
      skipConsent: seed.skipConsent,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
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

    // NOTICE: disabledPaths prevents better-auth's built-in /token route from
    // conflicting with oauthProvider's /oauth2/token endpoint.
    disabledPaths: ['/token'],

    plugins: [
      bearer(),
      jwt(),
      oauthProvider({
        loginPage: '/sign-in',
        consentPage: '/oauth/authorize',
        // Cache trusted client DB lookups by client_id for performance.
        // Clients must still exist in the DB (seeded by seedTrustedClients).
        cachedTrustedClients: new Set(
          buildTrustedClientSeeds(env).map(c => c.clientId),
        ),
      }),
    ],

    emailAndPassword: {
      enabled: true,
    },

    session: {
      storeSessionInDatabase: true,

      // NOTICE: keep a short-lived signed session cache cookie so follow-up
      // session reads avoid hitting the database on every request.
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },

    baseURL: env.API_SERVER_URL,
    trustedOrigins: request => getAuthTrustedOrigins(env, request),

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
