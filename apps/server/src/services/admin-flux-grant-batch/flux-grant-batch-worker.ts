import type { Database } from '../../libs/db'
import type { BillingService } from '../billing/billing-service'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'

import {
  finalizeBatchIfDone,
  findActiveBatches,
  markBatchStartedIfNeeded,
} from './flux-grant-batch-service'

import * as fluxSchema from '../../schemas/flux'
import * as batchSchema from '../../schemas/flux-grant-batch'

const logger = useLogger('admin-flux-grant-batch-worker').useGlobalConfig()

export interface FluxGrantBatchWorkerOptions {
  /**
   * How many pending recipients the worker tries to process per polling tick.
   * @default 50
   */
  batchSize?: number
  /**
   * How many grants to issue per second across this worker instance.
   * Sleep between grant calls is `1000 / throttlePerSec`.
   * @default 50
   */
  throttlePerSec?: number
  /**
   * Maximum number of attempts before a recipient is marked `failed` permanently.
   * Operator can re-arm via `POST /api/admin/flux-grant-batches/:id/retry`.
   * @default 3
   */
  maxAttempts?: number
  /**
   * Sleep duration when no work is available, in ms.
   * @default 1000
   */
  idleSleepMs?: number
}

const DEFAULTS = {
  batchSize: 50,
  throttlePerSec: 50,
  maxAttempts: 3,
  idleSleepMs: 1000,
} as const

/**
 * Compute the next-attempt cooldown for a recipient whose previous attempt failed.
 *
 * Schedule:
 * - attempt 0 → 0s   (never attempted)
 * - attempt 1 → 30s
 * - attempt 2 → 5min
 * - attempt 3+ → terminal (handled by caller, not this fn)
 */
export function backoffMs(attempt: number): number {
  if (attempt <= 0)
    return 0
  if (attempt === 1)
    return 30_000
  return 5 * 60_000
}

/**
 * Sleep that wakes up early when the abort signal fires.
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0)
    return Promise.resolve()
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onAbort = () => {
      if (timer != null)
        clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Claim up to `batchSize` pending recipients whose backoff has elapsed.
 *
 * Use when:
 * - Worker tick wants a fresh batch of recipients to process
 *
 * Expects:
 * - Caller is OK with rows being locked for the duration of `processBatch`;
 *   we don't pre-commit a "claimed" status because the row stays locked under
 *   `FOR UPDATE SKIP LOCKED` until the outer transaction completes.
 *
 * Returns:
 * - Up to `batchSize` rows joined with parent batch meta. Empty array means
 *   no work for this batch right now.
 */
async function selectClaimablePending(
  db: Database,
  batchId: string,
  batchSize: number,
  now: Date,
) {
  // Backoff cutoffs are encoded as a SQL expression: a row is claimable if
  // last_attempted_at IS NULL OR (now - last_attempted_at) >= backoff(attempt_count).
  // Step function: ≤0 attempts → 0s, =1 → 30s, ≥2 → 5min.
  return db
    .select({
      recipientId: batchSchema.fluxGrantBatchRecipient.id,
      batchId: batchSchema.fluxGrantBatchRecipient.batchId,
      userId: batchSchema.fluxGrantBatchRecipient.userId,
      inputEmail: batchSchema.fluxGrantBatchRecipient.inputEmail,
      attemptCount: batchSchema.fluxGrantBatchRecipient.attemptCount,
      batchName: batchSchema.fluxGrantBatch.name,
      batchAmount: batchSchema.fluxGrantBatch.amount,
      batchDescription: batchSchema.fluxGrantBatch.description,
    })
    .from(batchSchema.fluxGrantBatchRecipient)
    .innerJoin(
      batchSchema.fluxGrantBatch,
      eq(batchSchema.fluxGrantBatch.id, batchSchema.fluxGrantBatchRecipient.batchId),
    )
    .where(and(
      eq(batchSchema.fluxGrantBatchRecipient.batchId, batchId),
      eq(batchSchema.fluxGrantBatchRecipient.status, 'pending'),
      or(
        isNull(batchSchema.fluxGrantBatchRecipient.lastAttemptedAt),
        sql`${batchSchema.fluxGrantBatchRecipient.lastAttemptedAt} +
          (CASE
            WHEN ${batchSchema.fluxGrantBatchRecipient.attemptCount} <= 0 THEN INTERVAL '0 seconds'
            WHEN ${batchSchema.fluxGrantBatchRecipient.attemptCount} = 1 THEN INTERVAL '30 seconds'
            ELSE INTERVAL '5 minutes'
          END) <= ${now}`,
      ),
    ))
    .orderBy(asc(batchSchema.fluxGrantBatchRecipient.createdAt))
    .limit(batchSize)
    .for('update', { skipLocked: true })
}

