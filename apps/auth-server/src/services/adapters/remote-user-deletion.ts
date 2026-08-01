import type { UserDeletionExecutor } from '../domain/user-deletion'

import { createBadGatewayError, createServiceUnavailableError } from '../../utils/error'

/**
 * Creates the Auth-side account-deletion port. Business cleanup stays in
 * the API service; Better Auth waits for that cleanup before deleting identity
 * rows, preserving the existing retry and failure semantics.
 */
export function createRemoteUserDeletionService(
  env: { RESOURCE_SERVER_URL: string, AUTH_INTERNAL_SECRET: string },
  fetchRequest: typeof fetch = fetch,
): UserDeletionExecutor {
  return {
    async softDeleteAll(input) {
      if (!env.AUTH_INTERNAL_SECRET) {
        throw createServiceUnavailableError(
          'Auth-to-resource API account deletion is not configured',
          'AUTH_INTERNAL_AUTH_NOT_CONFIGURED',
        )
      }

      const response = await fetchRequest(new URL('/internal/auth/user-deletion', env.RESOURCE_SERVER_URL), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.AUTH_INTERNAL_SECRET}`,
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
