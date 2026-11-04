import type { Database } from '../../../../libs/db'

import Stripe from 'stripe'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { paymentOrder } from '../../../../schemas/payment'
import { appleReceiptResolver } from '../../../adapters/payment-receipts/apple-receipt'
import { createStripeReceiptResolver } from '../../../adapters/payment-receipts/stripe-receipt'
import { createPaymentReceiptService } from '../receipt'

describe('payment receipts', () => {
  let db: Database
  const stripe = new Stripe('sk_test_receipts')
  const retrieve = vi.spyOn(stripe.checkout.sessions, 'retrieve')

  function createReceipts(client: Stripe | null) {
    return createPaymentReceiptService(db, [createStripeReceiptResolver(client), appleReceiptResolver])
  }

  beforeAll(async () => {
    db = await mockDB({ paymentOrder })
  })

  beforeEach(async () => {
    await db.delete(paymentOrder)
    retrieve.mockReset()
    await db.insert(paymentOrder).values({
      id: 'order-1',
      userId: 'buyer',
      processor: 'stripe',
      processorOrderId: 'cs_original',
      status: 'paid',
    })
  })

  it('prefers the hosted invoice from the original checkout session', async () => {
    retrieve.mockImplementation(vi.fn().mockResolvedValue({
      invoice: { hosted_invoice_url: 'https://invoice.stripe.com/original' },
      payment_intent: { latest_charge: { receipt_url: 'https://pay.stripe.com/receipt' } },
    }))

    const result = await createReceipts(stripe).getReceipt('buyer', 'order-1')

    expect(result).toEqual({ url: 'https://invoice.stripe.com/original' })
    expect(retrieve).toHaveBeenCalledWith('cs_original', { expand: ['invoice', 'payment_intent.latest_charge'] })
  })

  it.each([null, { hosted_invoice_url: null }])('uses the charge receipt without a hosted invoice (%j)', async (invoice) => {
    retrieve.mockImplementation(vi.fn().mockResolvedValue({
      invoice,
      payment_intent: { latest_charge: { receipt_url: 'https://pay.stripe.com/receipt' } },
    }))

    expect(await createReceipts(stripe).getReceipt('buyer', 'order-1'))
      .toEqual({ url: 'https://pay.stripe.com/receipt' })
  })

  it('retrieves a fresh receipt URL on each request', async () => {
    retrieve.mockImplementation(vi.fn()
      .mockResolvedValueOnce({ invoice: { hosted_invoice_url: 'https://invoice.stripe.com/first' }, payment_intent: null })
      .mockResolvedValueOnce({ invoice: { hosted_invoice_url: 'https://invoice.stripe.com/second' }, payment_intent: null }))
    const receipts = createReceipts(stripe)

    expect(await receipts.getReceipt('buyer', 'order-1')).toEqual({ url: 'https://invoice.stripe.com/first' })
    expect(await receipts.getReceipt('buyer', 'order-1')).toEqual({ url: 'https://invoice.stripe.com/second' })
  })

  it.each([
    { invoice: null, payment_intent: null },
    { invoice: null, payment_intent: { latest_charge: null } },
    { invoice: null, payment_intent: { latest_charge: { receipt_url: null } } },
  ])('reports an unavailable receipt (%j)', async (session) => {
    retrieve.mockImplementation(vi.fn().mockResolvedValue(session))

    await expect(createReceipts(stripe).getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404, errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
  })

  it('rejects a foreign order before contacting Stripe', async () => {
    await expect(createReceipts(stripe).getReceipt('other-buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404 })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('rejects a missing order before contacting Stripe', async () => {
    await expect(createReceipts(stripe).getReceipt('buyer', 'missing'))
      .rejects
      .toMatchObject({ statusCode: 404 })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it.each(['pending', 'canceled', 'expired'])('rejects a %s order before contacting Stripe', async (status) => {
    await db.update(paymentOrder).set({ status })

    await expect(createReceipts(stripe).getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404 })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('rejects a deleted order before contacting Stripe', async () => {
    await db.update(paymentOrder).set({ deletedAt: new Date() })

    await expect(createReceipts(stripe).getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404 })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('opens Apple purchase history with Stripe unavailable', async () => {
    await db.update(paymentOrder).set({ processor: 'apple_iap', processorOrderId: 'apple-original' })

    expect(await createReceipts(null).getReceipt('buyer', 'order-1'))
      .toEqual({ url: 'https://reportaproblem.apple.com/' })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('does not send an unsupported processor to Stripe', async () => {
    await db.update(paymentOrder).set({ processor: 'other-store' })

    await expect(createReceipts(stripe).getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('uses a registered processor without changing the receipt service', async () => {
    await db.update(paymentOrder).set({ processor: 'other-store' })
    const resolveReceipt = vi.fn().mockResolvedValue({ url: 'https://example.com/receipt' })
    const receipts = createPaymentReceiptService(db, [{ processor: 'other-store', resolveReceipt }])

    expect(await receipts.getReceipt('buyer', 'order-1')).toEqual({ url: 'https://example.com/receipt' })
    expect(resolveReceipt).toHaveBeenCalledExactlyOnceWith({ processor: 'other-store', processorOrderId: 'cs_original' })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('reports an unavailable result from a registered processor', async () => {
    const receipts = createPaymentReceiptService(db, [{ processor: 'stripe', resolveReceipt: vi.fn().mockResolvedValue(null) }])

    await expect(receipts.getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404, errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
  })

  it('checks ownership before invoking a registered processor', async () => {
    const resolveReceipt = vi.fn().mockResolvedValue({ url: 'https://example.com/receipt' })
    const receipts = createPaymentReceiptService(db, [{ processor: 'stripe', resolveReceipt }])

    await expect(receipts.getReceipt('other-buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404, errorCode: 'NOT_FOUND' })
    expect(resolveReceipt).not.toHaveBeenCalled()
  })

  it('reports missing Stripe credentials independently of package configuration', async () => {
    await expect(createReceipts(null).getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 503, errorCode: 'STRIPE_NOT_CONFIGURED' })
  })

  it('reports a missing processor reference without contacting Stripe', async () => {
    await db.update(paymentOrder).set({ processorOrderId: null })

    await expect(createReceipts(stripe).getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('propagates provider failures so the caller can retry', async () => {
    retrieve.mockRejectedValue(new Error('Stripe unavailable'))

    await expect(createReceipts(stripe).getReceipt('buyer', 'order-1'))
      .rejects
      .toThrow('Stripe unavailable')
  })

  it.each([
    { invoice: { hosted_invoice_url: 'javascript:alert(1)' }, payment_intent: null },
    { invoice: null, payment_intent: { latest_charge: { receipt_url: 'http://example.com/receipt' } } },
    { invoice: 'in_unexpanded', payment_intent: null },
    { invoice: null, payment_intent: { latest_charge: 'ch_unexpanded' } },
    { invoice: null },
  ])('reports malformed provider receipts as unavailable (%j)', async (session) => {
    retrieve.mockImplementation(vi.fn().mockResolvedValue(session))

    await expect(createReceipts(stripe).getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404, errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
  })
})