/**
 * Process one recipient: re-check user soft-delete, call creditFlux, mark outcome.
 *
 * Use when:
 * - Inside the transaction holding the `FOR UPDATE SKIP LOCKED` row
 *
 * Expects:
 * - `userId` is non-null (NULL recipients are pre-skipped at creation time and
 *   never enter the worker queue)
 *
 * Returns:
 * - 'granted' | 'skipped' | 'failed_transient' | 'failed_permanent'
 */
async function processSingleRecipient(
  deps: { db: Database, billingService: BillingService },
  recipient: {
    recipientId: string
    batchId: string
    userId: string
    inputEmail: string
    attemptCount: number
    batchName: string
    batchAmount: number
    batchDescription: string | null
  },
  maxAttempts: number,
  now: Date,
): Promise<'granted' | 'skipped' | 'failed_transient' | 'failed_permanent'> {
  // Re-check soft-delete. The user might have signed off between batch
  // creation and worker pick-up.
  const [fluxRow] = await deps.db
    .select({ deletedAt: fluxSchema.userFlux.deletedAt })
    .from(fluxSchema.userFlux)
    .where(eq(fluxSchema.userFlux.userId, recipient.userId))
    .limit(1)

  if (fluxRow && fluxRow.deletedAt != null) {
    await deps.db
      .update(batchSchema.fluxGrantBatchRecipient)
      .set({
        status: 'skipped',
        errorReason: 'user_deleted_after_resolution',
        lastAttemptedAt: now,
      })
      .where(eq(batchSchema.fluxGrantBatchRecipient.id, recipient.recipientId))
    return 'skipped'
  }

  try {
    const result = await deps.billingService.creditFlux({
      userId: recipient.userId,
      amount: recipient.batchAmount,
      type: 'promo',
      requestId: `flux-grant-batch-${recipient.batchId}-${recipient.recipientId}`,
      description: recipient.batchDescription ?? `Flux grant batch: ${recipient.batchName}`,
      source: 'admin_promo',
      auditMetadata: {
        batchId: recipient.batchId,
        batchName: recipient.batchName,
        recipientId: recipient.recipientId,
      },
    })

    await deps.db
      .update(batchSchema.fluxGrantBatchRecipient)
      .set({
        status: 'granted',
        attemptCount: recipient.attemptCount + 1,
        lastAttemptedAt: now,
        fluxTransactionId: result.fluxTransactionId,
        errorReason: null,
      })
      .where(eq(batchSchema.fluxGrantBatchRecipient.id, recipient.recipientId))

    return 'granted'
  }
  catch (err) {
    const nextAttempt = recipient.attemptCount + 1
    const errorMessage = errorMessageFrom(err) ?? 'Unknown error'
    const isPermanent = nextAttempt >= maxAttempts

    await deps.db
      .update(batchSchema.fluxGrantBatchRecipient)
      .set({
        status: isPermanent ? 'failed' : 'pending',
        attemptCount: nextAttempt,
        lastAttemptedAt: now,
        errorReason: errorMessage.slice(0, 500),
      })
      .where(eq(batchSchema.fluxGrantBatchRecipient.id, recipient.recipientId))

    logger.withError(err).withFields({
      recipientId: recipient.recipientId,
      batchId: recipient.batchId,
      userId: recipient.userId,
      attempt: nextAttempt,
      isPermanent,
    }).warn('Recipient grant attempt failed')

    return isPermanent ? 'failed_permanent' : 'failed_transient'
  }
}

