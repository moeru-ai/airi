import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { user } from '../../schemas/accounts'
import { createBadRequestError } from '../../utils/error'
import { UpdateCurrentUserSchema } from './schema'

export function createUserRoutes(db: Database) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .get('/me', async (c) => {
      const sessionUser = c.get('user')!
      const [currentUser] = await db
        .select()
        .from(user)
        .where(eq(user.id, sessionUser.id))
        .limit(1)

      return c.json(currentUser)
    })

    .patch('/me', async (c) => {
      const sessionUser = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(UpdateCurrentUserSchema, body)

      if (!result.success) {
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      }

      const [updated] = await db
        .update(user)
        .set(result.output)
        .where(eq(user.id, sessionUser.id))
        .returning()

      return c.json(updated)
    })
}
