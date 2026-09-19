import type { BetterAuthPlugin } from 'better-auth'
import type { JSONWebKeySet } from 'jose'

import type { AuthEnv } from '../env'

import { createHmac } from 'node:crypto'

import { createAuthMiddleware } from 'better-auth/api'
import { array, date, looseObject, nonEmpty, nullable, object, optional, parse, pipe, regex, safeParse, string, transform } from 'valibot'

import { createOidcAccessTokenVerifier } from '../oidc-access-token'

const JwtBearerTokenSchema = pipe(
  string(),
  transform(value => value.trim()),
  regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, 'Bearer token must be a compact JWT'),
)

const StoredJwkRowSchema = object({
  id: pipe(string(), nonEmpty()),
  publicKey: pipe(string(), nonEmpty()),
  alg: optional(string()),
  crv: optional(string()),
  expiresAt: optional(nullable(date())),
})

const PublicJwkSchema = looseObject({
  kty: pipe(string(), nonEmpty()),
})

/**
 * Bridge plugin that lets better-auth's `sessionMiddleware` accept the
 * RS256 JWT access tokens minted by our own oauthProvider plugin, instead
 * of only the HMAC-signed session tokens that the stock {@link bearer}
 * plugin understands.
 *
 * Use when:
 * - Auth endpoints still need to accept access tokens minted by this
 *   service (for example profile and account-management requests). The
 *   separate resource API validates the same tokens from Auth's JWKS.
 *
 * Why a plugin (vs. per-route shims):
 * - The `before` hook fires before `sessionMiddleware`, so a single
 *   translation here lets every better-auth endpoint (current + future)
 *   accept JWTs. Per-route shims would have to be rewritten for each new
 *   endpoint we expose to OIDC clients.
 *
 * Architecture mismatch this paves over:
 * - better-auth's official OIDC story assumes the IdP and the resource
 *   server are different processes / different trust domains. The IdP
 *   issues JWTs for *external* RSes; the IdP itself only authenticates
 *   its own admin / profile API via cookies + HMAC bearer. Hosting both
 *   in one process is uncommon upstream, hence the gap.
 *
 * Mechanism:
 * 1. Detect a JWT-shaped Bearer token (3 base64url segments).
 * 2. Verify it via the local JWKS endpoint (the same RS256 keys our
 *    oauthProvider plugin signs with). If verification fails, bail out
 *    so the stock {@link bearer} plugin can still try its HMAC path.
 * 3. Mint a short-lived bridge `session` row (5 min TTL via the
 *    `override.expiresAt` parameter on `internalAdapter.createSession`).
 *    Reusing an existing OIDC-flow session would seem cheaper, but it
 *    would let a refreshed-after-sign-out JWT silently keep working
 *    until its own TTL — minting anew avoids that surprise.
 * 4. Sign the session token the same way better-auth's bearer plugin
 *    does (`serializeSignedCookie('', token, secret)` then strip the `=`),
 *    inject it as the `better-auth.session_token` cookie on the request
 *    headers, and let `sessionMiddleware` resolve from there as if a
 *    real cookie had been sent.
 *
 * NOTICE:
 * - We intentionally only run on JWT-shaped tokens. HMAC tokens (no `.`s
 *   in the obvious places, or fail JWKS verify) are passed through to
 *   the stock {@link bearer} plugin so the existing better-auth-only
 *   clients keep working.
 * - The bridge session table grows by one row per JWT-authed `/api/auth/*`
 *   request. With a 5-minute TTL the steady-state size is bounded; if
 *   that becomes load-bearing we can swap in a per-jti cache.
 * - Mirror of `bearer()`'s cookie injection trick:
 *   node_modules/better-auth/dist/plugins/bearer/index.mjs L26-58.
 *   Removal condition: better-auth ships a first-party way to verify
 *   externally-signed JWTs against a JWKS for its own session resolution.
 */
