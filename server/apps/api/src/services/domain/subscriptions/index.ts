import type { Database } from '../../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, asc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm'

import { availableMicroCredits, MICRO_PER_CREDIT, postMicroCredits } from '../billing/credit-posting'

import * as schema from '../../../schemas/subscription'

const logger = useLogger('subscriptions')

/** The one plan period that pays for a user now. */
export interface PlanPeriod {
  entitlementId: string
  grantedCredit: number
  periodStart: Date
  /** Null for a plan that does not expire. */
  periodEnd: Date | null
}

function usableAllowanceSql() {
  return sql`((${schema.subscriptionAllowance.grantedCredit} - ${schema.subscriptionAllowance.usedCredit})::bigint * ${MICRO_PER_CREDIT}) > ${schema.subscriptionAllowance.unsettledMicroCredit}`
}

function openAllowanceWhere(userId: string, now: Date) {
  return and(
    eq(schema.subscriptionAllowance.userId, userId),
    or(
      isNull(schema.subscriptionAllowance.periodEnd),
      gt(schema.subscriptionAllowance.periodEnd, now),
    ),
    usableAllowanceSql(),
  )
}

/**
 * Local Credit ledger for subscription plans.
 * RevenueCat owns entitlement status. This module stores only the Credit
 * grant for each period and the debits against it.
 */
