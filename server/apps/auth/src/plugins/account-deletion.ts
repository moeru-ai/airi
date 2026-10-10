import type { BetterAuthPlugin } from 'better-auth'

import { APIError } from 'better-auth'
import { createAuthEndpoint, freshSessionMiddleware, sensitiveSessionMiddleware } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import { literal, strictObject } from 'valibot'

/**
 * Offers explicit account deletion without an email round trip.
 * An authoritative, fresh session owns the target account. Existing deletion
 * hooks retain responsibility for provider revocation and resource cleanup.
 */
export function accountDeletion(): BetterAuthPlugin {
  return {
    id: 'account-deletion',
    endpoints: {
      deleteAccount: createAuthEndpoint('/delete-account', {
        method: 'POST',
        body: strictObject({ confirm: literal(true) }),
        // The authoritative guard excludes JWT identities without an active
        // original session. Refreshing a token does not renew session creation.
        use: [sensitiveSessionMiddleware, freshSessionMiddleware],
      }, async (ctx) => {
        const deletion = ctx.context.options.user?.deleteUser
        if (!deletion?.enabled)
          throw APIError.fromStatus('NOT_FOUND')

        const { user } = ctx.context.session
        // Cleanup must finish before the Auth identity disappears. A failure
        // leaves the account available for another authenticated attempt.
        await deletion.beforeDelete?.(user, ctx.request)
        await ctx.context.internalAdapter.deleteUser(user.id)
        await ctx.context.internalAdapter.deleteUserSessions(user.id)
        deleteSessionCookie(ctx)
        await deletion.afterDelete?.(user, ctx.request)
        return ctx.json({ success: true, message: 'User deleted' })
      }),
    },
  }
}
