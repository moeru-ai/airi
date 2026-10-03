import type { JSONWebKeySet } from 'jose'
import type { InferOutput } from 'valibot'

import { createLocalJWKSet, jwtVerify } from 'jose'
import { integer, minValue, nonEmpty, number, object, optional, pipe, safeParse, string } from 'valibot'

const OidcAccessTokenClaimsSchema = object({
  sub: pipe(string(), nonEmpty()),
  exp: pipe(number(), integer(), minValue(0)),
  iat: pipe(number(), integer(), minValue(0)),
  jti: optional(pipe(string(), nonEmpty())),
  sid: optional(pipe(string(), nonEmpty())),
})

type OidcAccessTokenClaims = InferOutput<typeof OidcAccessTokenClaimsSchema>
type LoadOidcJwks = () => Promise<JSONWebKeySet | null>
type VerifyOidcAccessToken = (token: string, loadJwks: LoadOidcJwks) => Promise<OidcAccessTokenClaims | null>

/**
 * Creates an access-token verifier with a process-local JWKS cache.
 *
 * The caller owns key loading because routes use Better Auth's API, while a
 * Better Auth hook uses its request adapter. Invalid tokens return `null`.
 */
export function createOidcAccessTokenVerifier(publicUrl: string): VerifyOidcAccessToken {
  const jwksCacheTtlMs = 60 * 1000
  let cachedKeySet: ReturnType<typeof createLocalJWKSet> | null = null
  let cachedAt = 0

  return async (token, loadJwks) => {
    if (!cachedKeySet || Date.now() - cachedAt >= jwksCacheTtlMs) {
      const jwks = await loadJwks()
      if (!jwks || jwks.keys.length === 0)
        return null

      cachedKeySet = createLocalJWKSet(jwks)
      cachedAt = Date.now()
    }

    try {
      const { payload } = await jwtVerify(token, cachedKeySet, {
        issuer: `${publicUrl}/api/auth`,
        audience: publicUrl,
      })
      const parsedClaims = safeParse(OidcAccessTokenClaimsSchema, payload)
      return parsedClaims.success ? parsedClaims.output : null
    }
    catch {
      return null
    }
  }
}
