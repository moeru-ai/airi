/** Authenticated principal exposed to AIRI resource handlers. */
export interface AuthSession {
  session: {
    createdAt: Date
    expiresAt: Date
    id: string
    ipAddress?: null | string
    token: string
    updatedAt: Date
    userAgent?: null | string
    userId: string
  }
  user: {
    banExpires?: Date | null
    banned?: boolean | null
    banReason?: null | string
    createdAt: Date
    email: string
    emailVerified: boolean
    id: string
    image?: null | string
    lastSeenAt?: Date | null
    name: string
    updatedAt: Date
  }
}

/**
 * Evaluates Better Auth's persisted ban fields without requiring its runtime.
 * Expired temporary bans are treated as inactive on stateless JWT paths.
 */
export function isUserBannedNow(user: { banExpires?: Date | null | string, banned?: boolean | null }): boolean {
  if (!user.banned)
    return false
  if (user.banExpires == null)
    return true
  return new Date(user.banExpires).getTime() > Date.now()
}
