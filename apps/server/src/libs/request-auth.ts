import type auth from '../scripts/auth'
import type { Database } from './db'

import { Buffer } from 'node:buffer'

import { and, eq, gt, inArray } from 'drizzle-orm'

import { oauthAccessToken, oauthRefreshToken } from '../schemas/accounts'
import { getTrustedOIDCClientIds } from './auth'

export interface RequestAuthSession {
  user: typeof auth.$Infer.Session.user
  session: typeof auth.$Infer.Session.session
}

async function hashToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return Buffer.from(hash).toString('base64url')
}

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    return null

  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

export async function resolveOIDCAccessTokenAuth(
  auth: any,
  db: Database,
  accessToken: string,
): Promise<RequestAuthSession | null> {
  const hashedToken = await hashToken(accessToken)
  const now = new Date()
  const [tokenRow] = await db
    .select({
      id: oauthAccessToken.id,
      userId: oauthAccessToken.userId,
      sessionId: oauthAccessToken.sessionId,
      createdAt: oauthAccessToken.createdAt,
      expiresAt: oauthAccessToken.expiresAt,
    })
    .from(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.token, hashedToken),
        inArray(oauthAccessToken.clientId, getTrustedOIDCClientIds()),
        gt(oauthAccessToken.expiresAt, now),
      ),
    )
    .limit(1)

  if (!tokenRow?.userId || !tokenRow.createdAt || !tokenRow.expiresAt)
    return null

  const ctx = await auth.$context
  const user = await ctx.internalAdapter.findUserById(tokenRow.userId)
  if (!user)
    return null

  return {
    user,
    session: {
      id: tokenRow.sessionId ?? tokenRow.id,
      token: accessToken,
      userId: tokenRow.userId,
      createdAt: tokenRow.createdAt,
      updatedAt: tokenRow.createdAt,
      expiresAt: tokenRow.expiresAt,
      ipAddress: null,
      userAgent: null,
    },
  }
}

export async function resolveRequestAuth(
  auth: any,
  db: Database,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const session = await auth.api.getSession({ headers })
  if (session?.user && session?.session)
    return session

  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  return await resolveOIDCAccessTokenAuth(auth, db, accessToken)
}

export async function revokeOIDCAccessToken(
  db: Database,
  accessToken: string,
): Promise<boolean> {
  const hashedToken = await hashToken(accessToken)
  const now = new Date()
  const [tokenRow] = await db
    .select({
      id: oauthAccessToken.id,
      refreshId: oauthAccessToken.refreshId,
    })
    .from(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.token, hashedToken),
        inArray(oauthAccessToken.clientId, getTrustedOIDCClientIds()),
        gt(oauthAccessToken.expiresAt, now),
      ),
    )
    .limit(1)

  if (!tokenRow)
    return false

  await db.transaction(async (tx) => {
    await tx.delete(oauthAccessToken)
      .where(eq(oauthAccessToken.id, tokenRow.id))

    if (tokenRow.refreshId) {
      await tx.update(oauthRefreshToken)
        .set({ revoked: now })
        .where(eq(oauthRefreshToken.id, tokenRow.refreshId))

      await tx.delete(oauthAccessToken)
        .where(eq(oauthAccessToken.refreshId, tokenRow.refreshId))
    }
  })

  return true
}
