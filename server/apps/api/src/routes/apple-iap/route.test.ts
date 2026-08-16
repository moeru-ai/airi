import type { PaymentService } from '../../services/domain/payment'
import type { AppleIapVerifier } from '../../services/domain/payment/adapters/apple-verifier'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { v5 as uuidv5 } from 'uuid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APPLE_IAP_NAMESPACE_UUID } from '../../utils/apple-iap'
import { ApiError, createInternalError } from '../../utils/error'
import { createAppleIapRoutes } from './index'

const testUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}
const matchingToken = uuidv5(testUser.id, APPLE_IAP_NAMESPACE_UUID)

function createMockPayment(overrides?: Partial<PaymentService>): PaymentService {
  return {
    settle: vi.fn(async () => ({ applied: true, userId: 'user-1', fluxAmount: 500, balanceAfter: 500 })),
    deleteAllForUser: vi.fn(),
    ...overrides,
  }
}

function createMockVerifier(overrides?: Partial<AppleIapVerifier>): AppleIapVerifier {
  return {
    verifyTransaction: vi.fn(async () => ({
      transactionId: 'txn_1',
      originalTransactionId: 'orig_1',
      productId: 'flux.pack.500',
      appAccountToken: matchingToken,
      type: 'Consumable',
    })),
    ...overrides,
  } as AppleIapVerifier
}

function createTestApp(deps: {
  payment: PaymentService
  verifier: AppleIapVerifier | null
}) {
  const routes = createAppleIapRoutes(deps)
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

describe('apple-iap routes', () => {
  let payment: PaymentService
  let verifier: AppleIapVerifier

  beforeEach(() => {
    payment = createMockPayment()
    verifier = createMockVerifier()
  })

  it('returns 401 when unauthenticated', async () => {
    const app = createTestApp({ payment, verifier })
    const res = await app.request('/api/v1/apple-iap/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signedTransaction: 'jws' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 503 when the verifier is not configured', async () => {
    const app = createTestApp({ payment, verifier: null })
    const res = await app.fetch(
      new Request('http://localhost/api/v1/apple-iap/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedTransaction: 'jws' }),
      }),
      { user: testUser } as any,
    )
    expect(res.status).toBe(503)
  })

  it('grants Flux once and maps a verified transaction onto evidence settle', async () => {
    const app = createTestApp({ payment, verifier })
    const res = await app.fetch(
      new Request('http://localhost/api/v1/apple-iap/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedTransaction: 'jws' }),
      }),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      kind: 'pack',
      applied: true,
      transactionId: 'txn_1',
      balanceAfter: 500,
      fluxAmount: 500,
    })
    expect(payment.settle).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'evidence',
      provider: 'apple_iap',
      providerOrderId: 'txn_1',
      userId: 'user-1',
      productId: 'flux.pack.500',
    }))
    expect(payment.settle).not.toHaveBeenCalledWith(expect.objectContaining({
      fluxAmount: expect.anything(),
    }))
  })

  it('replays an already granted transaction without a second credit payload', async () => {
    payment = createMockPayment({
      settle: vi.fn(async () => ({ applied: false as const })),
    })
    const app = createTestApp({ payment, verifier })
    const res = await app.fetch(
      new Request('http://localhost/api/v1/apple-iap/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedTransaction: 'jws' }),
      }),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      kind: 'pack',
      applied: false,
      transactionId: 'txn_1',
    })
  })

  it('returns 4xx for an unknown product', async () => {
    payment = createMockPayment({
      settle: vi.fn(async () => {
        throw new ApiError(400, 'UNKNOWN_PRODUCT', 'Unknown product')
      }),
    })
    const app = createTestApp({ payment, verifier })
    const res = await app.fetch(
      new Request('http://localhost/api/v1/apple-iap/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedTransaction: 'jws' }),
      }),
      { user: testUser } as any,
    )

    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('UNKNOWN_PRODUCT')
  })

  it('returns 403 when appAccountToken does not match the authenticated user', async () => {
    verifier = createMockVerifier({
      verifyTransaction: vi.fn(async () => ({
        transactionId: 'txn_1',
        originalTransactionId: 'orig_1',
        productId: 'flux.pack.500',
        appAccountToken: 'other-user-token',
        type: 'Consumable',
      })),
    })
    const app = createTestApp({ payment, verifier })
    const res = await app.fetch(
      new Request('http://localhost/api/v1/apple-iap/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedTransaction: 'jws' }),
      }),
      { user: testUser } as any,
    )

    expect(res.status).toBe(403)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('ACCOUNT_TOKEN_MISMATCH')
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('returns 5xx so the client retries when CORE fails', async () => {
    payment = createMockPayment({
      settle: vi.fn(async () => {
        throw createInternalError('Payment order write failed')
      }),
    })
    const app = createTestApp({ payment, verifier })
    const res = await app.fetch(
      new Request('http://localhost/api/v1/apple-iap/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedTransaction: 'jws' }),
      }),
      { user: testUser } as any,
    )

    expect(res.status).toBe(500)
  })

  it('returns 404 for the removed ASSN notifications route', async () => {
    const app = createTestApp({ payment, verifier })
    const res = await app.fetch(
      new Request('http://localhost/api/v1/apple-iap/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedPayload: 'payload' }),
      }),
      { user: testUser } as any,
    )
    expect(res.status).toBe(404)
  })
})
