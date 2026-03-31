import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { useLogger } from '@guiiai/logg'
import { and, eq, gt } from 'drizzle-orm'
import { Hono } from 'hono'

import { oauthAccessToken } from '../../schemas/accounts'
import { createUnauthorizedError } from '../../utils/error'

/**
 * TTL for the in-memory bridge cache (5 minutes).
 * Repeated calls with the same OIDC access token within this window
 * return the cached session token instead of creating a new one.
 */
const BRIDGE_CACHE_TTL_MS = 5 * 60 * 1000

interface BridgeCacheEntry {
  sessionToken: string
  expiresAt: number
}

/**
 * In-memory cache mapping OIDC access tokens to session tokens.
 * Provides idempotent bridge behaviour: the same OIDC token always
 * resolves to the same session token within the TTL window.
 */
const bridgeCache = new Map<string, BridgeCacheEntry>()

/**
 * Evict expired entries from the bridge cache.
 * Called on every request to keep memory bounded.
 */
function evictExpiredEntries(): void {
  const now = Date.now()
  for (const [key, entry] of bridgeCache) {
    if (entry.expiresAt <= now) {
      bridgeCache.delete(key)
    }
  }
}

/**
 * Creates a route that exchanges an OIDC access token (issued by
 * the server's own oidcProvider) for a better-auth session token.
 *
 * This "bridge" allows Electron (and other native clients) to
 * authenticate via Authorization Code + PKCE, then obtain a
 * session token usable with better-auth's bearer plugin.
 *
 * @param auth - The better-auth instance (typed as `any` due to TS2742)
 * @param db - Drizzle database instance
 * @param electronClientId - The OIDC client ID for the Electron app
 */
export function createOIDCSessionRoute(
  auth: any,
  db: Database,
  electronClientId: string,
) {
  const logger = useLogger('oidc-session').useGlobalConfig()

  return new Hono<HonoEnv>()
    .post('/', async (c) => {
      // If the Electron client ID is not configured, reject all requests
      if (!electronClientId) {
        throw createUnauthorizedError('Invalid or expired token')
      }

      // Extract Bearer token from Authorization header
      const authHeader = c.req.header('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        throw createUnauthorizedError('Invalid or expired token')
      }
      const accessToken = authHeader.slice(7)
      if (!accessToken) {
        throw createUnauthorizedError('Invalid or expired token')
      }

      // Evict stale cache entries
      evictExpiredEntries()

      // Check bridge cache for idempotent response
      const cached = bridgeCache.get(accessToken)
      if (cached && cached.expiresAt > Date.now()) {
        return c.json({ token: cached.sessionToken })
      }

      // Look up the OIDC access token in the database.
      // Only accept tokens issued to the Electron client that have not expired.
      const now = new Date()
      const rows = await db
        .select({
          userId: oauthAccessToken.userId,
        })
        .from(oauthAccessToken)
        .where(
          and(
            eq(oauthAccessToken.accessToken, accessToken),
            eq(oauthAccessToken.clientId, electronClientId),
            gt(oauthAccessToken.accessTokenExpiresAt, now),
          ),
        )
        .limit(1)

      if (rows.length === 0 || !rows[0].userId) {
        throw createUnauthorizedError('Invalid or expired token')
      }

      const { userId } = rows[0]

      // Create a better-auth session for the user via the internal adapter.
      // Signature: createSession(userId, request?, overrides?, skipHooks?)
      // The admin plugin uses (userId, true, overrides, true).
      let session: any
      try {
        const ctx = await auth.$context
        session = await ctx.internalAdapter.createSession(userId)
      }
      catch (err) {
        logger.withError(err).error('Failed to create session via internalAdapter')
        throw createUnauthorizedError('Invalid or expired token')
      }

      if (!session?.token) {
        throw createUnauthorizedError('Invalid or expired token')
      }

      const sessionToken: string = session.token

      // Cache the mapping so repeated calls are idempotent
      bridgeCache.set(accessToken, {
        sessionToken,
        expiresAt: Date.now() + BRIDGE_CACHE_TTL_MS,
      })

      // Schedule cleanup: delete the OIDC access token row after the TTL
      // so it cannot be reused once the bridge cache expires.
      setTimeout(async () => {
        try {
          await db
            .delete(oauthAccessToken)
            .where(eq(oauthAccessToken.accessToken, accessToken))
        }
        catch (err) {
          logger.withError(err).warn('Failed to delete bridged OIDC access token')
        }
      }, BRIDGE_CACHE_TTL_MS)

      return c.json({ token: sessionToken })
    })
}
