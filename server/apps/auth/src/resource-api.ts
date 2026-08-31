import { useLogger } from '@guiiai/logg'

import { createBadGatewayError } from './error'

export type UserDeletionReason = 'user-requested' | 'admin' | 'compliance'

export interface AuthEventInput {
  userId: string
  action: 'user_signed_up'
  source: 'better-auth.user.create'
}

/**
 * Business operations owned by the resource API that Auth must coordinate.
 * Calls use the deployment's private service URL; the public edge must not
 * expose `/internal/*`.
 */
export interface ResourceApi {
  softDeleteUserData: (input: { userId: string, reason: UserDeletionReason }) => Promise<void>
  trackAuthEvent: (input: AuthEventInput) => Promise<void>
}

/** Creates the single private HTTP boundary from Auth to the resource API. */
export function createResourceApi(
  resourceServerUrl: string,
  fetchRequest: typeof fetch = fetch,
): ResourceApi {
  const logger = useLogger('resource-api').useGlobalConfig()

  return {
    async softDeleteUserData(input) {
      const response = await fetchRequest(new URL('/internal/auth/user-deletion', resourceServerUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        throw createBadGatewayError('Business account cleanup failed', {
          statusCode: response.status,
        })
      }
    },

    async trackAuthEvent(input) {
      try {
        const response = await fetchRequest(new URL('/internal/auth/events', resourceServerUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
        if (!response.ok)
          logger.withFields({ statusCode: response.status, action: input.action }).warn('Resource API rejected auth event')
      }
      catch (error) {
        // Analytics must never make signup or login unavailable.
        logger.withError(error).withFields({ action: input.action }).warn('Failed to forward auth event')
      }
    },
  }
}
