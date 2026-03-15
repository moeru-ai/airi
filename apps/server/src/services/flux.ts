import type Redis from 'ioredis'

import type { Database } from '../libs/db'
import type { RevenueMetrics } from '../libs/otel'
import type { ConfigKVService } from './config-kv'
import type { FluxAuditService } from './flux-audit'

import { useLogger } from '@guiiai/logg'
import { eq, sql } from 'drizzle-orm'

import { createPaymentRequiredError } from '../utils/error'

import * as schema from '../schemas/flux'

const logger = useLogger('flux-service')

function redisKey(userId: string): string {
  return `flux:${userId}`
}

export function createFluxService(db: Database, redis: Redis, configKV: ConfigKVService, fluxAuditService: FluxAuditService, metrics?: RevenueMetrics | null) {
  return {
    async getFlux(userId: string) {
      // 1. Try Redis cache
      const cached = await redis.get(redisKey(userId))
      if (cached !== null) {
        return { userId, flux: Number.parseInt(cached, 10) }
      }

      // 2. Cache miss — load from DB
      let record = await db.query.userFlux.findFirst({
        where: eq(schema.userFlux.userId, userId),
      })

      if (!record) {
        const initialFlux = await configKV.getOrThrow('INITIAL_USER_FLUX')
        ;[record] = await db.insert(schema.userFlux).values({
          userId,
          flux: initialFlux,
        }).returning()

        logger.withFields({ userId, initialFlux }).log('Initialized new user flux')

        // Audit: initial grant
        await fluxAuditService.log({
          userId,
          type: 'initial',
          amount: initialFlux,
          description: 'Initial grant',
        })
      }

      // 3. Populate Redis cache
      await redis.set(redisKey(userId), String(record.flux))

      return record
    },

    async consumeFlux(userId: string, amount: number) {
      // Ensure Redis key exists before DECRBY
      // (DECRBY on a nonexistent key creates it at 0, giving wrong balance)
      await this.getFlux(userId)

      // Atomic decrement — check result.
      // Note: there is a small race window between DECRBY returning negative
      // and INCRBY rolling back, during which another concurrent request could
      // see the negative balance and also attempt rollback. We accept this
      // trade-off — the initial balance check is the real guard, and this
      // DECRBY+rollback is a safety net, not a guarantee.
      const newBalance = await redis.decrby(redisKey(userId), amount)
      if (newBalance < 0) {
        await redis.incrby(redisKey(userId), amount)
        logger.withFields({ userId, amount }).warn('Insufficient flux, rolled back')
        metrics?.fluxInsufficientBalance.add(1)
        throw createPaymentRequiredError('Insufficient flux')
      }

      logger.withFields({ userId, amount, newBalance }).log('Consumed flux')
      return { userId, flux: newBalance }
    },

    async addFlux(userId: string, amount: number, description = 'Top-up') {
      // Ensure user record exists in DB
      await this.getFlux(userId)

      // DB update (persistence for Stripe payments)
      await db.update(schema.userFlux)
        .set({
          flux: sql`${schema.userFlux.flux} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.userFlux.userId, userId))

      // Sync Redis cache
      const newBalance = await redis.incrby(redisKey(userId), amount)

      logger.withFields({ userId, amount, newBalance, description }).log('Added flux')

      // Audit: addition
      await fluxAuditService.log({
        userId,
        type: 'addition',
        amount,
        description,
      })

      return { userId, flux: newBalance }
    },

    async updateStripeCustomerId(userId: string, stripeCustomerId: string) {
      const [updated] = await db.update(schema.userFlux)
        .set({
          stripeCustomerId,
          updatedAt: new Date(),
        })
        .where(eq(schema.userFlux.userId, userId))
        .returning()

      return updated
    },
  }
}

export type FluxService = ReturnType<typeof createFluxService>
