import type { AuthSession } from '@proj-airi/auth-shared'

import type { AuthInstance } from './auth'
import type { AuthDatabase } from './db'
import type { AuthEnv } from './env'

import { isUserBannedNow, user as userTable } from '@proj-airi/auth-shared'
import { eq } from 'drizzle-orm'
import { createRemoteJWKSet, jwtVerify } from 'jose'

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    return null

  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

const cachedJWKS = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJWKS(publicUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const jwksUrl = new URL('/api/auth/jwks', publicUrl).toString()
  const cached = cachedJWKS.get(jwksUrl)
  if (cached)
    return cached

  const jwks = createRemoteJWKSet(new URL(jwksUrl))
  cachedJWKS.set(jwksUrl, jwks)
  return jwks
}

async function resolveJwtAccessToken(
  db: AuthDatabase,
  env: Pick<AuthEnv, 'PUBLIC_URL'>,
  accessToken: string,
): Promise<AuthSession | null> {
  try {
    const { payload } = await jwtVerify(accessToken, getJWKS(env.PUBLIC_URL), {
      issuer: `${env.PUBLIC_URL}/api/auth`,
      audience: env.PUBLIC_URL,
    })
    if (!payload.sub)
      return null

    const user = await db.query.user.findFirst({
      where: eq(userTable.id, payload.sub),
    })
    if (!user)
      return null

    const issuedAt = payload.iat ? new Date(payload.iat * 1000) : new Date()
    return {
      user,
      session: {
        id: payload.jti ?? payload.sub,
        token: accessToken,
        userId: payload.sub,
        createdAt: issuedAt,
        updatedAt: issuedAt,
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

/**
 * Resolves a verified principal without applying the ban policy. The userinfo
 * guard uses this to distinguish a valid-but-banned token from an invalid one.
 */
export async function resolveSessionIgnoringBan(
  auth: AuthInstance,
  db: AuthDatabase,
  env: Pick<AuthEnv, 'PUBLIC_URL'>,
  headers: Headers,
): Promise<AuthSession | null> {
  const session = await auth.api.getSession({ headers })
  if (session?.user && session?.session)
    return session

  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  return await resolveJwtAccessToken(db, env, accessToken)
}

/** Resolves either an Auth session cookie or OIDC JWT and enforces bans. */
export async function resolveAuthRequest(
  auth: AuthInstance,
  db: AuthDatabase,
  env: Pick<AuthEnv, 'PUBLIC_URL'>,
  headers: Headers,
): Promise<AuthSession | null> {
  const resolved = await resolveSessionIgnoringBan(auth, db, env, headers)
  if (!resolved || isUserBannedNow(resolved.user))
    return null

  return resolved
}
