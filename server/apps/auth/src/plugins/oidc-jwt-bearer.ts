import type { AuthSession } from '@proj-airi/auth-shared'
import type { BetterAuthPlugin } from 'better-auth'
import type { JSONWebKeySet } from 'jose'

import type { AuthEnv } from '../env'

import { createHmac } from 'node:crypto'

import { isUserBannedNow } from '@proj-airi/auth-shared'
import { APIError } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { array, boolean, date, looseObject, nonEmpty, nullable, object, optional, parse, pipe, regex, safeParse, string, transform } from 'valibot'

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

const ResolvedUserSchema = object({
  id: pipe(string(), nonEmpty()),
  name: string(),
  email: pipe(string(), nonEmpty()),
  emailVerified: boolean(),
  image: optional(nullable(string())),
  banned: optional(nullable(boolean())),
  banReason: optional(nullable(string())),
  banExpires: optional(nullable(date())),
  lastSeenAt: optional(nullable(date())),
  createdAt: date(),
  updatedAt: date(),
})

const PersistedSessionSchema = object({
  id: pipe(string(), nonEmpty()),
  token: pipe(string(), nonEmpty()),
  userId: pipe(string(), nonEmpty()),
  expiresAt: date(),
  createdAt: date(),
  updatedAt: date(),
  ipAddress: optional(nullable(string())),
  userAgent: optional(nullable(string())),
})

/**
 * Resolves locally issued RS256 access tokens as request-scoped Better Auth
 * identity. An active original `sid` preserves authoritative checks for
 * sensitive operations. Without one, the token only authorizes ordinary
 * session middleware. HMAC bearer tokens keep their stock path.
 */
export function oidcJwtBearer(env: AuthEnv): BetterAuthPlugin {
  const verifyAccessToken = createOidcAccessTokenVerifier(env.PUBLIC_URL)

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
            const sessionId = claims.sid ?? null
            const tokenId = claims.jti ?? null
            const accessTokenExpiresAt = new Date(claims.exp * 1000)

            const resolvedUserResult = safeParse(
              ResolvedUserSchema,
              await c.context.internalAdapter.findUserById(userId),
            )
            if (!resolvedUserResult.success)
              return
            const resolvedUser = resolvedUserResult.output
            if (isUserBannedNow(resolvedUser)) {
              throw APIError.from('FORBIDDEN', {
                code: 'BANNED_USER',
                message: 'This account has been banned',
              })
            }

            const persistedSessionResult = sessionId
              ? await c.context.adapter.findOne({
                  model: 'session',
                  where: [
                    { field: 'id', value: sessionId },
                    { field: 'userId', value: userId },
                  ],
                })
              : null
            const parsedSession = safeParse(PersistedSessionSchema, persistedSessionResult)
            const persistedSession = parsedSession.success ? parsedSession.output : null

            const activeSession = persistedSession && persistedSession.expiresAt > new Date()
              ? persistedSession
              : null

            // A request-only identity must never look fresh. Endpoints guarded
            // by freshSessionMiddleware will reject this epoch timestamp when
            // the JWT has no active original session.
            const requestSession: AuthSession['session'] = activeSession ?? {
              id: tokenId ?? `jwt:${userId}`,
              token,
              userId,
              createdAt: new Date(0),
              updatedAt: new Date(0),
              expiresAt: accessTokenExpiresAt,
              ipAddress: null,
              userAgent: null,
            }

            if (!activeSession) {
              return {
                context: {
                  session: { session: requestSession, user: resolvedUser },
                },
              }
            }

            // NOTICE:
            // Sensitive middleware only trusts a signed session cookie.
            // Better Auth has no hook for an external JWT verifier here.
            // Source: better-auth/dist/api/routes/session.mjs.
            // Remove when upstream accepts verified JWT identity directly.
            const signedValue = signCookieValue(activeSession.token, c.context.secret)

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

            return {
              context: {
                headers: newHeaders,
                session: { session: requestSession, user: resolvedUser },
              },
            }
          }),
        },
      ],
    },
  }
}
