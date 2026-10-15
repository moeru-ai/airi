import type { BetterAuthPlugin } from 'better-auth'
import type { JWTVerifyGetKey } from 'jose'
import type { InferOutput } from 'valibot'

import type { AuthEnv } from '../env'

import { createHash } from 'node:crypto'

import { APIError } from 'better-auth'
import { createAuthEndpoint, createAuthMiddleware, dispatchAuthEndpoint, formCsrfMiddleware, sensitiveSessionMiddleware, signInSocial } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import { minLength, object, optional, parse, pipe, strictObject, string, ValiError } from 'valibot'

import { ApiError, createBadGatewayError, createServiceUnavailableError } from '../error'
import { assertAppleAuthorizationForDeletion, createAppleClientSecret } from '../social-authorization'

const nonempty = pipe(string(), minLength(1))
const credentialSchema = strictObject({
  identityToken: nonempty,
  authorizationCode: nonempty,
  nonce: nonempty,
  user: optional(object({ name: optional(object({ firstName: optional(string()), lastName: optional(string()) })) })),
})
const claimsSchema = object({ sub: nonempty, aud: nonempty, nonce: optional(nonempty) })
const tokensSchema = object({ access_token: nonempty, refresh_token: nonempty, id_token: nonempty })
const signInSchema = object({ token: nonempty, user: object({ id: nonempty }) })

