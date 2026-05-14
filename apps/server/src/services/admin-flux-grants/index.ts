import type { Database } from '../../libs/db'
import type { BillingService } from '../billing/billing-service'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { inArray } from 'drizzle-orm'

import * as accountsSchema from '../../schemas/accounts'
import * as fluxSchema from '../../schemas/flux'

const logger = useLogger('admin-flux-grants').useGlobalConfig()

export type SkipReason = 'duplicate_in_input' | 'not_found' | 'user_deleted'

export interface ResolvedRecipient {
  inputEmail: string
  userId: string | null
  status: 'pending' | 'skipped'
  errorReason: SkipReason | null
}

export interface PreviewSummary {
  totalEmails: number
  willGrant: number
  willSkip: { notFound: number, userDeleted: number, duplicateInInput: number }
  totalFluxToIssue: number
  samples: { willGrant: string[], notFound: string[], userDeleted: string[] }
}

export interface GrantResult {
  granted: { email: string, userId: string, fluxTransactionId: string, balanceAfter: number }[]
  skipped: { email: string, reason: SkipReason }[]
  failed: { email: string, userId: string, error: string }[]
}

export interface GrantInput {
  amount: number
  description: string
  emails: string[]
  createdByUserId: string
  /**
   * When provided, recipient `requestId`s are derived as
   * `flux-grant:${idempotencyKey}:${userId}` so re-running the same call
   * with the same key + recipients is a no-op (handled by the partial
   * unique index on `flux_transaction(user_id, request_id)`).
   * When omitted, every recipient gets a fresh requestId — re-issuing the
   * same grant will double-credit, which is the right default for "I made
   * a typo and want to send again".
   */
  idempotencyKey?: string
}

/**
 * Resolve operator-supplied input emails against the user table.
 *
 * Use when:
 * - Either `preview` (dry-run) or the actual grant call needs the same
 *   per-email outcome shape
 *
 * Expects:
 * - `user.email` is stored lowercase (better-auth normalizes on signup
 *   for both email/password and OAuth). Wrapping the column in `LOWER()`
 *   in the query would bypass the unique index on `email` and force a
 *   sequential scan, so input is lowercased instead.
 *
 * Returns:
 * - One `ResolvedRecipient` per input email (duplicates included with
 *   `duplicate_in_input` so the caller can audit them)
 */
async function resolveEmails(db: Database, emails: string[]): Promise<ResolvedRecipient[]> {
  const seenLower = new Map<string, number>()
  const resolved: ResolvedRecipient[] = emails.map((email, idx) => {
    const lower = email.toLowerCase()
    if (seenLower.has(lower))
      return { inputEmail: email, userId: null, status: 'skipped', errorReason: 'duplicate_in_input' }
    seenLower.set(lower, idx)
    return { inputEmail: email, userId: null, status: 'pending', errorReason: null }
  })

  const lowerEmails = Array.from(seenLower.keys())

  const users = lowerEmails.length === 0
    ? []
    : await db
        .select({ id: accountsSchema.user.id, email: accountsSchema.user.email })
        .from(accountsSchema.user)
        .where(inArray(accountsSchema.user.email, lowerEmails))

  const userByLowerEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id]))

  const matchedUserIds = users.map(u => u.id)
  const fluxRows = matchedUserIds.length === 0
    ? []
    : await db
        .select({ userId: fluxSchema.userFlux.userId, deletedAt: fluxSchema.userFlux.deletedAt })
        .from(fluxSchema.userFlux)
        .where(inArray(fluxSchema.userFlux.userId, matchedUserIds))
  const deletedUserIds = new Set(fluxRows.filter(r => r.deletedAt != null).map(r => r.userId))

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

  return resolved
}

