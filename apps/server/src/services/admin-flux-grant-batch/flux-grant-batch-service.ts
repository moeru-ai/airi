import type { Database } from '../../libs/db'

import { Buffer } from 'node:buffer'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import * as accountsSchema from '../../schemas/accounts'
import * as fluxSchema from '../../schemas/flux'
import * as batchSchema from '../../schemas/flux-grant-batch'

const logger = useLogger('admin-flux-grant-batch-service')

/**
 * Per-email outcome of resolving an input list against the user table.
 * Used by both dry-run preview and persisted recipient rows.
 */
export interface ResolvedEmail {
  inputEmail: string
  userId: string | null
  status: 'pending' | 'skipped'
  errorReason: 'not_found' | 'user_deleted' | 'duplicate_in_input' | null
}

export interface ResolveSummary {
  totalEmails: number
  willGrant: number
  willSkip: {
    notFound: number
    userDeleted: number
    duplicateInInput: number
  }
  totalFluxToIssue: number
  estimatedDurationSec: number
  samples: {
    willGrant: string[]
    notFound: string[]
    userDeleted: string[]
  }
}

/**
 * Resolve a list of input emails against the user table.
 *
 * Use when:
 * - Previewing a dry-run before batch creation
 * - Persisting `flux_grant_batch_recipient` rows with a deterministic resolution snapshot
 *
 * Expects:
 * - `emails` is non-empty; case is preserved in output but compared via LOWER
 *
 * Returns:
 * - One entry per input email (duplicates included with `duplicate_in_input`),
 *   plus a summary used directly in dry-run responses
 */
async function resolveEmails(
  db: Database,
  emails: string[],
  amountPerUser: number,
  throttlePerSec: number,
): Promise<{ resolved: ResolvedEmail[], summary: ResolveSummary }> {
  // Lowercase index of inputs → first-seen index. Subsequent occurrences are duplicates.
  const seenLower = new Map<string, number>()
  const resolved: ResolvedEmail[] = emails.map((email, idx) => {
    const lower = email.toLowerCase()
    if (seenLower.has(lower)) {
      return { inputEmail: email, userId: null, status: 'skipped', errorReason: 'duplicate_in_input' }
    }
    seenLower.set(lower, idx)
    return { inputEmail: email, userId: null, status: 'pending', errorReason: null }
  })

  const lowerEmails = Array.from(seenLower.keys())

  // Bulk-fetch matching users (case-insensitive). For 10k inputs this is one
  // query — Postgres handles `LOWER(email) IN (...)` fine on a unique index
  // because `email` is already unique; collation just means we filter post-fetch.
  const users = await db
    .select({ id: accountsSchema.user.id, email: accountsSchema.user.email })
    .from(accountsSchema.user)
    .where(inArray(sql`LOWER(${accountsSchema.user.email})`, lowerEmails))

  const userByLowerEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id]))

  // Bulk-fetch user_flux rows for matched userIds — only need to know which are soft-deleted.
  const matchedUserIds = users.map(u => u.id)
  const fluxRows = matchedUserIds.length > 0
    ? await db
        .select({ userId: fluxSchema.userFlux.userId, deletedAt: fluxSchema.userFlux.deletedAt })
        .from(fluxSchema.userFlux)
        .where(inArray(fluxSchema.userFlux.userId, matchedUserIds))
    : []
  const deletedUserIds = new Set(
    fluxRows.filter(r => r.deletedAt != null).map(r => r.userId),
  )

  // Annotate the resolved list now that we have user lookups + deletion status.
  for (const entry of resolved) {
    if (entry.errorReason === 'duplicate_in_input')
      continue

    const userId = userByLowerEmail.get(entry.inputEmail.toLowerCase())
    if (!userId) {
      entry.status = 'skipped'
      entry.errorReason = 'not_found'
      continue
    }

    if (deletedUserIds.has(userId)) {
      entry.userId = userId
      entry.status = 'skipped'
      entry.errorReason = 'user_deleted'
      continue
    }

    entry.userId = userId
    entry.status = 'pending'
  }

  // Counts and samples for preview output.
  const willGrant = resolved.filter(r => r.status === 'pending').length
  const notFound = resolved.filter(r => r.errorReason === 'not_found').length
  const userDeleted = resolved.filter(r => r.errorReason === 'user_deleted').length
  const duplicateInInput = resolved.filter(r => r.errorReason === 'duplicate_in_input').length

  const summary: ResolveSummary = {
    totalEmails: emails.length,
    willGrant,
    willSkip: { notFound, userDeleted, duplicateInInput },
    totalFluxToIssue: willGrant * amountPerUser,
    estimatedDurationSec: Math.ceil(willGrant / Math.max(1, throttlePerSec)),
    samples: {
      willGrant: resolved.filter(r => r.status === 'pending').slice(0, 5).map(r => r.inputEmail),
      notFound: resolved.filter(r => r.errorReason === 'not_found').slice(0, 5).map(r => r.inputEmail),
      userDeleted: resolved.filter(r => r.errorReason === 'user_deleted').slice(0, 5).map(r => r.inputEmail),
    },
  }

  return { resolved, summary }
}

