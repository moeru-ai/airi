import type { Database } from './db'
import type { Env } from './env'
import type { AuthMetrics } from './otel'

import { Buffer } from 'node:buffer'

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
  /** Omit for public clients (Web, Mobile) — only confidential clients need a secret. */
  clientSecret?: string
  name: string
  type: 'web' | 'native'
  /** Public clients rely solely on PKCE; confidential clients use client_secret + PKCE. */
  public: boolean
  redirectUris: string[]
  scopes: string[]
  grantTypes: string[]
  responseTypes: string[]
  tokenEndpointAuthMethod: 'none' | 'client_secret_post'
  requirePKCE: boolean
  skipConsent: boolean
}

const OIDC_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const
const OIDC_GRANT_TYPES = ['authorization_code', 'refresh_token'] as const
const OIDC_RESPONSE_TYPES = ['code'] as const

/**
 * Build the list of first-party OIDC clients to seed into the database.
 */
function buildTrustedClientSeeds(env: Env): TrustedClientSeed[] {
  const clients: TrustedClientSeed[] = []

  // Web app — public client (no secret, PKCE only).
  // Browsers cannot safely store a client_secret; PKCE provides CSRF protection.
  if (env.OIDC_CLIENT_ID_WEB) {
    clients.push({
      clientId: env.OIDC_CLIENT_ID_WEB,
      name: 'AIRI Stage Web',
      type: 'web',
      public: true,
      redirectUris: [
        'https://airi.moeru.ai/auth/callback',
        'http://localhost:5173/auth/callback',
        'http://localhost:4173/auth/callback',
      ],
      scopes: [...OIDC_SCOPES],
      grantTypes: [...OIDC_GRANT_TYPES],
      responseTypes: [...OIDC_RESPONSE_TYPES],
      tokenEndpointAuthMethod: 'none',
      requirePKCE: true,
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
      public: false,
      redirectUris: [
        // Server-side relay: the OIDC redirect lands on the server, which
        // serves an HTML page that forwards the code to the Electron
        // loopback via JS fetch(). The loopback port is encoded in the
        // `state` parameter. This avoids navigating the browser to a
        // loopback URL and removes the need for per-port redirect URIs.
        `${env.API_SERVER_URL}/api/auth/oidc/electron-callback`,
      ],
      scopes: [...OIDC_SCOPES],
      grantTypes: [...OIDC_GRANT_TYPES],
      responseTypes: [...OIDC_RESPONSE_TYPES],
      tokenEndpointAuthMethod: 'client_secret_post',
      requirePKCE: true,
      skipConsent: true,
    })
  }

  // Capacitor mobile app — public client (no secret, PKCE only).
  // Same reasoning as Web: native WebView cannot safely store secrets.
  if (env.OIDC_CLIENT_ID_POCKET) {
    clients.push({
      clientId: env.OIDC_CLIENT_ID_POCKET,
      name: 'AIRI Stage Mobile',
      type: 'native',
      public: true,
      redirectUris: [
        'capacitor://localhost/auth/callback',
      ],
      scopes: [...OIDC_SCOPES],
      grantTypes: [...OIDC_GRANT_TYPES],
      responseTypes: [...OIDC_RESPONSE_TYPES],
      tokenEndpointAuthMethod: 'none',
      requirePKCE: true,
      skipConsent: true,
    })
  }

  return clients
}

/**
 * Hash a client secret the same way oauthProvider does internally.
 *
 * NOTICE: oauthProvider defaults to `storeClientSecret: "hashed"` when
 * the JWT plugin is enabled (our config). The internal hasher is
 * `SHA-256(secret) → base64url(no padding)`. We replicate this so that
 * secrets seeded via raw INSERT match what the plugin expects during
 * token exchange validation.
 */
async function hashClientSecret(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  )
  // base64url encode without padding — matches @better-auth/utils/base64
  return Buffer.from(hash).toString('base64url')
}

/**
 * Ensure trusted OIDC clients exist in the `oauth_client` table.
 * The oauthProvider plugin's `cachedTrustedClients` caches DB lookups, but
 * the `oauth_access_token` table has a FK to `oauth_client.client_id`.
 * Without a matching row, token INSERT fails with a constraint violation.
 *
 * Secrets are hashed before storage to match oauthProvider's default
 * `storeClientSecret: "hashed"` mode.
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

    const values = {
      clientSecret: seed.clientSecret ? await hashClientSecret(seed.clientSecret) : null,
      name: seed.name,
      type: seed.type,
      public: seed.public,
      redirectUris: seed.redirectUris,
      scopes: seed.scopes,
      grantTypes: seed.grantTypes,
      responseTypes: seed.responseTypes,
      tokenEndpointAuthMethod: seed.tokenEndpointAuthMethod,
      requirePKCE: seed.requirePKCE,
      skipConsent: seed.skipConsent,
      updatedAt: new Date(),
    }

    if (existing.length > 0) {
      // Update existing client to match current config (e.g. public ↔ confidential change)
      await db.update(authSchema.oauthClient)
        .set(values)
        .where(eq(authSchema.oauthClient.clientId, seed.clientId))
      continue
    }

    await db.insert(authSchema.oauthClient).values({
      id: crypto.randomUUID(),
      clientId: seed.clientId,
      ...values,
      disabled: false,
      createdAt: new Date(),
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
        scopes: [...OIDC_SCOPES],
        validAudiences: [env.API_SERVER_URL],
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
