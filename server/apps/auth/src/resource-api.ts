import { useLogger } from '@guiiai/logg'

import { ApiError, createBadGatewayError } from './error'

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

      // The resource API stops the deletion with 409 while a subscription still renews.
      // The user reads this message on the deletion callback, so it tells the next step.
      if (response.status === 409) {
        throw new ApiError(
          409,
          'user-deletion/subscription_active',
          'Your subscription is still active. Cancel it first, then request the account deletion again.',
        )
      }

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
