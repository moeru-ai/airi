import type { Database } from './db'
import type { Env } from './env'
import type { AuthMetrics } from './otel'

import { generateCodeVerifier, generateState, GitHub, Google } from 'arctic'
import { and, eq } from 'drizzle-orm'
import { jwtVerify, SignJWT } from 'jose'

import { nanoid } from '../utils/id'

import * as schema from '../schemas/accounts'

export interface JwtPayload {
  sub: string
  email: string
  name: string
  image?: string | null
}

export interface AuthUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
}

export interface AuthSession {
  id: string
  userId: string
  expiresAt: Date
  createdAt: Date
}

export interface AuthInstance {
  google: Google
  github: GitHub
  googleClientId: string

  /** Generate a JWT access token for a user (short-lived, 1 hour) */
  createAccessToken: (user: AuthUser) => Promise<string>

  /** Generate a JWT refresh token (long-lived, 30 days) */
  createRefreshToken: (user: AuthUser) => Promise<string>

  /** Verify and decode an access token */
  verifyAccessToken: (token: string) => Promise<JwtPayload | null>

  /** Verify and decode a refresh token */
  verifyRefreshToken: (token: string) => Promise<JwtPayload | null>

  /** Find or create a user from OAuth profile, return the user */
  findOrCreateOAuthUser: (profile: {
    provider: string
    providerAccountId: string
    email: string
    name: string
    image?: string | null
  }) => Promise<AuthUser>

  /** Store a refresh token in the session table */
  storeSession: (userId: string, refreshToken: string, ipAddress?: string, userAgent?: string) => Promise<void>

  /** Revoke a session (sign out) by refresh token */
  revokeSession: (refreshToken: string) => Promise<void>

  /** Revoke all sessions for a user */
  revokeAllSessions: (userId: string) => Promise<void>

  /** Get user by ID */
  getUserById: (id: string) => Promise<AuthUser | null>

  /** List active sessions for a user */
  listUserSessions: (userId: string) => Promise<AuthSession[]>

  /** Generate OAuth state and store it for verification */
  createOAuthState: () => { state: string, codeVerifier: string }

  metrics?: AuthMetrics | null
}

const ACCESS_TOKEN_EXPIRY = '1h'
const REFRESH_TOKEN_EXPIRY = '30d'

export function createAuth(db: Database, env: Env, metrics?: AuthMetrics | null): AuthInstance {
  const jwtSecret = new TextEncoder().encode(env.JWT_SECRET)
  const callbackBase = `${env.API_SERVER_URL}/api/auth/callback`

  const google = new Google(
    env.AUTH_GOOGLE_CLIENT_ID,
    env.AUTH_GOOGLE_CLIENT_SECRET,
    `${callbackBase}/google`,
  )

  const github = new GitHub(
    env.AUTH_GITHUB_CLIENT_ID,
    env.AUTH_GITHUB_CLIENT_SECRET,
    `${callbackBase}/github`,
  )

  async function createAccessToken(user: AuthUser): Promise<string> {
    return new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_EXPIRY)
      .setIssuer('airi')
      .sign(jwtSecret)
  }

  async function createRefreshToken(user: AuthUser): Promise<string> {
    return new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(REFRESH_TOKEN_EXPIRY)
      .setIssuer('airi')
      .setJti(nanoid())
      .sign(jwtSecret)
  }

  /**
   * Extract and validate required claims from a verified JWT payload.
   * Returns null if any required claim is missing or has the wrong type.
   */
  function extractClaims(payload: Record<string, unknown>): JwtPayload | null {
    const { sub, email, name, image } = payload
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof name !== 'string') {
      return null
    }
    return {
      sub,
      email,
      name,
      image: typeof image === 'string' ? image : null,
    }
  }

  async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
    try {
      const { payload } = await jwtVerify(token, jwtSecret, { issuer: 'airi' })
      return extractClaims(payload)
    }
    catch {
      return null
    }
  }

  async function verifyRefreshToken(token: string): Promise<JwtPayload | null> {
    try {
      const { payload } = await jwtVerify(token, jwtSecret, { issuer: 'airi' })
      return extractClaims(payload)
    }
    catch {
      return null
    }
  }

  async function findOrCreateOAuthUser(profile: {
    provider: string
    providerAccountId: string
    email: string
    name: string
    image?: string | null
  }): Promise<AuthUser> {
    // Check if account exists for this provider
    const existingAccounts = await db
      .select()
      .from(schema.account)
      .where(
        and(
          eq(schema.account.providerId, profile.provider),
          eq(schema.account.accountId, profile.providerAccountId),
        ),
      )
      .limit(1)

    if (existingAccounts.length > 0) {
      const acc = existingAccounts[0]
      const users = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, acc.userId))
        .limit(1)

      if (users.length > 0) {
        // Update user profile from OAuth if changed
        const existingUser = users[0]
        if (existingUser.name !== profile.name || existingUser.image !== profile.image) {
          await db
            .update(schema.user)
            .set({ name: profile.name, image: profile.image ?? null })
            .where(eq(schema.user.id, existingUser.id))
        }

        metrics?.userLogin.add(1)
        return { ...existingUser, name: profile.name, image: profile.image ?? null }
      }
    }

    // Check if user exists by email
    const existingUsers = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, profile.email))
      .limit(1)

    let userId: string

    if (existingUsers.length > 0) {
      userId = existingUsers[0].id
      // Link account to existing user
      metrics?.userLogin.add(1)
    }
    else {
      // Create new user
      userId = nanoid()
      await db.insert(schema.user).values({
        id: userId,
        name: profile.name,
        email: profile.email,
        emailVerified: true,
        image: profile.image ?? null,
      })
      metrics?.userRegistered.add(1)
    }

    // Create account link
    await db.insert(schema.account).values({
      id: nanoid(),
      accountId: profile.providerAccountId,
      providerId: profile.provider,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const finalUsers = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1)

    return finalUsers[0]
  }

  async function storeSession(userId: string, refreshToken: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    await db.insert(schema.session).values({
      id: nanoid(),
      token: refreshToken,
      userId,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    })
    metrics?.activeSessions.add(1)
  }

  async function revokeSession(refreshToken: string): Promise<void> {
    await db.delete(schema.session).where(eq(schema.session.token, refreshToken))
    metrics?.activeSessions.add(-1)
  }

  async function revokeAllSessions(userId: string): Promise<void> {
    await db.delete(schema.session).where(eq(schema.session.userId, userId))
  }

  async function getUserById(id: string): Promise<AuthUser | null> {
    const users = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, id))
      .limit(1)
    return users[0] ?? null
  }

  async function listUserSessions(userId: string): Promise<AuthSession[]> {
    const sessions = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, userId))
    return sessions
  }

  function createOAuthState() {
    return {
      state: generateState(),
      codeVerifier: generateCodeVerifier(),
    }
  }

  return {
    google,
    github,
    googleClientId: env.AUTH_GOOGLE_CLIENT_ID,
    createAccessToken,
    createRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    findOrCreateOAuthUser,
    storeSession,
    revokeSession,
    revokeAllSessions,
    getUserById,
    listUserSessions,
    createOAuthState,
    metrics,
  }
}