export interface CreateBatchInput {
  name: string
  amount: number
  description?: string
  emails: string[]
  createdByUserId: string
  throttlePerSec: number
}

export function createFluxGrantBatchService(db: Database) {
  return {
    /**
     * Preview a batch without writing anything. Used by `?dryRun=true`.
     */
    async preview(input: Omit<CreateBatchInput, 'createdByUserId'>) {
      const { summary } = await resolveEmails(db, input.emails, input.amount, input.throttlePerSec)
      return summary
    },

    /**
     * Create a persistent batch + per-email recipient rows. Worker picks up
     * `pending` rows asynchronously.
     *
     * Resolution happens here (not in the worker) so dry-run preview numbers
     * match real execution exactly.
     */
    async create(input: CreateBatchInput) {
      const { resolved, summary } = await resolveEmails(
        db,
        input.emails,
        input.amount,
        input.throttlePerSec,
      )

      const batchRow = await db.transaction(async (tx) => {
        const [created] = await tx.insert(batchSchema.fluxGrantBatch).values({
          name: input.name,
          type: 'promo',
          amount: input.amount,
          description: input.description,
          status: 'created',
          createdByUserId: input.createdByUserId,
        }).returning()

        if (!created)
          throw new Error('Failed to insert flux_grant_batch row')

        const recipientRows = resolved.map(r => ({
          batchId: created.id,
          inputEmail: r.inputEmail,
          userId: r.userId,
          status: r.status,
          errorReason: r.errorReason,
        }))

        // Chunk inserts to keep a single statement under Postgres' parameter limit
        // (≈ 65k params; 5 cols/row = ≈ 13k rows per chunk; we use 1k for headroom).
        const CHUNK = 1000
        for (let i = 0; i < recipientRows.length; i += CHUNK)
          await tx.insert(batchSchema.fluxGrantBatchRecipient).values(recipientRows.slice(i, i + CHUNK))

        return created
      })

      logger.withFields({
        batchId: batchRow.id,
        name: input.name,
        userCount: input.emails.length,
        willGrant: summary.willGrant,
      }).log('Flux grant batch created')

      return { batch: batchRow, summary }
    },

    /**
     * Get batch + progress counts + recent failure samples.
     * Returns null if the batch does not exist.
     */
    async get(batchId: string) {
      const [row] = await db
        .select()
        .from(batchSchema.fluxGrantBatch)
        .where(eq(batchSchema.fluxGrantBatch.id, batchId))
        .limit(1)

      if (!row)
        return null

      const recipientStatusRows = await db
        .select({ status: batchSchema.fluxGrantBatchRecipient.status, count: sql<number>`count(*)::int` })
        .from(batchSchema.fluxGrantBatchRecipient)
        .where(eq(batchSchema.fluxGrantBatchRecipient.batchId, batchId))
        .groupBy(batchSchema.fluxGrantBatchRecipient.status)

      const progress = { total: 0, pending: 0, granted: 0, skipped: 0, failed: 0 }
      for (const r of recipientStatusRows) {
        progress.total += r.count
        if (r.status === 'pending')
          progress.pending = r.count
        else if (r.status === 'granted')
          progress.granted = r.count
        else if (r.status === 'skipped')
          progress.skipped = r.count
        else if (r.status === 'failed')
          progress.failed = r.count
      }

      const recentFailures = await db
        .select({
          id: batchSchema.fluxGrantBatchRecipient.id,
          inputEmail: batchSchema.fluxGrantBatchRecipient.inputEmail,
          userId: batchSchema.fluxGrantBatchRecipient.userId,
          errorReason: batchSchema.fluxGrantBatchRecipient.errorReason,
          attemptCount: batchSchema.fluxGrantBatchRecipient.attemptCount,
          lastAttemptedAt: batchSchema.fluxGrantBatchRecipient.lastAttemptedAt,
        })
        .from(batchSchema.fluxGrantBatchRecipient)
        .where(and(
          eq(batchSchema.fluxGrantBatchRecipient.batchId, batchId),
          eq(batchSchema.fluxGrantBatchRecipient.status, 'failed'),
        ))
        .orderBy(desc(batchSchema.fluxGrantBatchRecipient.lastAttemptedAt))
        .limit(20)

      return { batch: row, progress, recentFailures }
    },

    /**
     * Paginated list. Cursor is the last seen createdAt+id pair, base64-encoded.
     */
    async list(opts: { limit: number, cursor?: string, status?: string }) {
      const limit = Math.min(100, Math.max(1, opts.limit))
      let cursorTime: Date | null = null
      let cursorId: string | null = null

      if (opts.cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(opts.cursor, 'base64').toString('utf-8'))
          cursorTime = new Date(decoded.t)
          cursorId = decoded.i
        }
        catch {
          // bad cursor → treat as no cursor
        }
      }

      const whereParts = []
      if (opts.status)
        whereParts.push(eq(batchSchema.fluxGrantBatch.status, opts.status))
      if (cursorTime && cursorId) {
        whereParts.push(sql`(${batchSchema.fluxGrantBatch.createdAt}, ${batchSchema.fluxGrantBatch.id}) < (${cursorTime}, ${cursorId})`)
      }

      const rows = await db
        .select()
        .from(batchSchema.fluxGrantBatch)
        .where(whereParts.length > 0 ? and(...whereParts) : undefined)
        .orderBy(desc(batchSchema.fluxGrantBatch.createdAt), desc(batchSchema.fluxGrantBatch.id))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows

      let nextCursor: string | null = null
      if (hasMore) {
        const last = items[items.length - 1]!
        nextCursor = Buffer.from(JSON.stringify({ t: last.createdAt.toISOString(), i: last.id })).toString('base64')
      }

      return { batches: items, nextCursor }
    },

    /**
     * Reset all `failed` recipients in a batch back to `pending` so the worker
     * picks them up on the next poll. Idempotent: returns 0 when nothing is failed.
     *
     * Returns:
     * - { retriedCount } — number of rows transitioned from failed → pending
     */
    async retryFailed(batchId: string) {
      const updated = await db
        .update(batchSchema.fluxGrantBatchRecipient)
        .set({
          status: 'pending',
          attemptCount: 0,
          lastAttemptedAt: null,
          errorReason: null,
        })
        .where(and(
          eq(batchSchema.fluxGrantBatchRecipient.batchId, batchId),
          eq(batchSchema.fluxGrantBatchRecipient.status, 'failed'),
        ))
        .returning({ id: batchSchema.fluxGrantBatchRecipient.id })

      // If a batch was completed and we re-opened pending rows, flip its
      // status back to running so the worker picks it up.
      if (updated.length > 0) {
        await db
          .update(batchSchema.fluxGrantBatch)
          .set({ status: 'running', completedAt: null })
          .where(and(
            eq(batchSchema.fluxGrantBatch.id, batchId),
            inArray(batchSchema.fluxGrantBatch.status, ['completed', 'failed_partial']),
          ))
      }

      logger.withFields({ batchId, retriedCount: updated.length }).log('Retry failed recipients')
      return { retriedCount: updated.length }
    },
  }
}