/** Exchanges native Apple authorization and repairs only the authenticated user's existing Apple link. */
export function appleNative(env: AuthEnv, fetchRequest: typeof fetch = fetch, keys: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))): BetterAuthPlugin {
  /** Verifies both tokens against Apple and binds the one-time code to the supplied identity and nonce. */
  async function exchange(credential: InferOutput<typeof credentialSchema>) {
    /** Rejects expired tokens and identities outside the configured native applications. */
    const verify = async (token: string, requireNonce = false) => {
      const { payload } = await jwtVerify(token, keys, {
        issuer: 'https://appleid.apple.com',
        audience: env.AUTH_APPLE_APP_BUNDLE_IDENTIFIERS,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'aud', 'exp', 'iat', ...(requireNonce ? ['nonce'] : [])],
        maxTokenAge: '5m',
      })
      return parse(claimsSchema, payload)
    }
    try {
      const identity = await verify(credential.identityToken, true)
      if (identity.nonce !== createHash('sha256').update(credential.nonce).digest('hex'))
        throw new APIError('UNAUTHORIZED', { code: 'APPLE_AUTHORIZATION_FAILED', message: 'Apple nonce mismatch.' })
      if (!env.AUTH_APPLE_TEAM_ID || !env.AUTH_APPLE_KEY_ID || !env.AUTH_APPLE_PRIVATE_KEY_PEM)
        throw createServiceUnavailableError('Apple authorization is not configured.')
      const clientSecret = await createAppleClientSecret({ ...env, AUTH_APPLE_CLIENT_ID: identity.aud })
        .catch(() => { throw createServiceUnavailableError('Apple authorization is not configured.') })
      const response = await fetchRequest('https://appleid.apple.com/auth/token', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: credential.authorizationCode,
          client_id: identity.aud,
          client_secret: clientSecret,
        }),
      })
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        if (response.status === 400 && body && typeof body === 'object' && 'error' in body && body.error === 'invalid_grant')
          throw new APIError('BAD_REQUEST', { code: 'APPLE_CODE_REJECTED', message: 'Authorize with Apple again.' })
        throw createBadGatewayError('Apple code exchange failed.')
      }
      const tokens = await response.json().then(body => parse(tokensSchema, body)).catch(() => {
        throw createBadGatewayError('Apple returned an invalid token response.')
      })
      const exchanged = await verify(tokens.id_token)
      if (exchanged.sub !== identity.sub || exchanged.aud !== identity.aud || (exchanged.nonce !== undefined && exchanged.nonce !== identity.nonce))
        throw new APIError('UNAUTHORIZED', { code: 'APPLE_AUTHORIZATION_FAILED', message: 'Apple identity mismatch.' })
      return { ...tokens, subject: identity.sub }
    }
    catch (error) {
      // Preserve retryable provider failures without exposing credentials or upstream bodies.
      if (error instanceof APIError)
        throw error
      if (error instanceof ApiError)
        throw new APIError(error.statusCode === 502 ? 'BAD_GATEWAY' : 'SERVICE_UNAVAILABLE', { code: error.errorCode, message: error.message })
      if (error instanceof ValiError || error instanceof errors.JWTClaimValidationFailed || error instanceof errors.JWTExpired
        || error instanceof errors.JWSSignatureVerificationFailed || error instanceof errors.JWSInvalid
        || error instanceof errors.JWTInvalid || error instanceof errors.JOSEAlgNotAllowed
        || error instanceof errors.JWKSNoMatchingKey) {
        throw new APIError('UNAUTHORIZED', { code: 'APPLE_AUTHORIZATION_FAILED', message: 'Apple authorization failed. Try again.' })
      }
      const unavailable = createServiceUnavailableError('Apple authorization is temporarily unavailable.')
      throw new APIError('SERVICE_UNAVAILABLE', { code: unavailable.errorCode, message: unavailable.message })
    }
  }

  // Internal dispatch applies bearer/OIDC hooks without the public get-session JWT-header side effect.
  const deletionPreflight = createAuthEndpoint('/apple-deletion-preflight', {
    method: 'GET',
    use: [sensitiveSessionMiddleware],
  }, async (ctx) => {
    assertAppleAuthorizationForDeletion(await ctx.context.internalAdapter.findAccounts(ctx.context.session.user.id))
    return ctx.json({ success: true })
  })

  return {
    id: 'apple-native',
    /** Keeps token-only legacy sign-ins from changing the audience attached to a saved grant. */
    init() {
      return {
        options: {
          databaseHooks: {
            account: {
              update: {
                /** Saves an ID token's audience only together with a replacement authorization grant. */
                async before(data, ctx) {
                  if (ctx?.path === '/sign-in/social' && ctx.body?.provider === 'apple'
                    && !data.accessToken && !data.refreshToken) {
                    const { idToken: _idToken, ...unchangedGrant } = data
                    return { data: unchangedGrant }
                  }
                },
              },
            },
          },
        },
      }
    },
    hooks: {
      before: [{
        matcher: ctx => ctx.path === '/delete-user',
        // Dispatch a session read so bearer/OIDC header changes are applied before the preflight.
        handler: createAuthMiddleware(async (ctx) => {
          await dispatchAuthEndpoint(deletionPreflight, {
            ...ctx,
            method: 'GET',
            body: undefined,
            asResponse: false,
          })
        }),
      }],
    },
    endpoints: {
      signInAppleNative: createAuthEndpoint('/sign-in/apple-native', {
        method: 'POST',
        body: credentialSchema,
        use: [formCsrfMiddleware],
      }, async (ctx) => {
        const tokens = await exchange(ctx.body)
        const response = await dispatchAuthEndpoint(signInSocial(), {
          ...ctx,
          asResponse: true,
          body: { provider: 'apple', idToken: { token: ctx.body.identityToken, nonce: ctx.body.nonce, user: ctx.body.user } },
        })
        if (response instanceof Response && response.status === 401) {
          const failure: unknown = await response.clone().json()
          // The proof was already verified; Better Auth's second key lookup may have failed.
          if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'INVALID_TOKEN')
            throw new APIError('BAD_GATEWAY', { code: 'BAD_GATEWAY', message: 'Apple provider verification is temporarily unavailable.' })
        }
        if (!(response instanceof Response) || !response.ok)
          return response
        const signedIn = parse(signInSchema, await response.clone().json())
        try {
          const accounts = await ctx.context.internalAdapter.findAccounts(signedIn.user.id)
          const account = accounts.find(account => account.providerId === 'apple' && account.accountId === tokens.subject)
          if (!account)
            throw new Error('Apple account missing')
          const saved = await ctx.context.internalAdapter.updateAccount(account.id, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            idToken: tokens.id_token,
          })
          if (!saved)
            throw new Error('Apple account no longer exists')
        }
        catch {
          await ctx.context.internalAdapter.deleteSession(signedIn.token)
          throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Apple authorization could not be saved.' })
        }
        return response
      }),
      repairAppleAuthorization: createAuthEndpoint('/account/apple-authorization', {
        method: 'POST',
        body: credentialSchema,
        use: [formCsrfMiddleware, sensitiveSessionMiddleware],
      }, async (ctx) => {
        const tokens = await exchange(ctx.body)
        const { user } = ctx.context.session
        const accounts = await ctx.context.internalAdapter.findAccounts(user.id)
        const account = accounts.find(account => account.providerId === 'apple' && account.accountId === tokens.subject)
        if (!account)
          throw new APIError('FORBIDDEN', { code: 'APPLE_ACCOUNT_MISMATCH', message: 'Use the Apple account already linked to this user.' })
        const saved = await ctx.context.internalAdapter.updateAccount(account.id, {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
        })
        if (!saved)
          throw new APIError('CONFLICT', { message: 'The linked Apple account changed. Try again.' })
        const session = await ctx.context.internalAdapter.createSession(user.id)
        if (!session)
          throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not create a session.' })
        await setSessionCookie(ctx, { session, user })
        return ctx.json({ token: session.token })
      }),
    },
  }
}
