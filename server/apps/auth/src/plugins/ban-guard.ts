import type { BetterAuthPlugin } from 'better-auth'

import { isUserBannedNow } from '@proj-airi/auth-shared'
import { APIError } from 'better-auth'

interface BanState {
  banned?: boolean | null
  banExpires?: Date | string | null
}

/**
 * Rejects new Better Auth sessions for users with an active account ban.
 *
 * The private management backend owns ban and unban authorization. This plugin
 * only applies the persisted ban state when Better Auth creates a session. It
 * does not clear expired bans because a concurrent management request can
 * renew a ban after the session hook reads it.
 */
export function banGuard(): BetterAuthPlugin {
  return {
    id: 'ban-guard',
    schema: {
      user: {
        fields: {
          banned: {
            type: 'boolean',
            defaultValue: false,
            required: false,
            input: false,
          },
          banReason: {
            type: 'string',
            required: false,
            input: false,
          },
          banExpires: {
            type: 'date',
            required: false,
            input: false,
          },
        },
      },
    },
    init() {
      return {
        options: {
          databaseHooks: {
            session: {
              create: {
                async before(session, context) {
                  if (!context)
                    return

                  const user = await context.context.internalAdapter.findUserById(session.userId) as BanState | null
                  if (!isUserBannedNow(user ?? {}))
                    return

                  throw APIError.from('FORBIDDEN', {
                    code: 'BANNED_USER',
                    message: 'This account has been banned',
                  })
                },
              },
            },
          },
        },
      }
    },
  }
}