export type FluxGrantBatchService = ReturnType<typeof createFluxGrantBatchService>

/**
 * Exported for test reuse.
 */
export { resolveEmails }

/**
 * Worker-side query: count remaining pending recipients for a batch. Used to
 * decide when to flip batch status to completed/failed_partial.
 *
 * Returns:
 * - { pending, failed, total } counts
 */
export async function getBatchTerminalCheck(db: Database, batchId: string) {
  const rows = await db
    .select({ status: batchSchema.fluxGrantBatchRecipient.status, count: sql<number>`count(*)::int` })
    .from(batchSchema.fluxGrantBatchRecipient)
    .where(eq(batchSchema.fluxGrantBatchRecipient.batchId, batchId))
    .groupBy(batchSchema.fluxGrantBatchRecipient.status)

  let pending = 0
  let failed = 0
  let total = 0
  for (const r of rows) {
    total += r.count
    if (r.status === 'pending')
      pending = r.count
    else if (r.status === 'failed')
      failed = r.count
  }
  return { pending, failed, total }
}

/**
 * Worker-side query: find batches that are still in `created` or `running`
 * and have at least one pending recipient whose backoff has elapsed. Workers
 * iterate this set so they don't waste polls on empty/finished batches.
 *
 * NOTICE:
 * Why this isn't `selectDistinct(...).innerJoin(recipient)`:
 * Postgres rejects `SELECT DISTINCT ... ORDER BY col` when `col` isn't in
 * the select list (sqlstate 42P10). We previously had `orderBy(createdAt)`
 * with only `id` + `status` selected → runtime crash on the first worker
 * tick (caught during local dev 2026-05-08).
 *
 * Switched to a plain `SELECT … WHERE EXISTS (recipient row meeting
 * criteria)`, which is also conceptually right: "show me batches that
 * have at least one ready-to-process recipient", not "join then dedupe".
 */