export function oidcJwtBearer(env: AuthEnv): BetterAuthPlugin {
  const verifyAccessToken = createOidcAccessTokenVerifier(env.PUBLIC_URL)

  // Bridge session lifetime. Long enough to span an OAuth round-trip
  // (link-social → provider → callback) on slow networks; short enough
  // that an unused row TTL-prunes quickly.
  const BRIDGE_SESSION_TTL_MS = 5 * 60 * 1000

  // NOTICE:
  // Local lookup avoids loopback HTTP competing for the same database pool.
  // The old self-fetch timed out during JWT-authenticated account requests.
  // Source: better-auth/dist/plugins/jwt/index.mjs.
  // Remove only if JWKS storage moves to another service.

  /**
   * Loads the public JWKS from Better Auth's database adapter.
   */
  async function loadJwks(
    adapter: { findMany: (args: { model: string }) => Promise<unknown[]> },
  ): Promise<JSONWebKeySet | null> {
    const rows = parse(array(StoredJwkRowSchema), await adapter.findMany({ model: 'jwks' }))
    const now = Date.now()
    const keys = rows
      .filter(row => !row.expiresAt || row.expiresAt.getTime() > now)
      // NOTICE:
      // Invalid stored keys must fail loudly instead of causing hidden 401s.
      // Better Auth writes this field with JSON.stringify.
      // Source: @better-auth/core/dist/plugins/jwt/utils.mjs.
      // Remove if the stored-key contract gains explicit validation.
      .map((row) => {
        const publicKey = parse(PublicJwkSchema, JSON.parse(row.publicKey))
        return {
          ...(row.alg ? { alg: row.alg } : {}),
          ...(row.crv ? { crv: row.crv } : {}),
          ...publicKey,
          kid: row.id,
        }
      })

    if (keys.length === 0)
      return null

    return { keys }
  }

  /**
   * Inline copy of `better-call`'s `signCookieValue`.
   *
   * Use when:
   * - Producing a session-token cookie value that the stock {@link bearer}
   *   plugin would also accept on the verify path.
   *
   * Format:
   * - HMAC-SHA-256 the raw value with `secret`, base64-encode the digest,
   *   join as `value.signature`, then URI-encode. Mirrors the upstream
   *   recipe at node_modules/better-call/dist/crypto.mjs L27-32.
   *
   * Why inline (not import from better-call): better-call is a transitive
   * via better-auth, not a direct dependency of the resource API. Inlining a 3-line
   * helper avoids polluting package.json with what is, semantically, an
   * internal of better-auth's bearer flow.
   */
  function signCookieValue(value: string, secret: string): string {
    const signature = createHmac('sha256', secret).update(value).digest('base64')
    return encodeURIComponent(`${value}.${signature}`)
  }

  return {
    id: 'oidc-jwt-bearer',
    hooks: {
      before: [
        {
          // Same matcher shape as bearer(). Run only when an Authorization
          // header is present so we don't pay the cost on cookie-only flows.
          matcher(context) {
            return Boolean(
              context.request?.headers.get('authorization')
              ?? context.headers?.get('authorization'),
            )
          },
          handler: createAuthMiddleware(async (c) => {
            const incomingHeaders = c.request?.headers ?? c.headers
            if (!incomingHeaders)
              return

            const authHeader = incomingHeaders.get('authorization')
            if (!authHeader)
              return

            const lower = authHeader.slice(0, 7).toLowerCase()
            if (lower !== 'bearer ')
              return

            // JWT shape: three base64url segments separated by dots. Catches
            // the happy path without us decoding; downstream JWKS verify is
            // the real gate. Anything that fails this schema falls through to
            // bearer().
            const tokenResult = safeParse(JwtBearerTokenSchema, authHeader.slice(7))
            if (!tokenResult.success)
              return
            const token = tokenResult.output

            // Verify against our own JWKS, read directly from DB (no
            // self-fetch). If it isn't ours (signature mismatch, wrong
            // issuer, expired) we silently skip and let bearer() try —
            // that path is the only one that knows how to accept
            // HMAC-signed better-auth session tokens.
            const adapter = c.context.adapter as {
              findMany: (args: { model: string }) => Promise<unknown[]>
            }
            const claims = await verifyAccessToken(token, () => loadJwks(adapter))
            if (!claims)
              return

            const userId = claims.sub

            // Mint a bridge session bound to this user. The override sets
            // a short TTL so abandoned bridge rows self-prune; the second
            // arg `undefined` keeps `dontRememberMe` at its default.
            const expiresAt = new Date(Date.now() + BRIDGE_SESSION_TTL_MS)
            const bridgeSession = await c.context.internalAdapter.createSession(
              userId,
              undefined,
              { expiresAt },
            )
            if (!bridgeSession?.token)
              return

            // Format the session token exactly like bearer() expects it
            // when the cookie comes back in (see plugin source above).
            const signedValue = signCookieValue(bridgeSession.token, c.context.secret)

            const cookieName = c.context.authCookies.sessionToken.name
            const newCookieEntry = `${cookieName}=${signedValue}`

            // Clone headers so we don't mutate the caller's. Append our
            // cookie to whatever was already there (mostly nothing for
            // Bearer-only stage-web; possibly other cookies in mixed flows).
            const newHeaders = new Headers(incomingHeaders)
            const existingCookie = newHeaders.get('cookie')
            newHeaders.set(
              'cookie',
              existingCookie ? `${existingCookie}; ${newCookieEntry}` : newCookieEntry,
            )

            return { context: { headers: newHeaders } }
          }),
        },
      ],
    },
  }
}
