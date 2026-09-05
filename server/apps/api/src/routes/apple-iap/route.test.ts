import type { Database } from '../../libs/db'
import type { ConfigDefinitions, ConfigKVService } from '../../services/adapters/config-kv'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'
import type { Verifier } from './verifier'

import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { ApiError } from '../../utils/error'
import { createAppleIapRoutes } from './index'

import * as schema from '../../schemas'

const testUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const otherUser = {
  ...testUser,
  id: 'user-2',
  email: 'other@example.com',
}

const storedToken = '11111111-1111-4111-8111-111111111111'

const verifiedTransaction = {
  transactionId: 'txn_1',
  originalTransactionId: 'orig_1',
  productId: 'ai.moeru.airi.flux.500',
  appAccountToken: storedToken,
  type: 'Consumable',
}

const starterPack: ConfigDefinitions['FLUX_PACKS'][number] = {
  key: 'starter',
  name: '500 Flux',
  fluxAmount: 500,
  recommended: false,
  processors: { appleIap: { productId: 'ai.moeru.airi.flux.500' } },
}

function createPacksConfigKV(packs: ConfigDefinitions['FLUX_PACKS'] = [starterPack]): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => {
      if (key === 'FLUX_PACKS')
        return packs
      return null
    }),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

function createMockPayment(overrides?: Partial<PaymentService>): PaymentService {
  return {
    openPending: vi.fn(),
    bindProcessorOrder: vi.fn(),
    abandon: vi.fn(),
    settle: vi.fn(async () => ({ applied: true, userId: 'user-1', fluxAmount: 500, balanceAfter: 500 })),
    deleteAllForUser: vi.fn(),
    ...overrides,
  }
}

function createMockVerifier(overrides?: Partial<Verifier>): Verifier {
  return {
    verifyTransaction: vi.fn(async () => verifiedTransaction),
    verifyNotification: vi.fn(async () => ({
      notificationType: 'ONE_TIME_CHARGE',
      data: { signedTransactionInfo: 'inner-jws' },
    })),
    ...overrides,
  } as Verifier
}

function createTestApp(
  payment: PaymentService,
  verifier: Verifier | null,
  db: Database,
  configKV: ConfigKVService = createPacksConfigKV(),
) {
  const routes = createAppleIapRoutes(payment, db, verifier, configKV)
  const app = new Hono<HonoEnv>()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({
        error: err.errorCode,
        message: err.message,
        details: err.details,
      }, err.statusCode)
    }
    return c.json({ error: 'Internal Server Error', message: err.message }, 500)
  })

  app.use('*', async (c, next) => {
    const user = (c.env as { user?: typeof testUser })?.user
    if (user)
      c.set('user', user)
    await next()
  })

  app.route('/api/v1/apple-iap', routes)
  return app
}

