import type { AuthEventService } from '../domain/auth-events'

import { useLogger } from '@guiiai/logg'

/**
 * Forwards auth facts to the API-owned product-event store. Failures are
 * logged and swallowed so analytics cannot make signup or login unavailable.
 */
export function createRemoteAuthEventService(
  env: { RESOURCE_SERVER_URL: string, AUTH_INTERNAL_SECRET: string },
  fetchRequest: typeof fetch = fetch,
): AuthEventService {
  const logger = useLogger('auth-events').useGlobalConfig()

  return {
    async track(input) {
      if (!env.AUTH_INTERNAL_SECRET) {
        logger.warn('Auth event forwarding is disabled because the internal credential is missing')
        return
      }

      try {
        const response = await fetchRequest(new URL('/internal/auth/events', env.RESOURCE_SERVER_URL), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.AUTH_INTERNAL_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        })
        if (!response.ok)
          logger.withFields({ statusCode: response.status, action: input.action }).warn('Resource API rejected auth event')
      }
      catch (error) {
        logger.withError(error).withFields({ action: input.action }).warn('Failed to forward auth event')
      }
    },
  }
}
