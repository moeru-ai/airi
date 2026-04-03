import type auth from '../scripts/auth'
import type { AuthInstance } from './auth'
import type { Env } from './env'

import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface RequestAuthSession {
  user: typeof auth.$Infer.Session.user
  session: typeof auth.$Infer.Session.session
}

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    return null

  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null

function getJWKS(env: Env): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(
      new URL('/api/auth/jwks', env.API_SERVER_URL),
    )
  }
  return cachedJWKS
}

/**
 * Verify a JWT access token issued by the OIDC provider.
 * Uses local signature verification via JWKS — no database query for the token itself.
 * Still requires one findUserById call to build the full RequestAuthSession.
 */
async function resolveJWTAccessToken(
  auth: AuthInstance,
  env: Env,
  accessToken: string,
): Promise<RequestAuthSession | null> {
  try {
    const jwks = getJWKS(env)
    // NOTICE: better-auth's jwt() plugin sets issuer to the full baseURL
    // including the path prefix (e.g. "http://localhost:3000/api/auth"),
    // not just the server origin.
    const { payload } = await jwtVerify(accessToken, jwks, {
      issuer: `${env.API_SERVER_URL}/api/auth`,
      audience: env.API_SERVER_URL,
    })

    if (!payload.sub)
      return null

    const ctx = await auth.$context
    const user = await ctx.internalAdapter.findUserById(payload.sub)
    if (!user)
      return null

    return {
      user,
      session: {
        id: payload.jti ?? payload.sub,
        token: accessToken,
        userId: payload.sub,
        createdAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
        updatedAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(),
        ipAddress: null,
        userAgent: null,
      },
    }
  }
  catch {
    return null
  }
}

export async function resolveRequestAuth(
  auth: AuthInstance,
  env: Env,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const session = await auth.api.getSession({ headers })
  if (session?.user && session?.session)
    return session

  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  return await resolveJWTAccessToken(auth, env, accessToken)
}
