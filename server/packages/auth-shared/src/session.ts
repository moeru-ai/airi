/** Authenticated principal exposed to AIRI resource handlers. */
export interface AuthSession {
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image?: string | null
    role?: string | null
    banned?: boolean | null
    banReason?: string | null
    banExpires?: Date | null
    lastSeenAt?: Date | null
    createdAt: Date
    updatedAt: Date
  }
  session: {
    id: string
    token: string
    userId: string
    expiresAt: Date
    createdAt: Date
    updatedAt: Date
    ipAddress?: string | null
    userAgent?: string | null
    impersonatedBy?: string | null
  }
}

/**
 * Evaluates Better Auth's persisted ban fields without requiring its runtime.
 * Expired temporary bans are treated as inactive on stateless JWT paths.
 */
export function isUserBannedNow(user: { banned?: boolean | null, banExpires?: Date | string | null }): boolean {
  if (!user.banned)
    return false
  if (user.banExpires == null)
    return true
  return new Date(user.banExpires).getTime() > Date.now()
}
