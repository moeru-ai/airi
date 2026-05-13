import type { Env } from '../../../libs/env'
import type { AdminFluxGrantsService } from '../../../services/admin-flux-grants'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { array, email, integer, maxLength, maxValue, minLength, minValue, nonEmpty, number, object, optional, pipe, safeParse, string } from 'valibot'

import { adminGuard } from '../../../middlewares/admin-guard'
import { authGuard } from '../../../middlewares/auth'
import { createBadRequestError } from '../../../utils/error'

/**
 * Per-grant cap on amount per user. Caps a single typo from issuing
 * absurd amounts. Operator can override later via configKV if ever needed.
 */
const MAX_GRANT_AMOUNT_PER_USER = 10_000

/**
 * Hard cap on emails per single grant request.
 *
 * NOTICE:
 * Processing is synchronous inside the HTTP request: at the default
 * `creditFlux` cost (single-row update + ledger insert + Redis cache write
 * ≈ 20–50ms per recipient) 200 recipients fit comfortably under typical
 * 30s load-balancer timeouts. Higher counts mean splitting into multiple
 * calls — admin tooling, not bulk import.
 */
const MAX_EMAILS_PER_GRANT = 200

const GrantBodySchema = object({
  description: pipe(string(), nonEmpty('description is required'), maxLength(500)),
  amount: pipe(
    number(),
    integer('amount must be an integer'),
    minValue(1, 'amount must be at least 1'),
    maxValue(MAX_GRANT_AMOUNT_PER_USER, `amount must be at most ${MAX_GRANT_AMOUNT_PER_USER}`),
  ),
  emails: pipe(
    array(pipe(string(), email('emails must be valid email addresses'))),
    minLength(1, 'emails must not be empty'),
    maxLength(MAX_EMAILS_PER_GRANT, `emails must be at most ${MAX_EMAILS_PER_GRANT} entries`),
  ),
  /**
   * Optional. When set, recipient `creditFlux` calls become idempotent
   * across retries — re-firing the same `(idempotencyKey, recipient)`
   * combination is a no-op via the `(user_id, request_id)` partial unique
   * index. Use when admin wants safe retry semantics; omit for "I want to
   * grant again on purpose".
   */
  idempotencyKey: optional(pipe(string(), maxLength(100))),
})

/**
 * Admin routes for issuing one-shot FLUX grants.
 *
 * Mounted at `/api/admin/flux-grants`. The whole grant flow lives in a
 * single synchronous endpoint — no batch table, no state machine, no
 * background loop. Audit trail is the per-recipient `flux_transaction`
 * ledger row produced by `BillingService.creditFlux`; admin can query it
 * via the existing `/api/v1/flux/history` endpoint or directly in DB.
 */
export function createAdminFluxGrantsRoutes(
  fluxGrantsService: AdminFluxGrantsService,
  env: Env,
) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard(env))
    .post('/', async (c) => {
      const user = c.get('user')!
      const dryRun = c.req.query('dryRun') === 'true'

      const raw = await c.req.json().catch(() => null)
      if (raw == null)
        throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')

      const parsed = safeParse(GrantBodySchema, raw)
      if (!parsed.success) {
        throw createBadRequestError(
          'Invalid request body',
          'INVALID_BODY',
          parsed.issues.map(i => ({ path: i.path?.map(p => p.key).join('.'), message: i.message })),
        )
      }

      const body = parsed.output

      if (dryRun) {
        const summary = await fluxGrantsService.preview({ amount: body.amount, emails: body.emails })
        return c.json({ preview: summary })
      }

      const { summary, result } = await fluxGrantsService.grant({
        amount: body.amount,
        description: body.description,
        emails: body.emails,
        createdByUserId: user.id,
        idempotencyKey: body.idempotencyKey,
      })

      return c.json({ summary, result })
    })
}
