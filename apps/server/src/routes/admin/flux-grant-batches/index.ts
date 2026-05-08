import type { Env } from '../../../libs/env'
import type { FluxGrantBatchService } from '../../../services/admin-flux-grant-batch/flux-grant-batch-service'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { array, email, integer, maxLength, maxValue, minLength, minValue, nonEmpty, number, object, optional, parse, pipe, safeParse, string, transform } from 'valibot'

import { adminGuard } from '../../../middlewares/admin-guard'
import { authGuard } from '../../../middlewares/auth'
import { createBadRequestError, createNotFoundError } from '../../../utils/error'

/**
 * Per-batch upper bound on amount per user. Caps a single typo from
 * issuing absurd amounts. Operator can override later via configKV.
 */
const MAX_GRANT_AMOUNT_PER_USER = 10_000

/**
 * Hard cap on emails per single batch request. Beyond this we'd rather
 * the operator chunk into multiple batches.
 */
const MAX_EMAILS_PER_BATCH = 10_000

const CreateBatchBodySchema = object({
  name: pipe(string(), nonEmpty('name is required'), maxLength(100)),
  amount: pipe(
    number(),
    integer('amount must be an integer'),
    minValue(1, 'amount must be at least 1'),
    maxValue(MAX_GRANT_AMOUNT_PER_USER, `amount must be at most ${MAX_GRANT_AMOUNT_PER_USER}`),
  ),
  description: optional(pipe(string(), maxLength(500))),
  emails: pipe(
    array(pipe(string(), email('emails must be valid email addresses'))),
    minLength(1, 'emails must not be empty'),
    maxLength(MAX_EMAILS_PER_BATCH, `emails must be at most ${MAX_EMAILS_PER_BATCH} entries`),
  ),
})

const ListQuerySchema = object({
  limit: optional(
    pipe(string(), transform(Number), integer(), minValue(1), maxValue(100)),
    '20',
  ),
  cursor: optional(string()),
  status: optional(string()),
})

/**
 * Routes for `/api/admin/flux-grant-batches/*`.
 *
 * Use when:
 * - Mounting under `/api/admin/flux-grant-batches` in `app.ts`
 *
 * Expects:
 * - `sessionMiddleware` already attached (so `c.get('user')` is populated)
 * - `env.ADMIN_EMAILS` configured for the deployment
 *
 * Returns:
 * - A Hono sub-router. The caller mounts it; `app.ts` attaches CORS/body
 *   limit/error handlers globally.
 */
export function createAdminFluxGrantBatchRoutes(
  fluxGrantBatchService: FluxGrantBatchService,
  env: Env,
  /**
   * Throttle hint surfaced in dry-run preview to give an estimated duration.
   * Comes from the same configKV/env value the worker uses.
   * @default 50
   */
  throttlePerSec: number = 50,
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

      const parsed = safeParse(CreateBatchBodySchema, raw)
      if (!parsed.success) {
        throw createBadRequestError(
          'Invalid request body',
          'INVALID_BODY',
          parsed.issues.map(i => ({ path: i.path?.map(p => p.key).join('.'), message: i.message })),
        )
      }

      const body = parsed.output

      if (dryRun) {
        const summary = await fluxGrantBatchService.preview({
          name: body.name,
          amount: body.amount,
          description: body.description,
          emails: body.emails,
          throttlePerSec,
        })
        return c.json({ preview: summary })
      }

      const { batch, summary } = await fluxGrantBatchService.create({
        name: body.name,
        amount: body.amount,
        description: body.description,
        emails: body.emails,
        createdByUserId: user.id,
        throttlePerSec,
      })

      return c.json({
        batch: {
          id: batch.id,
          name: batch.name,
          status: batch.status,
          createdAt: batch.createdAt.toISOString(),
          createdByUserId: batch.createdByUserId,
        },
        summary: {
          totalEmails: summary.totalEmails,
          pending: summary.willGrant,
          skipped: summary.willSkip.notFound + summary.willSkip.userDeleted + summary.willSkip.duplicateInInput,
          totalFluxToIssue: summary.totalFluxToIssue,
        },
      }, 202)
    })
    .get('/', async (c) => {
      const query = parse(ListQuerySchema, {
        limit: c.req.query('limit'),
        cursor: c.req.query('cursor'),
        status: c.req.query('status'),
      })

      const { batches, nextCursor } = await fluxGrantBatchService.list({
        limit: query.limit,
        cursor: query.cursor,
        status: query.status,
      })

      return c.json({
        batches: batches.map(b => ({
          id: b.id,
          name: b.name,
          type: b.type,
          amount: b.amount,
          status: b.status,
          createdByUserId: b.createdByUserId,
          createdAt: b.createdAt.toISOString(),
          startedAt: b.startedAt?.toISOString() ?? null,
          completedAt: b.completedAt?.toISOString() ?? null,
        })),
        nextCursor,
      })
    })
    .get('/:id', async (c) => {
      const id = c.req.param('id')
      const result = await fluxGrantBatchService.get(id)
      if (!result)
        throw createNotFoundError('Flux grant batch not found', { id })

      return c.json({
        batch: {
          id: result.batch.id,
          name: result.batch.name,
          type: result.batch.type,
          amount: result.batch.amount,
          description: result.batch.description,
          status: result.batch.status,
          createdByUserId: result.batch.createdByUserId,
          createdAt: result.batch.createdAt.toISOString(),
          startedAt: result.batch.startedAt?.toISOString() ?? null,
          completedAt: result.batch.completedAt?.toISOString() ?? null,
        },
        progress: result.progress,
        recentFailures: result.recentFailures.map(f => ({
          id: f.id,
          inputEmail: f.inputEmail,
          userId: f.userId,
          errorReason: f.errorReason,
          attemptCount: f.attemptCount,
          lastAttemptedAt: f.lastAttemptedAt?.toISOString() ?? null,
        })),
      })
    })
    .post('/:id/retry', async (c) => {
      const id = c.req.param('id')
      const existing = await fluxGrantBatchService.get(id)
      if (!existing)
        throw createNotFoundError('Flux grant batch not found', { id })

      const result = await fluxGrantBatchService.retryFailed(id)
      return c.json(result)
    })
}
