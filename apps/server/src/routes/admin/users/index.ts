import type { GenericSchema, InferOutput } from 'valibot'

import type { AdminUsersService } from '../../../services/domain/admin/users'
import type { UserSelector } from '../../../services/domain/users/resolve-user'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { email, integer, maxLength, maxValue, minValue, nonEmpty, number, object, optional, pipe, safeParse, string } from 'valibot'

import { adminGuard } from '../../../middlewares/admin-guard'
import { authGuard } from '../../../middlewares/auth'
import { createBadRequestError } from '../../../utils/error'

/**
 * Upper bound on an admin-set balance. Guards a fat-fingered extra digit from
 * minting an absurd balance; raise it here if a legitimate top-up ever needs
 * more. 0 is allowed (the primary testing use case).
 */
const MAX_SET_BALANCE = 100_000_000

const SelectorFields = {
  /** Target by email (case-insensitive). Provide exactly one of email/userId. */
  email: optional(pipe(string(), email('email must be a valid email address'))),
  /** Target by user id. Provide exactly one of email/userId. */
  userId: optional(pipe(string(), nonEmpty('userId must not be empty'))),
}

const SetBalanceSchema = object({
  ...SelectorFields,
  balance: pipe(
    number(),
    integer('balance must be an integer'),
    minValue(0, 'balance must be at least 0'),
    maxValue(MAX_SET_BALANCE, `balance must be at most ${MAX_SET_BALANCE}`),
  ),
  description: optional(pipe(string(), maxLength(500))),
})

/**
 * Parse a JSON body against a schema, throwing a 400 with per-issue paths on
 * failure — mirrors the validation shape used by the flux-grants admin route.
 */
function parseBody<S extends GenericSchema>(schema: S, raw: unknown): InferOutput<S> {
  if (raw == null || typeof raw !== 'object')
    throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')

  const parsed = safeParse(schema, raw)
  if (!parsed.success) {
    throw createBadRequestError(
      'Invalid request body',
      'INVALID_BODY',
      parsed.issues.map(i => ({ path: i.path?.map(p => p.key).join('.'), message: i.message })),
    )
  }
  return parsed.output
}

/**
 * Require exactly one of `email` / `userId`. Returns the selector narrowed to
 * the provided dimension.
 */
function requireSingleSelector(body: { email?: string, userId?: string }): UserSelector {
  const hasEmail = body.email != null
  const hasUserId = body.userId != null
  if (hasEmail === hasUserId)
    throw createBadRequestError('Provide exactly one of email or userId', 'INVALID_BODY')

  return hasEmail ? { email: body.email } : { userId: body.userId }
}

/**
 * Admin route for per-user balance overrides.
 *
 * Mounted at `/api/admin/users`. Only `POST /balance` lives here — it is a
 * flux/domain operation with no better-auth equivalent. Account ban/unban are
 * served by the better-auth `admin` plugin at `/api/auth/admin/ban-user` and
 * `/api/auth/admin/unban-user`; immediate enforcement on the OIDC JWT hot path
 * is handled by `resolveRequestAuth` + the `/oauth2/userinfo` guard.
 */
export function createAdminUsersRoutes(adminUsersService: AdminUsersService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard)
    .post('/balance', async (c) => {
      const admin = c.get('user')!
      const body = parseBody(SetBalanceSchema, await c.req.json().catch(() => null))
      const selector = requireSingleSelector(body)

      const result = await adminUsersService.setBalance({
        ...selector,
        balance: body.balance,
        description: body.description ?? `Admin set balance to ${body.balance}`,
        issuedByUserId: admin.id,
      })

      return c.json(result)
    })
}