async function post(
  app: ReturnType<typeof createTestApp>,
  path: string,
  body: unknown,
  user?: typeof testUser,
) {
  return app.fetch(
    new Request(`http://localhost/api/v1/apple-iap${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    user ? { user } as never : undefined,
  )
}

describe('apple-iap routes', () => {
  let db: Database
  let payment: PaymentService
  let verifier: Verifier

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  beforeEach(async () => {
    payment = createMockPayment()
    verifier = createMockVerifier()
    await db.delete(schema.paymentCustomer)
  })

  async function seedAppleAccount(userId: string, token = storedToken) {
    await db.insert(schema.paymentCustomer).values({
      userId,
      processor: 'apple_iap',
      customerId: token,
    })
  }

  it('returns 401 when unauthenticated on account-token and transactions', async () => {
    const app = createTestApp(payment, verifier, db)

    const tokenRes = await app.request('/api/v1/apple-iap/account-token', { method: 'POST' })
    expect(tokenRes.status).toBe(401)

    const txnRes = await app.request('/api/v1/apple-iap/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signedTransaction: 'jws' }),
    })
    expect(txnRes.status).toBe(401)
  })

  it('returns 503 when the verifier is not configured', async () => {
    const app = createTestApp(payment, null, db)
    const res = await post(app, '/transactions', { signedTransaction: 'jws' }, testUser)
    expect(res.status).toBe(503)
  })

  it('creates a UUID on POST /account-token, then returns the same UUID', async () => {
    const app = createTestApp(payment, verifier, db)

    const first = await post(app, '/account-token', {}, testUser)
    expect(first.status).toBe(200)
    const created = await first.json() as { appAccountToken: string }
    expect(created.appAccountToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    const second = await post(app, '/account-token', {}, testUser)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(created)
  })

  it('grants Flux when the JWS token matches the stored row', async () => {
    await seedAppleAccount(testUser.id)
    const app = createTestApp(payment, verifier, db)
    const res = await post(app, '/transactions', { signedTransaction: 'jws' }, testUser)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      kind: 'pack',
      applied: true,
      transactionId: 'txn_1',
      balanceAfter: 500,
    })
    expect(payment.settle).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'evidence',
      processor: 'apple_iap',
      processorOrderId: 'txn_1',
      userId: 'user-1',
      packKey: 'starter',
      fluxAmount: 500,
      customerId: storedToken,
    }))
  })

  it('returns 4xx for an unknown product', async () => {
    await seedAppleAccount(testUser.id)
    const app = createTestApp(payment, verifier, db, createPacksConfigKV([]))
    const res = await post(app, '/transactions', { signedTransaction: 'jws' }, testUser)

    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('UNKNOWN_PRODUCT')
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('returns 403 when the token belongs to another user', async () => {
    await seedAppleAccount(otherUser.id)
    const app = createTestApp(payment, verifier, db)
    const res = await post(app, '/transactions', { signedTransaction: 'jws' }, testUser)

    expect(res.status).toBe(403)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('FORBIDDEN')
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('returns 400 when the JWS omits appAccountToken', async () => {
    await seedAppleAccount(testUser.id)
    verifier = createMockVerifier({
      verifyTransaction: vi.fn(async () => ({
        ...verifiedTransaction,
        appAccountToken: undefined,
      })),
    })
    const app = createTestApp(payment, verifier, db)
    const res = await post(app, '/transactions', { signedTransaction: 'jws' }, testUser)

    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('MISSING_APP_ACCOUNT_TOKEN')
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('returns 400 when the JWS is not for a consumable product', async () => {
    verifier = createMockVerifier({
      verifyTransaction: vi.fn(async () => ({
        ...verifiedTransaction,
        type: 'Non-Consumable',
      })),
    })
    const app = createTestApp(payment, verifier, db)
    const res = await post(app, '/transactions', { signedTransaction: 'jws' }, testUser)

    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('PRODUCT_TYPE_NOT_SUPPORTED')
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('settles ONE_TIME_CHARGE without auth', async () => {
    await seedAppleAccount(testUser.id)

    const app = createTestApp(payment, verifier, db)
    const res = await post(app, '/notifications', { signedPayload: 'notify-jws' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(payment.settle).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'evidence',
      processor: 'apple_iap',
      processorOrderId: 'txn_1',
      userId: 'user-1',
      packKey: 'starter',
      fluxAmount: 500,
    }))
  })

  it('returns 200 and does not grant when the notification token is unknown', async () => {
    const app = createTestApp(payment, verifier, db)
    const res = await post(app, '/notifications', { signedPayload: 'notify-jws' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('acknowledges ONE_TIME_CHARGE for a non-consumable product without granting', async () => {
    verifier = createMockVerifier({
      verifyTransaction: vi.fn(async () => ({
        ...verifiedTransaction,
        type: 'Non-Consumable',
      })),
    })
    const app = createTestApp(payment, verifier, db)
    const res = await post(app, '/notifications', { signedPayload: 'notify-jws' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('ignores non-charge notification types with 200', async () => {
    verifier = createMockVerifier({
      verifyNotification: vi.fn(async () => ({
        notificationType: 'TEST',
      })),
    })
    const app = createTestApp(payment, verifier, db)
    const res = await post(app, '/notifications', { signedPayload: 'notify-jws' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(payment.settle).not.toHaveBeenCalled()
  })
})
