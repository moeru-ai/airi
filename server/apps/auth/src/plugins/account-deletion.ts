import type { BetterAuthPlugin } from 'better-auth'

import { APIError } from 'better-auth'
import { createAuthEndpoint, freshSessionMiddleware, sensitiveSessionMiddleware } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import { literal, strictObject } from 'valibot'

/** Deletes the signed-in account after explicit confirmation and the existing cleanup hooks. */
export function accountDeletion(): BetterAuthPlugin {
  return {
    id: 'account-deletion',
    endpoints: {
      deleteAccount: createAuthEndpoint('/delete-account', {
        method: 'POST',
        body: strictObject({ confirm: literal(true) }),
        // Reject request-only JWT identities before checking session age.
        use: [sensitiveSessionMiddleware, freshSessionMiddleware],
      }, async (ctx) => {
        const deletion = ctx.context.options.user?.deleteUser
        if (!deletion?.enabled)
          throw APIError.fromStatus('NOT_FOUND')

        const { user } = ctx.context.session
        // Keep Better Auth's deletion order without invoking its email-verification branch.
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
