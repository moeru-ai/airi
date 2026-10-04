import type { Database } from '../../../libs/db'
import type { SubscriptionStatus } from '../../../schemas/subscription'

import { useLogger } from '@guiiai/logg'
import { and, asc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm'

import { availableMicroCredits, MICRO_PER_CREDIT, postMicroCredits } from '../billing/credit-posting'

import * as schema from '../../../schemas/subscription'

const logger = useLogger('subscriptions')

function allowanceRemainingMicro(row: { grantedAmount: number, usedAmount: number, unsettledMicro: number }): bigint {
  return availableMicroCredits({
    credits: row.grantedAmount - row.usedAmount,
    unsettledMicro: row.unsettledMicro,
  })
}

function usableAllowanceSql() {
  return sql`((${schema.subscriptionAllowance.grantedAmount} - ${schema.subscriptionAllowance.usedAmount})::bigint * ${MICRO_PER_CREDIT}) > ${schema.subscriptionAllowance.unsettledMicro}`
}

export interface SubscriptionUpsert {
  userId: string
  entitlementId: string
  status: SubscriptionStatus
  productId?: string | null
  source?: string | null
  environment?: string | null
  expiresAt?: Date | null
}

export interface AllowancePeriod {
  userId: string
  entitlementId: string
  grantedAmount: number
  periodStart: Date
  periodEnd?: Date | null
  /** Deduplicates redeliveries of the same grant. Null disables the check. */
  eventKey?: string | null
}

export interface ReconciledEntitlement {
  entitlementId: string
  active: boolean
  expiresAt: Date | null
  /** Opens a quota period when provided and none is open. */
  quotaAmount?: number
}

/**
 * Source-agnostic subscription state. Callers (RevenueCat webhooks, manual
 * grants, future store-direct integrations) translate their own events into
 * these domain inputs. The core never sees a processor payload.
 */
export function createSubscriptionService(db: Database) {
  async function upsertSubscription(input: SubscriptionUpsert): Promise<void> {
    // Partial unique index (WHERE deleted_at IS NULL) cannot be an
    // ON CONFLICT target, so insert-then-update instead of upsert.
    await db.insert(schema.subscription).values({
      userId: input.userId,
      entitlementId: input.entitlementId,
      productId: input.productId,
      store: input.source,
      environment: input.environment,
      status: input.status,
      expiresAt: input.expiresAt,
    }).onConflictDoNothing()
    await db.update(schema.subscription).set({
      productId: input.productId,
      store: input.source,
      environment: input.environment,
      status: input.status,
      expiresAt: input.expiresAt,
      updatedAt: new Date(),
      deletedAt: null,
    }).where(and(
      eq(schema.subscription.userId, input.userId),
      eq(schema.subscription.entitlementId, input.entitlementId),
      isNull(schema.subscription.deletedAt),
    ))
  }

  /**
   * Opens a fresh quota period and forfeits the old remainder: prior open
   * periods close at the new start. Returns false on duplicate eventKey.
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

      await tx.update(schema.subscriptionAllowance)
        .set({ periodEnd: input.periodStart, updatedAt: new Date() })
        .where(and(
          eq(schema.subscriptionAllowance.userId, input.userId),
          eq(schema.subscriptionAllowance.entitlementId, input.entitlementId),
          or(
            isNull(schema.subscriptionAllowance.periodEnd),
            gt(schema.subscriptionAllowance.periodEnd, input.periodStart),
          ),
        ))
      await tx.insert(schema.subscriptionAllowance).values({
        userId: input.userId,
        entitlementId: input.entitlementId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        grantedAmount: input.grantedAmount,
        usedAmount: 0,
        unsettledMicro: 0,
        eventId: input.eventKey,
      }).onConflictDoNothing()
      return true
    })
  }

  /**
   * Aligns local rows with an authoritative remote snapshot. Revives rows the
   * event stream missed and retires lapsed ones; never revokes unexpired
   * access on a remote miss, so API blips cannot lock users out.
   */
  async function reconcile(userId: string, remote: ReconciledEntitlement[], now: Date = new Date()): Promise<void> {
    const rows = await db
      .select()
      .from(schema.subscription)
      .where(and(
        eq(schema.subscription.userId, userId),
        isNull(schema.subscription.deletedAt),
      ))

    await db.transaction(async (tx) => {
      for (const item of remote) {
        const row = rows.find(candidate => candidate.entitlementId === item.entitlementId)
        const locallyCovered = row
          && row.status !== 'expired'
          && (!row.expiresAt || row.expiresAt > now)
          && (item.expiresAt == null || !row.expiresAt || row.expiresAt.getTime() === item.expiresAt.getTime())

        if (locallyCovered)
          continue

        logger.withFields({ userId, entitlementId: item.entitlementId }).log('Reconcile reviving subscription row')
        await tx.insert(schema.subscription).values({
          userId,
          entitlementId: item.entitlementId,
          status: 'active',
          expiresAt: item.expiresAt,
        }).onConflictDoNothing()
        await tx.update(schema.subscription).set({
          status: 'active' as const,
          expiresAt: item.expiresAt,
          updatedAt: new Date(),
          deletedAt: null,
        }).where(and(
          eq(schema.subscription.userId, userId),
          eq(schema.subscription.entitlementId, item.entitlementId),
          isNull(schema.subscription.deletedAt),
        ))

        if (item.quotaAmount != null) {
          await tx.update(schema.subscriptionAllowance)
            .set({ periodEnd: now, updatedAt: new Date() })
            .where(and(
              eq(schema.subscriptionAllowance.userId, userId),
              eq(schema.subscriptionAllowance.entitlementId, item.entitlementId),
              or(
                isNull(schema.subscriptionAllowance.periodEnd),
                gt(schema.subscriptionAllowance.periodEnd, now),
              ),
            ))
          await tx.insert(schema.subscriptionAllowance).values({
            userId,
            entitlementId: item.entitlementId,
            periodStart: now,
            periodEnd: item.expiresAt,
            grantedAmount: item.quotaAmount,
            usedAmount: 0,
            unsettledMicro: 0,
            eventId: `reconcile:${userId}:${item.entitlementId}:${item.expiresAt?.getTime() ?? 'open'}`,
          }).onConflictDoNothing()
        }
      }

      for (const row of rows) {
        const present = remote.some(item => item.entitlementId === row.entitlementId && item.active)
        if (!present && row.status !== 'expired' && row.expiresAt && row.expiresAt <= now) {
          await tx.update(schema.subscription)
            .set({ status: 'expired' as const, updatedAt: new Date() })
            .where(eq(schema.subscription.id, row.id))
        }
      }
    })
  }

  /** Live rows with usable access. Expired rows and lapsed periods are excluded. */
  async function getStatus(userId: string, now: Date = new Date()) {
    const rows = await db
      .select()
      .from(schema.subscription)
      .where(and(
        eq(schema.subscription.userId, userId),
        isNull(schema.subscription.deletedAt),
      ))

    const active = rows.filter(row => row.status !== 'expired' && (!row.expiresAt || row.expiresAt > now))

    const allowances = active.length === 0
      ? []
      : await db
          .select()
          .from(schema.subscriptionAllowance)
          .where(and(
            eq(schema.subscriptionAllowance.userId, userId),
            or(
              isNull(schema.subscriptionAllowance.periodEnd),
              gt(schema.subscriptionAllowance.periodEnd, now),
            ),
            usableAllowanceSql(),
          ))
          .orderBy(asc(schema.subscriptionAllowance.periodEnd))

    return {
      subscriptions: active.map(row => ({
        entitlementId: row.entitlementId,
        productId: row.productId,
        store: row.store,
        environment: row.environment,
        status: row.status,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      })),
      allowances: allowances.map((row) => {
        const remainingMicro = Number(allowanceRemainingMicro(row))
        return {
          entitlementId: row.entitlementId,
          periodStart: row.periodStart.toISOString(),
          periodEnd: row.periodEnd?.toISOString() ?? null,
          grantedAmount: row.grantedAmount,
          usedAmount: row.usedAmount,
          unsettledMicro: row.unsettledMicro,
          remainingMicro,
          remainingAmount: remainingMicro / MICRO_PER_CREDIT,
        }
      }),
    }
  }

  /**
   * Debits micro-Credits from the earliest-expiring open period when the
   * period covers the whole fee. A short period is left untouched.
   * Retries with the same requestId replay the original charge.
   */
  async function debitCredits(input: {
    userId: string
    amountMicro: number
    requestId: string
  }): Promise<{ chargedMicro: number, requestedMicro: number }> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ amountMicro: schema.subscriptionConsumption.amountMicro })
        .from(schema.subscriptionConsumption)
        .where(eq(schema.subscriptionConsumption.requestId, input.requestId))
        .limit(1)

      if (existing)
        return { chargedMicro: existing.amountMicro, requestedMicro: input.amountMicro }

      const now = new Date()
      const [period] = await tx
        .select()
        .from(schema.subscriptionAllowance)
        .where(and(
          eq(schema.subscriptionAllowance.userId, input.userId),
          or(
            isNull(schema.subscriptionAllowance.periodEnd),
            gt(schema.subscriptionAllowance.periodEnd, now),
          ),
          usableAllowanceSql(),
        ))
        .orderBy(asc(schema.subscriptionAllowance.periodEnd))
        .for('update')
        .limit(1)

      if (!period || allowanceRemainingMicro(period) < BigInt(input.amountMicro))
        return { chargedMicro: 0, requestedMicro: input.amountMicro }

      const posted = postMicroCredits({
        credits: period.grantedAmount - period.usedAmount,
        unsettledMicro: period.unsettledMicro,
      }, input.amountMicro)

      await tx.insert(schema.subscriptionConsumption).values({
        requestId: input.requestId,
        userId: input.userId,
        allowanceId: period.id,
        amountMicro: input.amountMicro,
      }).onConflictDoNothing()

      await tx.update(schema.subscriptionAllowance)
        .set({
          usedAmount: period.grantedAmount - posted.credits,
          unsettledMicro: posted.unsettledMicro,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptionAllowance.id, period.id))

      return { chargedMicro: input.amountMicro, requestedMicro: input.amountMicro }
    })
  }

  /** Expires every other entitlement and closes its open Credit periods. */
  async function retireOtherEntitlements(userId: string, keepEntitlementId: string): Promise<void> {
    const now = new Date()
    await db.update(schema.subscription)
      .set({ status: 'expired', updatedAt: now })
      .where(and(
        eq(schema.subscription.userId, userId),
        ne(schema.subscription.entitlementId, keepEntitlementId),
        isNull(schema.subscription.deletedAt),
        ne(schema.subscription.status, 'expired'),
      ))
    await db.update(schema.subscriptionAllowance)
      .set({ periodEnd: now, updatedAt: now })
      .where(and(
        eq(schema.subscriptionAllowance.userId, userId),
        ne(schema.subscriptionAllowance.entitlementId, keepEntitlementId),
        or(
          isNull(schema.subscriptionAllowance.periodEnd),
          gt(schema.subscriptionAllowance.periodEnd, now),
        ),
      ))
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
    const now = new Date()
    await db.update(schema.subscription)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(
        eq(schema.subscription.userId, userId),
        isNull(schema.subscription.deletedAt),
      ))
    await db.delete(schema.subscriptionAllowance)
      .where(eq(schema.subscriptionAllowance.userId, userId))
    await db.delete(schema.subscriptionConsumption)
      .where(eq(schema.subscriptionConsumption.userId, userId))
    await db.delete(schema.userBillingPreference)
      .where(eq(schema.userBillingPreference.userId, userId))
    logger.withFields({ userId }).log('Subscription rows deleted for user')
  }

  return {
    upsertSubscription,
    openPeriod,
    reconcile,
    getStatus,
    debitCredits,
    retireOtherEntitlements,
    getFallbackPreference,
    setFallbackPreference,
    deleteAllForUser,
  }
}

export type SubscriptionService = ReturnType<typeof createSubscriptionService>