/**
 * Run the flux grant batch worker polling loop until `signal` aborts.
 *
 * Use when:
 * - Started alongside the billing-consumer role in `bin/run-billing-consumer.ts`
 *
 * Expects:
 * - `billingService` writes to the same DB / Redis / billing stream as the
 *   API process (multi-instance Railway deployment)
 *
 * Call stack:
 *
 * runBillingConsumer (../bin/run-billing-consumer)
 *   -> {@link runFluxGrantBatchWorker}
 *     -> {@link findActiveBatches}
 *     -> {@link selectClaimablePending} (FOR UPDATE SKIP LOCKED)
 *       -> {@link processSingleRecipient}
 *         -> billingService.creditFlux (writes ledger + cache + event)
 *     -> {@link finalizeBatchIfDone}
 */
export async function runFluxGrantBatchWorker(
  deps: { db: Database, billingService: BillingService },
  signal: AbortSignal,
  options: FluxGrantBatchWorkerOptions = {},
): Promise<void> {
  const batchSize = options.batchSize ?? DEFAULTS.batchSize
  const throttlePerSec = options.throttlePerSec ?? DEFAULTS.throttlePerSec
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts
  const idleSleepMs = options.idleSleepMs ?? DEFAULTS.idleSleepMs
  const perGrantSleepMs = Math.max(0, Math.floor(1000 / throttlePerSec))

  logger.withFields({ batchSize, throttlePerSec, maxAttempts, idleSleepMs }).log('Flux grant batch worker started')

  while (!signal.aborted) {
    try {
      const now = new Date()
      const active = await findActiveBatches(deps.db, now)

      if (active.length === 0) {
        await sleep(idleSleepMs, signal)
        continue
      }

      let totalProcessed = 0

      for (const batch of active) {
        if (signal.aborted)
          break

        await markBatchStartedIfNeeded(deps.db, batch.id, now)

        // Process the batch in transactional chunks. Each chunk holds
        // FOR UPDATE SKIP LOCKED on its rows for the duration of the tx.
        await deps.db.transaction(async (tx) => {
          const claimed = await selectClaimablePending(tx as unknown as Database, batch.id, batchSize, now)
          if (claimed.length === 0)
            return

          for (const recipient of claimed) {
            if (signal.aborted)
              break
            if (recipient.userId == null) {
              // Defensive: NULL userId rows should never be 'pending' (they're
              // resolved as 'skipped' at creation), but if one slips in mark it
              // skipped here too.
              await (tx as unknown as Database)
                .update(batchSchema.fluxGrantBatchRecipient)
                .set({ status: 'skipped', errorReason: 'not_found', lastAttemptedAt: now })
                .where(eq(batchSchema.fluxGrantBatchRecipient.id, recipient.recipientId))
              totalProcessed++
              continue
            }

            await processSingleRecipient(
              { db: tx as unknown as Database, billingService: deps.billingService },
              {
                recipientId: recipient.recipientId,
                batchId: recipient.batchId,
                userId: recipient.userId,
                inputEmail: recipient.inputEmail,
                attemptCount: recipient.attemptCount,
                batchName: recipient.batchName,
                batchAmount: recipient.batchAmount,
                batchDescription: recipient.batchDescription,
              },
              maxAttempts,
              now,
            )

            totalProcessed++
            if (perGrantSleepMs > 0)
              await sleep(perGrantSleepMs, signal)
          }
        })

        // After a chunk run, see whether this batch is now done.
        await finalizeBatchIfDone(deps.db, batch.id, new Date())
      }

      // No work this tick → idle sleep so we don't hammer the DB.
      if (totalProcessed === 0)
        await sleep(idleSleepMs, signal)
    }
    catch (err) {
      logger.withError(err).error('Flux grant batch worker tick failed; sleeping before retry')
      await sleep(idleSleepMs, signal)
    }
  }

  logger.log('Flux grant batch worker stopped')
}
