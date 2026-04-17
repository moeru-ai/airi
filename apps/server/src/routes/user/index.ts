import type { Database } from '../../libs/db'
import type { S3StorageService } from '../../services/s3'
import type { HonoEnv } from '../../types/hono'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { authGuard } from '../../middlewares/auth'
import { oauthAccessToken, oauthRefreshToken, session, user } from '../../schemas/accounts'
import { createBadRequestError, createServiceUnavailableError } from '../../utils/error'
import { gravatarUrl } from '../../utils/gravatar'
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_SIZE, MIME_TO_EXT } from './schema'

/**
 * Creates user routes for avatar management and account deletion.
 *
 * Use when:
 * - Registering user-facing routes at `/api/v1/user`
 *
 * Call stack:
 *
 * buildApp (../../app.ts)
 *   -> {@link createUserRoutes}
 *     -> POST /avatar — upload avatar to S3, update DB
 *     -> DELETE /avatar — reset to Gravatar
 *     -> POST /delete — soft-delete account in a single transaction
 *                       (user.deletedAt + session + oauth issued tokens)
 */
export function createUserRoutes(deps: {
  s3StorageService: S3StorageService
  db: Database
}) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .post('/avatar', bodyLimit({
      maxSize: MAX_AVATAR_SIZE,
      onError: () => {
        throw createBadRequestError('File too large. Maximum size: 5MB', 'FILE_TOO_LARGE')
      },
    }), async (c) => {
      if (!deps.s3StorageService.isAvailable()) {
        throw createServiceUnavailableError(
          'Avatar storage is not configured',
          'AVATAR_STORAGE_UNAVAILABLE',
        )
      }

      const authUser = c.get('user')!

      const body = await c.req.parseBody()
      const file = body.file

      if (!(file instanceof File)) {
        throw createBadRequestError('No file provided', 'MISSING_FILE')
      }

      if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
        throw createBadRequestError(
          'Invalid file type. Allowed: png, jpeg, webp, gif',
          'INVALID_FILE_TYPE',
        )
      }

      if (file.size > MAX_AVATAR_SIZE) {
        throw createBadRequestError('File too large. Maximum size: 5MB', 'FILE_TOO_LARGE')
      }

      const ext = MIME_TO_EXT[file.type]
      const key = `avatars/${authUser.id}/${Date.now()}.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())

      const publicUrl = await deps.s3StorageService.upload(key, buffer, file.type)

      try {
        await deps.db.update(user).set({ image: publicUrl }).where(eq(user.id, authUser.id))
      }
      catch {
        // Rollback: delete uploaded S3 object on DB update failure
        try {
          await deps.s3StorageService.deleteObject(key)
        }
        catch {
          // Best-effort rollback — ignore cleanup failure
        }
        throw createBadRequestError('Failed to update user avatar', 'DB_UPDATE_FAILED')
      }

      return c.json({ url: publicUrl })
    })

    .delete('/avatar', async (c) => {
      const authUser = c.get('user')!

      const [currentUser] = await deps.db
        .select({ image: user.image })
        .from(user)
        .where(eq(user.id, authUser.id))

      if (currentUser?.image && deps.s3StorageService.isAvailable()) {
        // NOTICE:
        // `user.image` is user-controlled via profile updates. Without the
        // strict origin + key-prefix check below, a user could point their
        // image at an arbitrary S3-bucket URL and use this endpoint to delete
        // another user's objects (or any shared-bucket object).
        // Root cause: previous check used `String.includes('r2.cloudflarestorage')`
        // and only `startsWith(getPublicUrl(''))`, neither of which bind the
        // object back to the calling user's namespace.
        // Removal condition: when per-user avatars move to scoped credentials
        // or a signed-delete flow that can't address objects outside the user prefix.
        try {
          const parsed = new URL(currentUser.image)
          const s3Origin = new URL(deps.s3StorageService.getPublicUrl('')).origin
          const key = parsed.pathname.replace(/^\/+/, '')
          const ownedPrefix = `avatars/${authUser.id}/`

          if (parsed.origin === s3Origin && key.startsWith(ownedPrefix)) {
            await deps.s3StorageService.deleteObject(key)
          }
        }
        catch {
          // Best-effort deletion — ignore invalid URLs or S3 failures
        }
      }

      // Reset to a Gravatar URL keyed off the user's email. Gravatar serves
      // the image directly (with `?d=identicon` fallback for emails without
      // a profile), so we no longer depend on S3 being configured for the
      // "remove my avatar" flow.
      const fallbackUrl = gravatarUrl(authUser.email)

      await deps.db
        .update(user)
        .set({ image: fallbackUrl })
        .where(eq(user.id, authUser.id))

      return c.json({ url: fallbackUrl })
    })

    .post('/delete', async (c) => {
      const authUser = c.get('user')!

      // NOTICE:
      // Soft-delete must be atomic across `user.deletedAt`, `session`, and the
      // OAuth issued-token tables. If we mark the account deleted but leave a
      // refresh token alive, an external relying party can still mint a new
      // access token via /oauth/token and pretend to be the deleted user.
      // Root cause: previous implementation issued three sequential statements
      // outside of a transaction, so a crash between steps could leave any
      // subset of these tables in a half-deleted state.
      // Removal condition: never — this is a security invariant.
      await deps.db.transaction(async (tx) => {
        await tx
          .update(user)
          .set({ deletedAt: new Date() })
          .where(eq(user.id, authUser.id))

        await tx
          .delete(session)
          .where(eq(session.userId, authUser.id))

        // Revoke OAuth tokens issued *to other apps on this user's behalf*
        // (Better Auth's OIDC provider plugin). The `account` table — which
        // stores tokens we *received from* upstream IdPs (Google/GitHub) —
        // cascades automatically via FK `onDelete: 'cascade'`, but only when
        // the user row is hard-deleted. Soft-delete keeps the row, so we must
        // explicitly clear issued tokens here.
        await tx
          .delete(oauthAccessToken)
          .where(eq(oauthAccessToken.userId, authUser.id))

        await tx
          .delete(oauthRefreshToken)
          .where(eq(oauthRefreshToken.userId, authUser.id))
      })

      return c.json({ success: true })
    })
}
