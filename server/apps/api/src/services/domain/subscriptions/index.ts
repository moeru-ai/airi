import type { Database } from '../../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm'

import { availableMicroCredits, MICRO_PER_CREDIT, postMicroCredits } from '../billing/credit-posting'

import * as schema from '../../../schemas/subscription'

const logger = useLogger('subscriptions')

interface AllowancePeriod {
  userId: string
  entitlementId: string
  grantedCredit: number
  periodStart: Date
  periodEnd?: Date | null
  /** Deduplicates redeliveries of the same grant. Null disables the check. */
  eventKey?: string | null
}

interface RevenuecatEventRecord {
  eventId: string
  type: string
  appUserId: string | null
  productId: string | null
  entitlementIds: string[]
  payload: unknown
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
 * RevenueCat owns entitlement status. Callers translate processor events
 * into period grants. This module never reads a processor payload.
 */
export function createSubscriptionService(db: Database) {
  async function hasEvent(eventId: string): Promise<boolean> {
    const [row] = await db
      .select({ eventId: schema.revenuecatEvent.eventId })
      .from(schema.revenuecatEvent)
      .where(eq(schema.revenuecatEvent.eventId, eventId))
      .limit(1)
    return row != null
  }

  /** Inserts one webhook event. A repeat `eventId` is ignored. */
  async function recordEvent(input: RevenuecatEventRecord): Promise<void> {
    await db.insert(schema.revenuecatEvent).values({
      eventId: input.eventId,
      type: input.type,
      appUserId: input.appUserId,
      productId: input.productId,
      entitlementIds: input.entitlementIds,
      payload: input.payload,
    }).onConflictDoNothing()
  }

  /**
   * Opens a fresh quota period and forfeits every other open period for the
   * user. An older period that arrives after a newer one is stored closed,
   * so the grant depends only on this event's own times.
   * Returns false on duplicate eventKey.
   */
  async function openPeriod(input: AllowancePeriod): Promise<boolean> {
    return db.transaction(async (tx) => {
      if (input.eventKey != null) {
        const [existing] = await tx
          .select({ id: schema.subscriptionAllowance.id })
          .from(schema.subscriptionAllowance)
          .where(eq(schema.subscriptionAllowance.eventId, input.eventKey))
          .limit(1)
        if (existing)
          return false
      }

      const [later] = await tx
        .select({ id: schema.subscriptionAllowance.id })
        .from(schema.subscriptionAllowance)
        .where(and(
          eq(schema.subscriptionAllowance.userId, input.userId),
          gt(schema.subscriptionAllowance.periodStart, input.periodStart),
        ))
        .limit(1)

      const superseded = later != null
      if (!superseded) {
        await tx.update(schema.subscriptionAllowance)
          .set({ periodEnd: input.periodStart, updatedAt: new Date() })
          .where(and(
            eq(schema.subscriptionAllowance.userId, input.userId),
            or(
              isNull(schema.subscriptionAllowance.periodEnd),
              gt(schema.subscriptionAllowance.periodEnd, input.periodStart),
            ),
          ))
      }

      const closedAt = new Date(Math.min(input.periodStart.getTime(), Date.now()))
      await tx.insert(schema.subscriptionAllowance).values({
        userId: input.userId,
        entitlementId: input.entitlementId,
        periodStart: input.periodStart,
        periodEnd: superseded ? closedAt : input.periodEnd,
        grantedCredit: input.grantedCredit,
        usedCredit: 0,
        unsettledMicroCredit: 0,
        eventId: input.eventKey,
      }).onConflictDoNothing()
      return true
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
    await db.delete(schema.revenuecatEvent)
      .where(eq(schema.revenuecatEvent.appUserId, userId))
    await db.delete(schema.subscriptionAllowance)
      .where(eq(schema.subscriptionAllowance.userId, userId))
    await db.delete(schema.subscriptionConsumption)
      .where(eq(schema.subscriptionConsumption.userId, userId))
    await db.delete(schema.userBillingPreference)
      .where(eq(schema.userBillingPreference.userId, userId))
    logger.withFields({ userId }).log('Subscription rows deleted for user')
  }

  return {
    hasEvent,
    recordEvent,
    openPeriod,
    getStatus,
    spendableMicro,
    debitCredits,
    getFallbackPreference,
    setFallbackPreference,
    deleteAllForUser,
  }
}

export type SubscriptionService = ReturnType<typeof createSubscriptionService>
