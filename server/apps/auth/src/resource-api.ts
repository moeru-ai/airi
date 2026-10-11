import { useLogger } from '@guiiai/logg'
import { APIError } from 'better-auth/api'

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
  /**
   * Rejects when the resource API refuses the account deletion. It changes nothing.
   * A subscription that can still charge rejects with the Better Auth error `SUBSCRIPTION_ACTIVE`,
   * which the client shows. A deleted user cannot manage a subscription.
   */
  checkUserDeletion: (input: { userId: string }) => Promise<void>
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
    async checkUserDeletion(input) {
      const response = await fetchRequest(new URL('/internal/auth/user-deletion/check', resourceServerUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (response.status === 409) {
        throw new APIError('CONFLICT', {
          code: 'SUBSCRIPTION_ACTIVE',
          message: 'Your subscription is still active. Cancel it first, then delete your account.',
        })
      }

      if (!response.ok) {
        throw createBadGatewayError('Account deletion check failed', {
          statusCode: response.status,
        })
      }
    },

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
