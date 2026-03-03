import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxService } from '../flux'

import * as schema from '../../schemas'

describe('fluxService', () => {
  let db: any
  let service: ReturnType<typeof createFluxService>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)
    service = createFluxService(db)

    // Create a test user for foreign key constraints
    const [user] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = user
  })

  // --- getFlux ---

  it('getFlux should create a new record with 100 default flux for a new user', async () => {
    const record = await service.getFlux(testUser.id)

    expect(record).toBeDefined()
    expect(record.userId).toBe(testUser.id)
    expect(record.flux).toBe(100)
  })

  it('getFlux should return existing record on subsequent calls', async () => {
    const first = await service.getFlux(testUser.id)
    const second = await service.getFlux(testUser.id)

    // Same record, no duplicate insert
    expect(second.userId).toBe(first.userId)
    expect(second.flux).toBe(first.flux)
  })

  // --- consumeFlux ---

  it('consumeFlux should deduct flux correctly', async () => {
    const result = await service.consumeFlux(testUser.id, 10)

    // Started at 100, consumed 10
    expect(result.flux).toBe(90)
  })

  it('consumeFlux should throw when balance is insufficient', async () => {
    // Current balance is 90 after previous test; consuming 91 should fail
    await expect(service.consumeFlux(testUser.id, 91))
      .rejects
      .toThrow('Insufficient flux')
  })

  it('consumeFlux should throw when trying to consume more than available', async () => {
    await expect(service.consumeFlux(testUser.id, 999))
      .rejects
      .toThrow('Insufficient flux')
  })

  // --- addFlux ---

  it('addFlux should add flux correctly', async () => {
    // Balance is 90 from previous consume test
    const result = await service.addFlux(testUser.id, 50)
    expect(result.flux).toBe(140)
  })

  it('addFlux should accumulate across multiple calls', async () => {
    // Balance is 140; add 10 three times
    await service.addFlux(testUser.id, 10)
    await service.addFlux(testUser.id, 10)
    const result = await service.addFlux(testUser.id, 10)

    expect(result.flux).toBe(170)
  })

  // --- updateStripeCustomerId ---

  it('updateStripeCustomerId should update the stripe customer ID', async () => {
    const result = await service.updateStripeCustomerId(testUser.id, 'cus_abc123')

    expect(result.stripeCustomerId).toBe('cus_abc123')

    // Verify it persists via getFlux
    const record = await service.getFlux(testUser.id)
    expect(record.stripeCustomerId).toBe('cus_abc123')
  })

  // --- Concurrent consumeFlux ---

  it('concurrent consumeFlux should not over-deduct flux', async () => {
    // Set up a fresh user to isolate this test from previous state
    const [user2] = await db.insert(schema.user).values({
      id: 'user-concurrent-consume',
      name: 'Concurrent Consumer',
      email: 'concurrent-consume@example.com',
    }).returning()

    // Initialize flux record (100 default)
    await service.getFlux(user2.id)

    // Fire 10 concurrent consume calls of 10 each (total 100, exactly the balance)
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.consumeFlux(user2.id, 10)),
    )

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')

    // All 10 should succeed since total equals balance, but under concurrency
    // some may fail if the atomic check-and-deduct fires after balance drops.
    // The key invariant: final balance must never go negative.
    const finalRecord = await service.getFlux(user2.id)
    expect(finalRecord.flux).toBeGreaterThanOrEqual(0)

    // Total consumed must equal (fulfilled count * 10)
    expect(finalRecord.flux).toBe(100 - fulfilled.length * 10)

    // Every rejection should be 'Insufficient flux'
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason.message).toBe('Insufficient flux')
    }
  })

  // --- Concurrent addFlux ---

  it('concurrent addFlux should accumulate correctly without lost updates', async () => {
    // Set up a fresh user to isolate this test
    const [user3] = await db.insert(schema.user).values({
      id: 'user-concurrent-add',
      name: 'Concurrent Adder',
      email: 'concurrent-add@example.com',
    }).returning()

    // Initialize flux record (100 default)
    await service.getFlux(user3.id)

    // Fire 10 concurrent add calls of 5 each (expect +50 total)
    await Promise.all(
      Array.from({ length: 10 }, () => service.addFlux(user3.id, 5)),
    )

    const finalRecord = await service.getFlux(user3.id)

    // 100 initial + 10 * 5 = 150
    expect(finalRecord.flux).toBe(150)
  })
})
