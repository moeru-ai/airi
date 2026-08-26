import type { AuthSession } from '@proj-airi/auth-shared'

import type { Database } from './db'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { isUserBannedNow } from '@proj-airi/auth-shared'
import { eq } from 'drizzle-orm'
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'

import * as authSchema from '@proj-airi/auth-shared'

export type RequestAuthSession = AuthSession

interface RequestAuthEnv {
  AUTH_SERVER_INTERNAL_URL?: string
  AUTH_SERVER_URL: string
  TEST_AUTH_TOKEN: string
  TEST_AUTH_USER_EMAIL: string
  TEST_AUTH_USER_ID: string
  TEST_AUTH_USER_NAME: string
}

interface TokenIssuerEnv {
  AUTH_SERVER_INTERNAL_URL?: string
  AUTH_SERVER_URL: string
}

function readBearerToken(headers: Headers): null | string {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    return null

  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

function resolveTestAuthToken(env: RequestAuthEnv, accessToken: string): AuthSession | null {
  if (!env.TEST_AUTH_TOKEN || !timingSafeStringEqual(accessToken, env.TEST_AUTH_TOKEN))
    return null

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000)
  return {
    session: {
      createdAt: now,
      expiresAt,
      id: `test-auth:${env.TEST_AUTH_USER_ID}`,
      ipAddress: null,
      token: accessToken,
      updatedAt: now,
      userAgent: null,
      userId: env.TEST_AUTH_USER_ID,
    } as AuthSession['session'],
    user: {
      banExpires: null,
      banned: false,
      banReason: null,
      createdAt: now,
      email: env.TEST_AUTH_USER_EMAIL.toLowerCase(),
      emailVerified: true,
      id: env.TEST_AUTH_USER_ID,
      image: null,
      lastSeenAt: now,
      name: env.TEST_AUTH_USER_NAME,
      updatedAt: now,
    } as AuthSession['user'],
  }
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const cachedJWKS = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export async function resolveRequestAuth(
  db: Database,
  env: RequestAuthEnv,
  headers: Headers,
): Promise<AuthSession | null> {
  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  const testSession = resolveTestAuthToken(env, accessToken)
  const resolved = testSession ?? await resolveJWTAccessToken(db, env, accessToken)
  if (!resolved)
    return null

  // Reject banned principals on every request. OIDC JWT access tokens are
  // stateless — verified by signature, not by a session row — so the admin
  // plugin's session.create.before hook (which only fires on login) cannot
  // invalidate a token mid-TTL. Re-checking `user.banned` here (free: the user
  // row is already loaded) is what makes a ban take effect immediately across
  // the HTTP, WebSocket, and OIDC token paths that funnel through this function.
  if (isUserBannedNow(resolved.user))
    return null

  return resolved
}

function getJWKS(env: TokenIssuerEnv): ReturnType<typeof createRemoteJWKSet> {
  const jwksUrl = new URL('/api/auth/jwks', env.AUTH_SERVER_INTERNAL_URL ?? env.AUTH_SERVER_URL).toString()
  const cached = cachedJWKS.get(jwksUrl)
  if (cached)
    return cached

  const jwks = createRemoteJWKSet(new URL(jwksUrl))
  cachedJWKS.set(jwksUrl, jwks)
  return jwks
}

/**
 * Verify a JWT access token issued by the OIDC provider.
 * Uses local signature verification via JWKS — no database query for the token itself.
 * Still requires one findUserById call to build the full RequestAuthSession.
 */
async function resolveJWTAccessToken(
  db: Database,
  env: TokenIssuerEnv,
  accessToken: string,
): Promise<AuthSession | null> {
  const jwks = getJWKS(env)
  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload']
  try {
    // NOTICE: better-auth's jwt() plugin sets issuer to the full baseURL
    // including the path prefix (e.g. "http://localhost:3000/api/auth"),
    // not just the server origin.
    const verified = await jwtVerify(accessToken, jwks, {
      audience: env.AUTH_SERVER_URL,
      issuer: `${env.AUTH_SERVER_URL}/api/auth`,
    })
    payload = verified.payload
  }
  catch (error) {
    // A fetch failure while resolving JWKS is temporary. Let WebSocket auth
    // return its retryable close code instead of treating a valid token as bad.
    if (error instanceof TypeError || error instanceof errors.JWKSTimeout)
      throw error
    return null
  }

  if (!payload.sub)
    return null

  // The resource server deliberately reads only its authorization projection.
  // It does not instantiate Better Auth or depend on its internal adapter.
  const user = await db.query.user.findFirst({
    where: eq(authSchema.user.id, payload.sub),
  })
  if (!user)
    return null

  return {
    session: {
      createdAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(),
      id: payload.jti ?? payload.sub,
      ipAddress: null,
      token: accessToken,
      updatedAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
      userAgent: null,
      userId: payload.sub,
    },
    user,
  }
}
