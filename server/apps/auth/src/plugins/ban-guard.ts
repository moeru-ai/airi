import type { BetterAuthPlugin } from 'better-auth'

import { APIError } from 'better-auth'

interface BanState {
  banned?: boolean | null
  banExpires?: Date | string | null
}

function isExpiredBan(banExpires: BanState['banExpires']): boolean {
  return banExpires != null && new Date(banExpires).getTime() < Date.now()
}

/**
 * Rejects new Better Auth sessions for users with an active account ban.
 *
 * The private management backend owns ban and unban authorization. This plugin
 * only applies the persisted ban state when Better Auth creates a session.
 */
export function banGuard(): BetterAuthPlugin {
  return {
    id: 'ban-guard',
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
                  if (!user?.banned)
                    return

                  if (isExpiredBan(user.banExpires)) {
                    await context.context.internalAdapter.updateUser(session.userId, {
                      banned: false,
                      banReason: null,
                      banExpires: null,
                    })
                    return
                  }

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
