// Verification: docs/ai/context/verification-automation.md
// Source doc: apps/server/docs/ai-context/verifications/account-deletion.md
//
// Covers one slice of the verification doc — the part that pins down
// "Flux balance soft-deleted, cache invalidated, ledger preserved".
//
// What this test does NOT cover (intentional, out of harness scope):
// - The Better Auth `/api/auth/delete-user/callback` HTTP entry point. The
//   prod trigger lives inside better-auth's plugin internals; testing it
//   end-to-end would mean mounting the real `createAuth(...)` against
//   better-auth's verification-token flow, which the harness does not do.
//   We call `userDeletionService.softDeleteAll(...)` directly — the same
//   function better-auth's `beforeDelete` hook calls — so the orchestration
//   contract is exercised even though the HTTP boundary is skipped.
// - The stripe / providers / characters / chats handlers. The harness wires
//   only the `flux` handler (see `_harness.ts`). Verifying the other four
//   needs widening the default wiring or a per-test opt-in.

import type { Harness } from './_harness'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { userFluxRedisKey } from '../../src/utils/redis-keys'
import { startVerificationContext } from './_harness'

describe('verification: account-deletion (flux slice)', () => {
  let ctx: Harness

  beforeEach(async () => {
    ctx = await startVerificationContext()
  })

  afterAll(async () => {
    // PGlite is module-cached and lives for the worker's lifetime.
  })

  it('soft-deletes user_flux, invalidates redis cache, leaves flux_transaction ledger intact', async () => {
    const userId = 'user-doomed'

    // Seed: balance 500 + one historical debit ledger row. The ledger row is
    // the load-bearing assertion — flux_transaction has no `deleted_at`
    // column on purpose, and the bare userId (no FK) is the mechanism that
    // lets the ledger outlive the user row. See `schemas/flux-transaction.ts`
    // NOTICE comment.
    await ctx.seedUser({ id: userId, balance: 500 })
    await ctx.db.insert(ctx.schema.fluxTransaction).values({
      userId,
      type: 'debit',
      amount: 50,
      balanceBefore: 550,
      balanceAfter: 500,
      description: 'prior llm call',
    })

    // Sanity precondition: balance is 500 and ledger has 1 row.
    const balanceBefore = await ctx.fluxService.getFlux(userId)
    expect(balanceBefore.flux).toBe(500)
    expect(ctx.redisStore.get(userFluxRedisKey(userId))).toBe('500')
    const ledgerBefore = await ctx.db.query.fluxTransaction.findMany({
      where: eq(ctx.schema.fluxTransaction.userId, userId),
    })
    expect(ledgerBefore).toHaveLength(1)

    // Act: same call better-auth makes inside the delete-user callback hook.
    await ctx.userDeletionService.softDeleteAll({ userId, reason: 'user-requested' })

    // Assert 1: user_flux row is stamped with deletedAt (soft-delete).
    const rawRow = await ctx.db
      .select()
      .from(ctx.schema.userFlux)
      .where(eq(ctx.schema.userFlux.userId, userId))
    expect(rawRow).toHaveLength(1)
    expect(rawRow[0].deletedAt).not.toBeNull()
    expect(rawRow[0].flux).toBe(500) // balance value is NOT zeroed; soft-delete only stamps deletedAt

    // Assert 2: redis cache for the user's balance is dropped.
    expect(ctx.redisStore.get(userFluxRedisKey(userId))).toBeUndefined()

    // Assert 3: ledger rows persist. The audit trail outlives the user row.
    const ledgerAfter = await ctx.db.query.fluxTransaction.findMany({
      where: eq(ctx.schema.fluxTransaction.userId, userId),
    })
    expect(ledgerAfter).toHaveLength(1)
    expect(ledgerAfter[0].description).toBe('prior llm call')

    // Assert 4: `fluxService.getFlux` rejects after soft-delete. The read
    // path filters on `deletedAt IS NULL`, the init-path's
    // `onConflictDoNothing` no-ops against the soft-deleted row, and the
    // re-read still finds nothing — so the service throws. In production
    // this scenario should not arise because better-auth hard-deletes the
    // user row after `softDeleteAll`. The throw is the defense-in-depth
    // failure mode described in the `fluxService` NOTICE for any request
    // that bypasses `sessionMiddleware` with a soft-deleted user.
    await expect(ctx.fluxService.getFlux(userId)).rejects.toThrow(/Failed to initialize flux/)
  })

  it('softDeleteAll is idempotent — calling it twice does not throw and leaves state unchanged', async () => {
    // The handler uses `WHERE deletedAt IS NULL` so the second call finds 0
    // rows and is a no-op. `redis.del` is also a no-op when the key is
    // absent. Pinning this prevents a future refactor that tightens the
    // where-clause and accidentally requires the row to be live.
    const userId = 'user-doomed-twice'
    await ctx.seedUser({ id: userId, balance: 100 })

    await ctx.userDeletionService.softDeleteAll({ userId, reason: 'user-requested' })
    await ctx.userDeletionService.softDeleteAll({ userId, reason: 'user-requested' })

    const rawRow = await ctx.db
      .select()
      .from(ctx.schema.userFlux)
      .where(eq(ctx.schema.userFlux.userId, userId))
    expect(rawRow).toHaveLength(1)
    expect(rawRow[0].deletedAt).not.toBeNull()
  })
})
