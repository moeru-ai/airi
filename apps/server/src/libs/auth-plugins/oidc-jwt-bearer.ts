import type { BetterAuthPlugin } from 'better-auth'
import type { JSONWebKeySet } from 'jose'

import type { Env } from '../env'

import { createHmac } from 'node:crypto'

import { createAuthMiddleware } from 'better-auth/api'
import { createLocalJWKSet, jwtVerify } from 'jose'

/**
 * Bridge plugin that lets better-auth's `sessionMiddleware` accept the
 * RS256 JWT access tokens minted by our own oauthProvider plugin, instead
 * of only the HMAC-signed session tokens that the stock {@link bearer}
 * plugin understands.
 *
 * Use when:
 * - The same Hono app hosts both the OIDC IdP (oauthProvider) and the
 *   resource server (`/api/v1/*`, `/api/auth/*`). Stage-web / Electron /
 *   Pocket clients carry an OIDC JWT for everything; without this plugin
 *   their `Authorization: Bearer <jwt>` is silently rejected by every
 *   `/api/auth/*` endpoint that needs `c.context.session`.
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
export function oidcJwtBearer(env: Env): BetterAuthPlugin {
  // JWT shape: three base64url segments separated by dots. Catches the
  // happy path without us decoding; downstream JWKS verify is the real
  // gate. Anything that fails this regex falls through to bearer().
  const JWT_SHAPE_RE = /^[\w-]+\.[\w-]+\.[\w-]+$/

  // Bridge session lifetime. Long enough to span an OAuth round-trip
  // (link-social → provider → callback) on slow networks; short enough
  // that an unused row TTL-prunes quickly.
  const BRIDGE_SESSION_TTL_MS = 5 * 60 * 1000

  // Process-local JWKS cache.
  //
  // NOTICE:
  // Why local (not `createRemoteJWKSet`): we are the JWKS endpoint. Using
  // jose's remote variant would loopback-fetch `/api/auth/jwks` on the same
  // process, which both costs 5+ seconds in slow-DB environments AND
  // contends for the same Postgres connection pool we're already inside —
  // observed as 5s `Connection terminated due to connection timeout` from
  // the `jwks` SELECT during a JWT-authed `/api/auth/list-accounts`. We
  // read the jwks table directly via the better-auth adapter and assemble
  // the JWKS in-process. Cached for 60s so steady-state traffic is
  // effectively no-op; rotations propagate within a minute.
  // Source: better-auth jwt plugin endpoint that builds the same shape:
  //   node_modules/better-auth/dist/plugins/jwt/index.mjs L102-129.
  // Removal condition: never — local JWKS is the right primitive when the
  // server *is* the IdP. Only revisit if jwks ever moves out of process.
  const JWKS_TTL_MS = 60 * 1000
  let cachedKeySet: ReturnType<typeof createLocalJWKSet> | null = null
  let cachedAt = 0

  interface JwkRow {
    id: string
    publicKey: string
    alg?: string
    crv?: string
    expiresAt?: Date | null
  }

  /**
   * Build (or reuse) the local JWKS resolver from rows in the `jwks` table.
   *
   * Use when:
   * - About to verify a JWT inside this plugin and we need an up-to-date
   *   `JWKSLike` callable for `jwtVerify`.
   *
   * Expects:
   * - `c.context.adapter.findMany({ model: 'jwks' })` returns a list of
   *   rows shaped like {@link JwkRow}.
   *
   * Returns:
   * - The same `createLocalJWKSet` callable on cache hit; freshly assembled
   *   one on miss / expiry. Returns `null` if no keys are present (better
   *   to bail than to lock everyone out — bearer() may still succeed).
   */
  async function getOrLoadJWKS(
    adapter: { findMany: (args: { model: string }) => Promise<unknown[]> },
  ): Promise<ReturnType<typeof createLocalJWKSet> | null> {
    if (cachedKeySet && Date.now() - cachedAt < JWKS_TTL_MS)
      return cachedKeySet

    const rows = await adapter.findMany({ model: 'jwks' }) as JwkRow[]
    const now = Date.now()
    const keys = rows
      .filter(row => !row.expiresAt || row.expiresAt.getTime() > now)
      // NOTICE:
      // `JSON.parse` is intentionally not wrapped in try/catch. The
      // `publicKey` column is written exclusively by better-auth's jwt
      // plugin via `JSON.stringify(publicWebKey)` (see
      // node_modules/@better-auth/core/dist/plugins/jwt/utils.mjs L30, L50)
      // — i.e. data we ourselves serialised. A parse failure means the
      // table is corrupt or upstream's serialisation contract has
      // shifted, and both are exactly the cases that should fail loud
      // (5xx + alert) rather than be silently skipped, which would
      // 401 every JWT signed with the dropped key and bury the root
      // cause. PR #1753 review suggested adding the try/catch; declined
      // for the reason above.
      .map((row) => {
        const publicKey = JSON.parse(row.publicKey) as Record<string, unknown>
        return {
          ...(row.alg ? { alg: row.alg } : {}),
          ...(row.crv ? { crv: row.crv } : {}),
          ...publicKey,
          kid: row.id,
        }
      })

    if (keys.length === 0)
      return null

    const jwks: JSONWebKeySet = { keys: keys as JSONWebKeySet['keys'] }
    cachedKeySet = createLocalJWKSet(jwks)
    cachedAt = Date.now()
    return cachedKeySet
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
   * via better-auth, not a direct dep of apps/server. Inlining a 3-line
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

            const token = authHeader.slice(7).trim()
            if (!token || !JWT_SHAPE_RE.test(token))
              return

            // Verify against our own JWKS, read directly from DB (no
            // self-fetch). If it isn't ours (signature mismatch, wrong
            // issuer, expired) we silently skip and let bearer() try —
            // that path is the only one that knows how to accept
            // HMAC-signed better-auth session tokens.
            const adapter = c.context.adapter as {
              findMany: (args: { model: string }) => Promise<unknown[]>
            }
            const keySet = await getOrLoadJWKS(adapter)
            if (!keySet)
              return

            let userId: string
            try {
              const { payload } = await jwtVerify(token, keySet, {
                issuer: `${env.API_SERVER_URL}/api/auth`,
                audience: env.API_SERVER_URL,
              })
              if (typeof payload.sub !== 'string')
                return
              userId = payload.sub
            }
            catch {
              return
            }

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
