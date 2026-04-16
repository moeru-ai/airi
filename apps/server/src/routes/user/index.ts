import type { Database } from '../../libs/db'
import type { R2StorageService } from '../../services/r2'
import type { HonoEnv } from '../../types/hono'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { authGuard } from '../../middlewares/auth'
import { session, user } from '../../schemas/accounts'
import { createBadRequestError } from '../../utils/error'
import { generateIdenticon } from '../../utils/identicon'
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
 *     -> POST /avatar — upload avatar to R2, update DB
 *     -> DELETE /avatar — reset to identicon
 *     -> POST /delete — soft-delete account, revoke sessions
 */
export function createUserRoutes(deps: {
  r2StorageService: R2StorageService
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

      const publicUrl = await deps.r2StorageService.upload(key, buffer, file.type)

      try {
        await deps.db.update(user).set({ image: publicUrl }).where(eq(user.id, authUser.id))
      }
      catch {
        // Rollback: delete uploaded R2 object on DB update failure
        try {
          await deps.r2StorageService.deleteObject(key)
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

      if (currentUser?.image && deps.r2StorageService.isAvailable()) {
        const r2BaseUrl = deps.r2StorageService.getPublicUrl('')
        if (
          currentUser.image.startsWith(r2BaseUrl)
          || currentUser.image.includes('r2.cloudflarestorage')
        ) {
          try {
            const url = new URL(currentUser.image)
            // pathname starts with '/' — strip it to get the R2 key
            const key = url.pathname.slice(1)
            await deps.r2StorageService.deleteObject(key)
          }
          catch {
            // Best-effort deletion — ignore failure
          }
        }
      }

      const identiconBuffer = await generateIdenticon(authUser.id)
      const identiconKey = `avatars/${authUser.id}/identicon.png`
      const identiconUrl = await deps.r2StorageService.upload(
        identiconKey,
        identiconBuffer,
        'image/png',
      )

      await deps.db
        .update(user)
        .set({ image: identiconUrl })
        .where(eq(user.id, authUser.id))

      return c.json({ url: identiconUrl })
    })

    .post('/delete', async (c) => {
      const authUser = c.get('user')!

      await deps.db
        .update(user)
        .set({ deletedAt: new Date() })
        .where(eq(user.id, authUser.id))

      await deps.db
        .delete(session)
        .where(eq(session.userId, authUser.id))

      return c.json({ success: true })
    })
}