function buildPreviewSummary(resolved: ResolvedRecipient[], amountPerUser: number): PreviewSummary {
  const willGrant = resolved.filter(r => r.status === 'pending').length
  const notFound = resolved.filter(r => r.errorReason === 'not_found').length
  const userDeleted = resolved.filter(r => r.errorReason === 'user_deleted').length
  const duplicateInInput = resolved.filter(r => r.errorReason === 'duplicate_in_input').length

  return {
    totalEmails: resolved.length,
    willGrant,
    willSkip: { notFound, userDeleted, duplicateInInput },
    totalFluxToIssue: willGrant * amountPerUser,
    samples: {
      willGrant: resolved.filter(r => r.status === 'pending').slice(0, 5).map(r => r.inputEmail),
      notFound: resolved.filter(r => r.errorReason === 'not_found').slice(0, 5).map(r => r.inputEmail),
      userDeleted: resolved.filter(r => r.errorReason === 'user_deleted').slice(0, 5).map(r => r.inputEmail),
    },
  }
}

export function createAdminFluxGrantsService(deps: { db: Database, billingService: BillingService }) {
  const { db, billingService } = deps

  return {
    /**
     * Dry-run preview: returns what would happen without writing anything.
     */
    async preview(input: { amount: number, emails: string[] }): Promise<PreviewSummary> {
      const resolved = await resolveEmails(db, input.emails)
      return buildPreviewSummary(resolved, input.amount)
    },

    /**
     * Issue a grant to every resolvable email, sequentially.
     *
     * Use when:
     * - Admin clicks "send" on a grant. Returns once every recipient has
     *   either been credited, marked skipped (resolution-time issue), or
     *   marked failed (`creditFlux` threw).
     *
     * Expects:
     * - Caller has admin authority (route middleware enforces this)
     * - Batch size fits inside the load balancer timeout — the route
     *   layer caps `emails.length`
     *
     * Returns:
     * - Per-email outcome buckets. The same `inputEmail` order is preserved
     *   inside each bucket so the operator can spot recipient-specific
     *   issues without correlating across responses.
     */
    async grant(input: GrantInput): Promise<{ summary: PreviewSummary, result: GrantResult }> {
      const resolved = await resolveEmails(db, input.emails)
      const summary = buildPreviewSummary(resolved, input.amount)

      const result: GrantResult = { granted: [], skipped: [], failed: [] }

      for (const entry of resolved) {
        if (entry.status === 'skipped') {
          result.skipped.push({ email: entry.inputEmail, reason: entry.errorReason ?? 'not_found' })
          continue
        }
        // entry.status === 'pending' implies userId is set
        const userId = entry.userId!
        const requestId = input.idempotencyKey != null
          ? `flux-grant:${input.idempotencyKey}:${userId}`
          : undefined

        try {
          const credited = await billingService.creditFlux({
            userId,
            amount: input.amount,
            type: 'promo',
            requestId,
            description: input.description,
            source: 'admin_promo',
            auditMetadata: {
              description: input.description,
              issuedByUserId: input.createdByUserId,
              ...(input.idempotencyKey != null && { idempotencyKey: input.idempotencyKey }),
            },
          })
          result.granted.push({
            email: entry.inputEmail,
            userId,
            fluxTransactionId: credited.fluxTransactionId,
            balanceAfter: credited.balanceAfter,
          })
        }
        catch (err) {
          const message = errorMessageFrom(err) ?? 'Unknown error'
          result.failed.push({ email: entry.inputEmail, userId, error: message.slice(0, 500) })
          logger.withError(err).withFields({ userId, email: entry.inputEmail }).warn('Flux grant failed')
        }
      }

      logger.withFields({
        description: input.description,
        attempted: summary.willGrant,
        granted: result.granted.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
        amount: input.amount,
        issuedByUserId: input.createdByUserId,
      }).log('Admin flux grant completed')

      return { summary, result }
    },
  }
}

export type AdminFluxGrantsService = ReturnType<typeof createAdminFluxGrantsService>

/**
 * Exported for unit tests of resolution edge cases (case folding, duplicate
 * handling, soft-delete detection).
 */
export { resolveEmails }
