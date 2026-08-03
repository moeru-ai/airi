import type { UserDeletionHandler, UserDeletionReason, UserDeletionService } from './types'

import { useLogger } from '@guiiai/logg'

export type { UserDeletionContext, UserDeletionHandler, UserDeletionReason, UserDeletionService } from './types'

/**
 * Build an empty deletion-service registry.
 *
 * Use when:
 * - Composing the server in `app.ts` — wire one instance and `register()`
 *   each business handler at composition time.
 *
 * Returns:
 * - A registry whose `softDeleteAll` walks handlers in ascending `priority`
 *   and aborts on the first throw. Successful handlers are NOT rolled back —
 *   each handler's writes must be idempotent.
 *
 * Call stack:
 *
 * better-auth `/delete-user/callback`
 *   -> `user.deleteUser.beforeDelete` (libs/auth.ts)
 *     -> {@link UserDeletionService.softDeleteAll}
 *       -> handler.softDelete (per registered module)
 *
 * Failure model: a thrown error from any handler aborts before
 * `internalAdapter.deleteUser`, leaving the user row intact. The next retry
 * is expected to re-run already-completed handlers as no-ops.
 */
export function createUserDeletionService(): UserDeletionService {
  const handlers: UserDeletionHandler[] = []
  const names = new Set<string>()

  const logger = useLogger('user-deletion').useGlobalConfig()

  return {
    register(handler) {
      if (names.has(handler.name))
        throw new Error(`Duplicate user-deletion handler name: ${handler.name}`)

      names.add(handler.name)
      handlers.push(handler)
      // Resort on every insert so post-boot registrations stay ordered.
      handlers.sort((a, b) => a.priority - b.priority)
    },

    async softDeleteAll({ userId, reason }) {
      const ctx = {
        userId,
        reason: reason as UserDeletionReason,
        logger,
      }

      logger.withFields({ userId, reason, handlerCount: handlers.length }).log('starting user deletion')

      for (const handler of handlers) {
        const startedAt = Date.now()

        try {
          await handler.softDelete(ctx)
          logger
            .withFields({ handler: handler.name, userId, durationMs: Date.now() - startedAt })
            .log('handler completed')
        }
        catch (err) {
          logger
            .withError(err)
            .withFields({ handler: handler.name, userId, durationMs: Date.now() - startedAt })
            .error('handler failed; aborting deletion pipeline')
          throw err
        }
      }

      logger.withFields({ userId, reason }).log('user deletion handlers completed')
    },
  }
}