export function createSubscriptionService(db: Database) {
  /**
   * Makes the ledger match the plan period that `resolve` returns.
   *
   * A new period gets a full grant. A known period keeps its spent Credits
   * and takes the new end time. Every other open period of the user closes,
   * so its unused Credits are forfeit. A `null` result closes all periods.
   *
   * `resolve` runs under a lock for this user. Two syncs for one user
   * cannot write an older answer after a newer answer.
   */
  async function syncPeriod(userId: string, resolve: () => Promise<PlanPeriod | null>): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)

      const period = await resolve()
      const now = new Date()
      let currentId: string | null = null

      if (period) {
        const [row] = await tx.insert(schema.subscriptionAllowance).values({
          userId,
          entitlementId: period.entitlementId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          grantedCredit: period.grantedCredit,
        }).onConflictDoUpdate({
          target: [
            schema.subscriptionAllowance.userId,
            schema.subscriptionAllowance.entitlementId,
            schema.subscriptionAllowance.periodStart,
          ],
          set: { periodEnd: period.periodEnd, updatedAt: now },
        }).returning({ id: schema.subscriptionAllowance.id })
        currentId = row!.id
      }

      await tx.update(schema.subscriptionAllowance)
        .set({ periodEnd: now, updatedAt: now })
        .where(and(
          eq(schema.subscriptionAllowance.userId, userId),
          currentId == null ? undefined : ne(schema.subscriptionAllowance.id, currentId),
          or(
            isNull(schema.subscriptionAllowance.periodEnd),
            gt(schema.subscriptionAllowance.periodEnd, now),
          ),
        ))
    })
  }

  async function listOpenAllowances(userId: string, now: Date) {
    return db
      .select()
      .from(schema.subscriptionAllowance)
      .where(openAllowanceWhere(userId, now))
      .orderBy(asc(schema.subscriptionAllowance.periodEnd))
  }

  /** Open Credit periods with a usable remainder. */
  async function getStatus(userId: string, now: Date = new Date()) {
    const allowances = await listOpenAllowances(userId, now)

    return {
      allowances: allowances.map((row) => {
        const remainingMicro = Number(availableMicroCredits({
          credits: row.grantedCredit - row.usedCredit,
          unsettledMicro: row.unsettledMicroCredit,
        }))
        return {
          entitlementId: row.entitlementId,
          periodStart: row.periodStart.toISOString(),
          periodEnd: row.periodEnd?.toISOString() ?? null,
          grantedCredit: row.grantedCredit,
          usedCredit: row.usedCredit,
          unsettledMicroCredit: row.unsettledMicroCredit,
          remainingMicro,
          remainingCredit: remainingMicro / MICRO_PER_CREDIT,
        }
      }),
    }
  }

  /**
   * Remaining micro-Credits on the earliest open period.
   * A later period does not increase this amount.
   * Debit spends this same period.
   */
  async function spendableMicro(userId: string, now: Date = new Date()): Promise<number> {
    const [period] = await listOpenAllowances(userId, now)
    if (!period)
      return 0
    return Number(availableMicroCredits({
      credits: period.grantedCredit - period.usedCredit,
      unsettledMicro: period.unsettledMicroCredit,
    }))
  }

  /**
   * Debits micro-Credits from the earliest-expiring open period when the
   * period covers the whole fee. A short period is left untouched.
   * Retries with the same requestId replay the original charge.
   */
  async function debitCredits(input: {
    userId: string
    microCredit: number
    requestId: string
  }): Promise<{ chargedMicro: number, requestedMicro: number, replay: boolean }> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ microCredit: schema.subscriptionConsumption.microCredit })
        .from(schema.subscriptionConsumption)
        .where(eq(schema.subscriptionConsumption.requestId, input.requestId))
        .limit(1)

      if (existing)
        return { chargedMicro: existing.microCredit, requestedMicro: input.microCredit, replay: true }

      const now = new Date()
      const [period] = await tx
        .select()
        .from(schema.subscriptionAllowance)
        .where(openAllowanceWhere(input.userId, now))
        .orderBy(asc(schema.subscriptionAllowance.periodEnd))
        .for('update')
        .limit(1)

      if (!period || availableMicroCredits({
        credits: period.grantedCredit - period.usedCredit,
        unsettledMicro: period.unsettledMicroCredit,
      }) < BigInt(input.microCredit)) {
        return { chargedMicro: 0, requestedMicro: input.microCredit, replay: false }
      }

      const posted = postMicroCredits({
        credits: period.grantedCredit - period.usedCredit,
        unsettledMicro: period.unsettledMicroCredit,
      }, input.microCredit)

      await tx.insert(schema.subscriptionConsumption).values({
        requestId: input.requestId,
        userId: input.userId,
        allowanceId: period.id,
        microCredit: input.microCredit,
      }).onConflictDoNothing()

      await tx.update(schema.subscriptionAllowance)
        .set({
          usedCredit: period.grantedCredit - posted.credits,
          unsettledMicroCredit: posted.unsettledMicro,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptionAllowance.id, period.id))

      return { chargedMicro: input.microCredit, requestedMicro: input.microCredit, replay: false }
    })
  }

  async function getFallbackPreference(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ fallbackToFlux: schema.userBillingPreference.fallbackToFlux })
      .from(schema.userBillingPreference)
      .where(eq(schema.userBillingPreference.userId, userId))
      .limit(1)
    return row?.fallbackToFlux ?? false
  }

  async function setFallbackPreference(userId: string, fallbackToFlux: boolean): Promise<boolean> {
    const [row] = await db.insert(schema.userBillingPreference).values({
      userId,
      fallbackToFlux,
    }).onConflictDoUpdate({
      target: schema.userBillingPreference.userId,
      set: { fallbackToFlux, updatedAt: new Date() },
    }).returning({ fallbackToFlux: schema.userBillingPreference.fallbackToFlux })
    return row?.fallbackToFlux ?? fallbackToFlux
  }

  async function deleteAllForUser(userId: string) {
    await db.delete(schema.subscriptionAllowance)
      .where(eq(schema.subscriptionAllowance.userId, userId))
    await db.delete(schema.subscriptionConsumption)
      .where(eq(schema.subscriptionConsumption.userId, userId))
    await db.delete(schema.userBillingPreference)
      .where(eq(schema.userBillingPreference.userId, userId))
    logger.withFields({ userId }).log('Subscription rows deleted for user')
  }

  return {
    syncPeriod,
    getStatus,
    spendableMicro,
    debitCredits,
    getFallbackPreference,
    setFallbackPreference,
    deleteAllForUser,
  }
}

export type SubscriptionService = ReturnType<typeof createSubscriptionService>