export async function findActiveBatches(db: Database, now: Date) {
  const rows = await db
    .select({
      id: batchSchema.fluxGrantBatch.id,
      status: batchSchema.fluxGrantBatch.status,
    })
    .from(batchSchema.fluxGrantBatch)
    .where(and(
      inArray(batchSchema.fluxGrantBatch.status, ['created', 'running']),
      sql`EXISTS (
        SELECT 1 FROM ${batchSchema.fluxGrantBatchRecipient}
        WHERE ${batchSchema.fluxGrantBatchRecipient.batchId} = ${batchSchema.fluxGrantBatch.id}
          AND ${batchSchema.fluxGrantBatchRecipient.status} = 'pending'
          AND (${batchSchema.fluxGrantBatchRecipient.lastAttemptedAt} IS NULL
               OR ${batchSchema.fluxGrantBatchRecipient.lastAttemptedAt} < ${now})
      )`,
    ))
    .orderBy(batchSchema.fluxGrantBatch.createdAt)

  return rows
}

/**
 * Worker-side helper: mark a batch started (status='running', startedAt set)
 * if it's still 'created'. Idempotent: no-op when already running.
 */
export async function markBatchStartedIfNeeded(db: Database, batchId: string, now: Date) {
  await db
    .update(batchSchema.fluxGrantBatch)
    .set({ status: 'running', startedAt: now })
    .where(and(
      eq(batchSchema.fluxGrantBatch.id, batchId),
      eq(batchSchema.fluxGrantBatch.status, 'created'),
      isNull(batchSchema.fluxGrantBatch.startedAt),
    ))
}

/**
 * Worker-side helper: when no pending rows remain, flip the batch to a
 * terminal status. `failed_partial` if any failed/skipped, else `completed`.
 * Idempotent: skips batches already in terminal status.
 */
export async function finalizeBatchIfDone(db: Database, batchId: string, now: Date) {
  const counts = await getBatchTerminalCheck(db, batchId)
  if (counts.pending > 0)
    return

  const terminal = counts.failed > 0 ? 'failed_partial' : 'completed'

  await db
    .update(batchSchema.fluxGrantBatch)
    .set({ status: terminal, completedAt: now })
    .where(and(
      eq(batchSchema.fluxGrantBatch.id, batchId),
      inArray(batchSchema.fluxGrantBatch.status, ['created', 'running']),
    ))
}
