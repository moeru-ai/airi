import type { AuthMetrics } from '../otel'
import type { EmailService } from '../services/email'
import type { UserDeletionService } from '../services/user-deletion'
import type { Database } from './db'
import type { Env } from './env'

import { Buffer } from 'node:buffer'

import { oauthProvider } from '@better-auth/oauth-provider'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import { bearer, jwt, magicLink } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'

import { ApiError } from '../utils/error'
import { getAuthTrustedOrigins, getTrustedOrigin } from '../utils/origin'
import { oidcJwtBearer } from './auth-plugins/oidc-jwt-bearer'

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
  /**
   * Enables RP-Initiated Logout via `/api/auth/oauth2/end-session`.
   *
   * NOTICE: also gates whether the issued ID token carries the `sid` claim
   * (see oauth-provider/dist/index.mjs L308: `sid: client.enableEndSession ? sessionId : void 0`).
   * `sid` is required by the end-session handler, so this flag is the single
   * switch that lets a Bearer-only OIDC client log out without depending on
   * cross-site session cookies.
   */
  enableEndSession: boolean
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
    enableEndSession: true,
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
    enableEndSession: true,
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
    enableEndSession: true,
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
      enableEndSession: seed.enableEndSession,
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

/**
 * Throws when an email-driven Better Auth callback fires without an EmailService.
 *
 * NOTICE:
 * `EmailService` is optional on `createAuth` so contexts that never exercise
 * email flows (e.g. `pnpm run auth:generate` schema introspection) can run
 * without a Resend key. Each callback that needs the service guards on it via
 * `requireEmailService(email)`. The error is surfaced to the HTTP caller so
 * the misconfiguration is loud instead of silent.
 */
function requireEmailService(email: EmailService | undefined): EmailService {
  if (!email) {
    throw new ApiError(
      503,
      'email/service_not_configured',
      'Email service not available in this server context.',
    )
  }
  return email
}

/**
 * NOTICE:
 * `userDeletionService` is optional for the same reason `email` is — the
 * `auth:generate` schema introspection path constructs `createAuth` without
 * a real DI graph and never exercises `user.deleteUser`. The runtime path
 * always supplies it from `app.ts`, and the `beforeDelete` callback throws
 * if it's missing so silent no-ops are impossible.
 */
function requireUserDeletionService(service: UserDeletionService | undefined): UserDeletionService {
  if (!service) {
    throw new ApiError(
      503,
      'user-deletion/service_not_configured',
      'User deletion service not available in this server context.',
    )
  }
  return service
}

