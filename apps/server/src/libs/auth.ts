import type { EmailService } from '../services/email'
import type { R2StorageService } from '../services/r2'
import type { Database } from './db'
import type { Env } from './env'
import type { AuthMetrics } from './otel'

import { Buffer } from 'node:buffer'

import { oauthProvider } from '@better-auth/oauth-provider'
import { useLogger } from '@guiiai/logg'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { bearer, jwt } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'

import { user as userTable } from '../schemas/accounts'
import { createForbiddenError } from '../utils/error'
import { gravatarUrl } from '../utils/gravatar'
import { getAuthTrustedOrigins, getTrustedOrigin } from '../utils/origin'

import * as authSchema from '../schemas/accounts'

interface TrustedClientSeed {
  clientId: string
  /** Omit for public clients — only confidential clients need a secret. */
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

export interface TrustedClientSeedSummary {
  clientId: string
  name: string
  redirectUris: string[]
}

const OIDC_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const
const OIDC_GRANT_TYPES = ['authorization_code', 'refresh_token'] as const
const OIDC_RESPONSE_TYPES = ['code'] as const
export const OIDC_CLIENT_ID_WEB = 'airi-stage-web'
export const OIDC_CLIENT_ID_ELECTRON = 'airi-stage-electron'
export const OIDC_CLIENT_ID_POCKET = 'airi-stage-pocket'
const logger = useLogger('auth-hooks')

const DEFAULT_WEB_REDIRECT_URIS = [
  'https://airi.moeru.ai/auth/callback',
  'http://localhost:5173/auth/callback',
  'http://localhost:4173/auth/callback',
]

/**
 * Build redirect URIs for the web OIDC client.
 * Includes the default set plus any derived from API_SERVER_URL for
 * colocated dev/preview deployments.
 */
function buildWebRedirectUris(env: Env): string[] {
  const uris = new Set(DEFAULT_WEB_REDIRECT_URIS)

  // If API_SERVER_URL has a different origin (e.g. a dev branch deployment),
  // add its /auth/callback so OIDC redirect validation passes.
  try {
    const apiOrigin = new URL(env.API_SERVER_URL).origin
    const derived = `${apiOrigin}/auth/callback`
    if (!uris.has(derived))
      uris.add(derived)
  }
  catch {
    // Invalid API_SERVER_URL — skip
  }

  return [...uris]
}

function buildTrustedWebRedirectUri(redirectUri: string): string | null {
  try {
    const parsed = new URL(redirectUri)
    if (parsed.pathname !== '/auth/callback')
      return null

    const trustedOrigin = getTrustedOrigin(parsed.origin)
    if (!trustedOrigin)
      return null

    return `${trustedOrigin}/auth/callback`
  }
  catch {
    return null
  }
}

function buildTrustedElectronRedirectUri(request: Request, redirectUri: string): string | null {
  try {
    const requestUrl = new URL(request.url)
    const parsed = new URL(redirectUri)

    if (parsed.origin !== requestUrl.origin)
      return null

    if (parsed.pathname !== '/api/auth/oidc/electron-callback')
      return null

    return `${requestUrl.origin}/api/auth/oidc/electron-callback`
  }
  catch {
    return null
  }
}

/**
 * Build the list of first-party OIDC clients to seed into the database.
 */
function buildTrustedClientSeeds(env: Env): TrustedClientSeed[] {
  const clients: TrustedClientSeed[] = []
  clients.push({
    clientId: OIDC_CLIENT_ID_WEB,
    name: 'AIRI Stage Web',
    type: 'web',
    public: true,
    redirectUris: buildWebRedirectUris(env),
    scopes: [...OIDC_SCOPES],
    grantTypes: [...OIDC_GRANT_TYPES],
    responseTypes: [...OIDC_RESPONSE_TYPES],
    tokenEndpointAuthMethod: 'none',
    requirePKCE: true,
    skipConsent: true,
  })

  // Electron desktop app — public client (installed app, PKCE only).
  // The binary is user-controlled, so a bundled client_secret would only be
  // obfuscation, not a meaningful confidentiality boundary.
  clients.push({
    clientId: OIDC_CLIENT_ID_ELECTRON,
    name: 'AIRI Stage Desktop',
    type: 'native',
    public: true,
    redirectUris: [
      `${env.API_SERVER_URL}/api/auth/oidc/electron-callback`,
    ],
    scopes: [...OIDC_SCOPES],
    grantTypes: [...OIDC_GRANT_TYPES],
    responseTypes: [...OIDC_RESPONSE_TYPES],
    tokenEndpointAuthMethod: 'none',
    requirePKCE: true,
    skipConsent: true,
  })

  // Capacitor mobile app — public client (no secret, PKCE only).
  // Same reasoning as Web: native WebView cannot safely store secrets.
  clients.push({
    clientId: OIDC_CLIENT_ID_POCKET,
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

  return clients
}

export function getTrustedClientSeedSummaries(env: Env): TrustedClientSeedSummary[] {
  return buildTrustedClientSeeds(env).map(seed => ({
    clientId: seed.clientId,
    name: seed.name,
    redirectUris: [...seed.redirectUris],
  }))
}

export function getTrustedOIDCClientIds(): string[] {
  return [OIDC_CLIENT_ID_WEB, OIDC_CLIENT_ID_ELECTRON, OIDC_CLIENT_ID_POCKET]
}

export async function ensureDynamicFirstPartyRedirectUri(
  db: Database,
  request: Request,
): Promise<void> {
  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  const redirectUri = url.searchParams.get('redirect_uri')

  if (!clientId || !redirectUri)
    return

  let normalizedRedirectUri: string | null = null

  switch (clientId) {
    case OIDC_CLIENT_ID_WEB:
      normalizedRedirectUri = buildTrustedWebRedirectUri(redirectUri)
      break
    case OIDC_CLIENT_ID_ELECTRON:
      normalizedRedirectUri = buildTrustedElectronRedirectUri(request, redirectUri)
      break
  }

  if (!normalizedRedirectUri)
    return

  const [existing] = await db
    .select({ redirectUris: authSchema.oauthClient.redirectUris })
    .from(authSchema.oauthClient)
    .where(eq(authSchema.oauthClient.clientId, clientId))
    .limit(1)

  if (!existing?.redirectUris || existing.redirectUris.includes(normalizedRedirectUri))
    return

  await db.update(authSchema.oauthClient)
    .set({
      redirectUris: [...existing.redirectUris, normalizedRedirectUri],
      updatedAt: new Date(),
    })
    .where(eq(authSchema.oauthClient.clientId, clientId))
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

export function createAuth(
  db: Database,
  env: Env,
  emailService: EmailService,
  r2StorageService: R2StorageService,
  metrics?: AuthMetrics | null,
) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,

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
        accessTokenExpiresIn: 3600,
        // NOTICE: do not enable cachedTrustedClients here.
        // The oauth-provider plugin caches the full oauth_client row in-process,
        // including redirectUris. We mutate redirectUris at runtime for trusted
        // first-party clients, so caching would leave the current process with a
        // stale redirect allowlist and cause invalid_redirect failures until restart.
      }),
    ],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, token }: { user: { email: string }, token: string }) => {
        const url = `${env.CLIENT_URL}/auth/reset-password?token=${encodeURIComponent(token)}`
        const { subject, html } = emailService.passwordResetEmail(url)
        void emailService.sendEmail({ to: user.email, subject, html })
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, token }: { user: { email: string }, token: string }) => {
        const url = `${env.CLIENT_URL}/auth/verify-email?token=${encodeURIComponent(token)}`
        const { subject, html } = emailService.emailVerificationEmail(url)
        void emailService.sendEmail({ to: user.email, subject, html })
      },
    },

    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailVerification: async ({ newEmail, token }: { user: { email: string }, newEmail: string, token: string }) => {
          const url = `${env.CLIENT_URL}/auth/verify-email?token=${encodeURIComponent(token)}`
          const { subject, html } = emailService.changeEmailVerificationEmail(url)
          void emailService.sendEmail({ to: newEmail, subject, html })
        },
      },
    },

    session: {
      // NOTICE: oauthProvider's oauth_access_token table has a FK to the session
      // table. Without DB-backed sessions the FK INSERT fails when issuing tokens.
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
          after: async (user) => {
            metrics?.userRegistered.add(1)

            // Fire-and-forget avatar processing: never block user creation.
            void (async () => {
              try {
                // Users without an OAuth-provided image get a Gravatar URL
                // assigned directly. No R2 dependency needed because Gravatar
                // serves the image and gracefully falls back to the
                // `?d=identicon` default for emails without a profile.
                if (!user.image) {
                  await db.update(userTable)
                    .set({ image: gravatarUrl(user.email) })
                    .where(eq(userTable.id, user.id))
                  return
                }

                // OAuth-provided avatars: mirror to R2 when configured so we
                // do not depend on the provider's CDN long-term. Skip the
                // mirror when R2 is unavailable; the OAuth URL stays in DB.
                if (!r2StorageService.isAvailable())
                  return

                // NOTICE:
                // External avatar URLs (OAuth provider CDN) may hang. Cap at 5s
                // so this fire-and-forget promise can't live indefinitely.
                // Root cause: default fetch() has no request timeout.
                // Source: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
                // Removal condition: move avatar ingestion into a queue with its own timeout policy.
                const response = await fetch(user.image, {
                  signal: AbortSignal.timeout(5000),
                })
                if (!response.ok)
                  throw new Error(`Failed to fetch avatar: ${response.status}`)

                const buffer = Buffer.from(await response.arrayBuffer())
                const contentType = response.headers.get('content-type') ?? 'image/jpeg'
                const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
                const key = `avatars/${user.id}/${Date.now()}.${ext}`
                const publicUrl = await r2StorageService.upload(key, buffer, contentType)

                await db.update(userTable)
                  .set({ image: publicUrl })
                  .where(eq(userTable.id, user.id))
              }
              catch (error) {
                logger.withError(error).error('Failed to process user avatar on registration')
              }
            })()
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Block session creation for soft-deleted users across ALL auth
            // paths (email/password, OAuth callback, OIDC bridge, admin impersonation).
            // This is the single choke point for `deletedAt` enforcement.
            const [u] = await db
              .select({ deletedAt: userTable.deletedAt })
              .from(userTable)
              .where(eq(userTable.id, session.userId))
              .limit(1)
            if (u?.deletedAt)
              throw createForbiddenError('User account has been deleted', 'USER_DELETED')
          },
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

export type AuthInstance = ReturnType<typeof createAuth>
