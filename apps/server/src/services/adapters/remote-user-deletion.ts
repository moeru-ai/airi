import type { Env } from '../../libs/env'
import type { UserDeletionExecutor } from '../domain/user-deletion'

import { createBadGatewayError, createServiceUnavailableError } from '../../utils/error'

/**
 * Creates the Identity-side account-deletion port. Business cleanup stays in
 * the API service; Better Auth waits for that cleanup before deleting identity
 * rows, preserving the existing retry and failure semantics.
 */
export function createRemoteUserDeletionService(
  env: Pick<Env, 'API_SERVER_URL' | 'IDENTITY_INTERNAL_SECRET'>,
  fetchRequest: typeof fetch = fetch,
): UserDeletionExecutor {
  return {
    async softDeleteAll(input) {
      if (!env.IDENTITY_INTERNAL_SECRET) {
        throw createServiceUnavailableError(
          'Identity-to-API account deletion is not configured',
          'IDENTITY_INTERNAL_AUTH_NOT_CONFIGURED',
        )
      }

      const response = await fetchRequest(new URL('/internal/identity/user-deletion', env.API_SERVER_URL), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.IDENTITY_INTERNAL_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        throw createBadGatewayError('Business account cleanup failed', {
          statusCode: response.status,
        })
      }
    },
  }
}
