import type { Database } from '../../../../libs/db'
import type { PaymentReceiptService } from '../receipt'

import Stripe from 'stripe'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { paymentOrder } from '../../../../schemas/payment'
import { createPaymentReceiptAdapters } from '../../../adapters/payment'
import { createPaymentReceiptService } from '../receipt'

describe('payment receipts', () => {
  let db: Database
  let receipts: PaymentReceiptService
  let receiptsWithoutStripe: PaymentReceiptService
  const stripe = new Stripe('test-key')
  const retrieve = vi.spyOn(stripe.checkout.sessions, 'retrieve')

  beforeAll(async () => {
    db = await mockDB({ paymentOrder })
    receipts = createPaymentReceiptService(db, createPaymentReceiptAdapters(stripe))
    receiptsWithoutStripe = createPaymentReceiptService(db, createPaymentReceiptAdapters(null))
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

  it('prefers the original invoice and retrieves a fresh URL on each request', async () => {
    retrieve.mockImplementation(vi.fn()
      .mockResolvedValueOnce({
        invoice: { hosted_invoice_url: 'https://example.com/invoice/original' },
        payment_intent: { latest_charge: { receipt_url: 'https://example.com/receipt' } },
      })
      .mockResolvedValueOnce({
        invoice: { hosted_invoice_url: 'https://example.com/invoice/updated' },
        payment_intent: { latest_charge: { receipt_url: 'unavailable' } },
      }))

    expect(await receipts.getReceipt('buyer', 'order-1')).toEqual({ url: 'https://example.com/invoice/original' })
    expect(await receipts.getReceipt('buyer', 'order-1')).toEqual({ url: 'https://example.com/invoice/updated' })
    expect(retrieve).toHaveBeenCalledWith('cs_original', { expand: ['invoice', 'payment_intent.latest_charge'] })
  })

  it.each([null, { hosted_invoice_url: null }, { hosted_invoice_url: 'unavailable' }])('uses the charge receipt without a valid hosted invoice (%j)', async (invoice) => {
    retrieve.mockImplementation(vi.fn().mockResolvedValue({
      invoice,
      payment_intent: { latest_charge: { receipt_url: 'https://example.com/receipt' } },
    }))

    expect(await receipts.getReceipt('buyer', 'order-1'))
      .toEqual({ url: 'https://example.com/receipt' })
  })

  it.each([
    { invoice: null, payment_intent: null },
    { invoice: null, payment_intent: { latest_charge: null } },
    { invoice: null, payment_intent: { latest_charge: { receipt_url: null } } },
  ])('reports an unavailable receipt (%j)', async (session) => {
    retrieve.mockImplementation(vi.fn().mockResolvedValue(session))

    await expect(receipts.getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404, errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
  })

  it.each([
    ['other-buyer', 'order-1'],
    ['buyer', 'missing'],
  ])('rejects an inaccessible order before contacting Stripe (%s, %s)', async (userId, orderId) => {
    await expect(receipts.getReceipt(userId, orderId))
      .rejects
      .toMatchObject({ statusCode: 404 })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it.each([
    { status: 'pending' },
    { status: 'canceled' },
    { status: 'expired' },
    { deletedAt: new Date('2026-11-03T00:00:00Z') },
  ])('rejects an unpaid or deleted order before contacting Stripe (%j)', async (changes) => {
    await db.update(paymentOrder).set(changes)

    await expect(receipts.getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404 })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('opens Apple purchase history with Stripe unavailable', async () => {
    await db.update(paymentOrder).set({ processor: 'apple_iap', processorOrderId: 'apple-original' })

    expect(await receiptsWithoutStripe.getReceipt('buyer', 'order-1'))
      .toEqual({ url: 'https://reportaproblem.apple.com/' })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('does not send an unsupported processor to Stripe', async () => {
    await db.update(paymentOrder).set({ processor: 'other-store' })

    await expect(receipts.getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('reports missing Stripe credentials independently of package configuration', async () => {
    await expect(receiptsWithoutStripe.getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 503, errorCode: 'STRIPE_NOT_CONFIGURED' })
  })

  it('reports a missing processor reference without contacting Stripe', async () => {
    await db.update(paymentOrder).set({ processorOrderId: null })

    await expect(receipts.getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('rejects unsafe URLs from a provider response', async () => {
    retrieve.mockImplementation(vi.fn().mockResolvedValue({
      invoice: { hosted_invoice_url: 'javascript:alert(1)' },
      payment_intent: null,
    }))

    await expect(receipts.getReceipt('buyer', 'order-1'))
      .rejects
      .toMatchObject({ statusCode: 404, errorCode: 'PAYMENT_RECEIPT_UNAVAILABLE' })
  })
})