export function createAuth(
  db: Database,
  env: Env,
  email?: EmailService,
  metrics?: AuthMetrics | null,
  userDeletionService?: UserDeletionService,
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
      // NOTICE:
      // Bridges OIDC JWT access tokens (RS256, signed by our oauthProvider)
      // into a real better-auth session so `sessionMiddleware` and every
      // downstream `/api/auth/*` endpoint accept them. Must run after
      // bearer() so we don't intercept HMAC session tokens that bearer()
      // already handles. See libs/auth-plugins/oidc-jwt-bearer.ts for the
      // architectural mismatch this paves over.
      oidcJwtBearer(env),
      magicLink({
        // NOTICE: better-auth's magic-link callback receives a server-side
        // verification URL ({baseURL}/magic-link/verify?token=...&callbackURL=...).
        // The user clicks → server validates → 302s to callbackURL with session
        // cookie set. UI page only needs to receive the redirect; no token
        // handling required there.
        async sendMagicLink({ email: address, url }) {
          await requireEmailService(email).sendMagicLink({ to: address, url })
        },
      }),
      oauthProvider({
        // Keep loginPage inside the ui-server-auth vue-router base (`/auth/`)
        // so the OIDC redirect lands on a URL the SPA router actually owns.
        // Without the prefix the address bar stays on bare `/sign-in`, which
        // is outside vue-router's history base — SPA-internal `router.push`
        // later jumps to `/auth/...`, and a refresh of the bare URL would
        // fall through to the global 404.
        loginPage: '/auth/sign-in',
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
      // Block sign-in until the user proves they own the address. Social
      // logins (Google/GitHub) bypass this because better-auth seeds
      // emailVerified=true for OAuth-issued accounts.
      requireEmailVerification: true,
      async sendResetPassword({ user, url }) {
        await requireEmailService(email).sendPasswordReset({ to: user.email, url })
      },
      // NOTICE:
      // Why: clicking the password-reset link is itself proof that the user
      // controls the address, so emailVerified must be true after a successful
      // reset. Without this, social-only users who later set a password via
      // "forgot password" stay stuck with emailVerified=false (better-auth's
      // /reset-password handler only writes the password, see
      // node_modules/better-auth/dist/api/routes/password.mjs L120-166) and
      // get rejected on the next email/password sign-in by
      // `requireEmailVerification: true`.
      // Removal condition: better-auth flips emailVerified itself on reset.
      async onPasswordReset({ user }) {
        if (user.emailVerified)
          return
        await db.update(authSchema.user)
          .set({ emailVerified: true, updatedAt: new Date() })
          .where(eq(authSchema.user.id, user.id))
      },
    },

    emailVerification: {
      // Trigger sendVerificationEmail automatically on sign-up so the frontend
      // doesn't need to make a follow-up call. requireEmailVerification above
      // already enforces this on its own, but sendOnSignUp keeps behavior
      // explicit if requireEmailVerification ever gets toggled off.
      sendOnSignUp: true,
      // NOTICE: Establish a session cookie when the user clicks the
      // verification link, so they don't have to re-enter the password they
      // just chose. The original tab (still on the verify-email pending page)
      // detects the new session via polling and resumes the OIDC handoff.
      // Source: node_modules/better-auth/dist/api/routes/email-verification.mjs L268+
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        await requireEmailService(email).sendVerification({ to: user.email, url })
      },
    },

    user: {
      changeEmail: {
        enabled: true,
        // NOTICE:
        // Better Auth fires sendChangeEmailConfirmation against the *current*
        // email address before the change is committed. Send to user.email
        // (current) so the owner of the existing account confirms the move;
        // sending to newEmail would let an attacker who only controls newEmail
        // confirm a takeover.
        // Source: node_modules/better-auth/dist/api/routes/update-user.mjs L468-475
        async sendChangeEmailConfirmation({ user, newEmail, url }) {
          await requireEmailService(email).sendChangeEmailConfirmation({
            to: user.email,
            newEmail,
            url,
          })
        },
      },
      // NOTICE:
      // Two-step deletion: POST /api/auth/delete-user with an authenticated
      // session triggers `sendDeleteAccountVerification`; clicking the link
      // hits GET /api/auth/delete-user/callback?token=..., which validates
      // and calls `beforeDelete` BEFORE `internalAdapter.deleteUser`. Throw
      // from `beforeDelete` to abort: the user row stays put, the
      // verification token has already been consumed (single-use) so the
      // user must re-initiate. Soft-delete handlers must be idempotent
      // because retrying a partial deletion re-runs already-completed
      // handlers as no-ops.
      // Source: node_modules/better-auth/dist/api/routes/update-user.mjs L286-380
      // Design: apps/server/docs/ai-context/account-deletion.md
      deleteUser: {
        enabled: true,
        async sendDeleteAccountVerification({ user, url }) {
          await requireEmailService(email).sendDeleteAccountVerification({
            to: user.email,
            url,
          })
        },
        async beforeDelete(user) {
          await requireUserDeletionService(userDeletionService).softDeleteAll({
            userId: user.id,
            reason: 'user-requested',
          })
        },
      },
    },

    session: {
      // NOTICE: oauthProvider's oauth_access_token table has a FK to the session
      // table. Without DB-backed sessions the FK INSERT fails when issuing tokens.
      storeSessionInDatabase: true,

      // NOTICE:
      // cookieCache is intentionally OFF.
      //
      // Why: with cookieCache enabled, the signed sessionData cookie keeps a
      // "valid session" view for up to maxAge seconds even after the DB row is
      // gone. /oauth2/end-session deletes the DB session row but does not
      // expire that cookie (oauth-provider/dist/index.mjs L1069-1090 only calls
      // internalAdapter.deleteSession). The next /oauth2/authorize then reads
      // the cached session via getSessionFromCtx (better-auth/dist/api/routes/session.mjs L93+),
      // binds an authorization code to the deleted session.id, and /oauth2/token
      // fails with `invalid_request: session no longer exists`
      // (oauth-provider/dist/index.mjs L557-567) — locking users out for the
      // entire cookieCache TTL window after each logout.
      //
      // Trade-off: every getSession / authorize now hits the DB once. With the
      // current AIRI flow the cost is negligible: cookie-based /get-session is
      // only used by ui-server-auth pages, and /oauth2/authorize is rare.
      // Bearer-token sessions (the hot path for stage-web/electron/pocket) bypass
      // this entirely via libs/request-auth.ts.
      //
      // Removal condition: oauth-provider's end-session itself clears session
      // cookies upstream, OR cookieCache TTL is reduced to a window short
      // enough that "session no longer exists" is not user-visible.
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
        // NOTICE:
        // Why: better-auth's google provider already maps email_verified
        // through, but a stale Google profile that omits the claim falls
        // through to undefined → false. Default to true defensively so the
        // requireEmailVerification gate in emailAndPassword above doesn't
        // reject legitimate Google-OAuth users on a follow-up password sign-in.
        // Source: node_modules/@better-auth/core/dist/social-providers/google.mjs L95.
        // Removal condition: never — Google emails are always verified before
        // OAuth issuance, so the override is correct in all cases.
        mapProfileToUser: profile => ({
          emailVerified: profile.email_verified ?? true,
        }),
      },
      github: {
        clientId: env.AUTH_GITHUB_CLIENT_ID,
        clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
        // NOTICE:
        // Why: better-auth derives emailVerified from the GitHub /user/emails
        // response, but `emails.find(e => e.email === profile.email)?.verified`
        // returns undefined when GitHub returns the noreply proxy email
        // (`<id>+<login>@users.noreply.github.com`) which is not present in
        // the /user/emails list. The result is `?? false`, leaving brand-new
        // GitHub users at emailVerified=false → blocked from email/password
        // sign-in after a password reset.
        // Source: node_modules/@better-auth/core/dist/social-providers/github.mjs L77.
        // Removal condition: GitHub OAuth itself enforces a verified email
        // before authorization, so forcing true is safe and matches the
        // upstream invariant. Drop only if better-auth fixes the noreply
        // lookup.
        mapProfileToUser: () => ({ emailVerified: true }),
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

        // NOTICE:
        // OIDC RP-Initiated Logout (/oauth2/end-session) only deletes the DB session
        // row via internalAdapter.deleteSession; it does NOT expire the
        // sessionToken / sessionData cookies. With cookieCache.enabled=true the
        // signed sessionData cookie keeps a stale "valid session" view alive
        // for up to maxAge seconds. The next /oauth2/authorize then picks up
        // the cached old session, binds the auth code to a now-deleted
        // session.id, and /oauth2/token fails with "session no longer exists".
        // We mirror /sign-out's deleteSessionCookie call here so RP-Initiated
        // Logout fully invalidates client-visible session state.
        // Source: node_modules/@better-auth/oauth-provider/dist/index.mjs L1069-1090
        // (deleteSession only) vs node_modules/better-auth/dist/api/routes/sign-out.mjs L19-27.
        // Removal condition: oauth-provider's end-session itself starts clearing
        // session cookies upstream.
        if (ctx.path === '/oauth2/end-session')
          deleteSessionCookie(ctx)
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
          },
        },
      },
    },
  })
}

export type AuthInstance = ReturnType<typeof createAuth>
