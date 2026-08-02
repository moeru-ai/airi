import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../adapters/config-kv'
import type { EmailService } from '../adapters/email'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createCommunitySurveyService } from './community-survey'

import * as schema from '../../schemas'

/**
 * Create a config service with optional survey email runtime content.
 */
function createMockConfigKV(surveyUrl: string | null, overrides: Record<string, string | null> = {}): ConfigKVService {
  const values: Record<string, string | null> = {
    COMMUNITY_SURVEY_URL: surveyUrl,
    COMMUNITY_SURVEY_EMAIL_SUBJECT: '__configured_subject__',
    COMMUNITY_SURVEY_EMAIL_HTML: '<p>__configured_html__ {{surveyUrl}}</p>',
    COMMUNITY_SURVEY_EMAIL_TEXT: '__configured_text__ {{surveyUrl}}',
    ...overrides,
  }

  return {
    getOptional: vi.fn(async (key: string) => {
      return values[key] ?? null
    }),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  } as any
}

/**
 * Create an email service spy for survey invite delivery tests.
 */
function createMockEmailService(): EmailService {
  const email: EmailService = {
    send: vi.fn(async () => undefined),
    sendVerification: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendMagicLink: vi.fn(),
    sendChangeEmailConfirmation: vi.fn(),
    sendCommunitySurveyInvite: vi.fn(async ({ to, subject, html, text, idempotencyKey }) => {
      await email.send({
        to,
        subject,
        html,
        text,
        idempotencyKey,
      })
    }),
    sendDeleteAccountVerification: vi.fn(),
  }
  return email
}

describe('communitySurveyService', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  beforeEach(async () => {
    await db.delete(schema.communitySurveyInviteEmail)
  })

  it('sends one survey invite email per Stripe checkout session', async () => {
    const email = createMockEmailService()
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV('https://example.com/survey'),
      email,
    )

    const session = {
      id: 'cs_survey_once',
      metadata: { userId: 'user-survey-1' },
      customer_email: 'paid@example.com',
      customer_details: { email: 'paid@example.com' },
      payment_status: 'paid',
    }

    const first = await service.sendPaidSurveyInviteForCheckout(session as any)
    const second = await service.sendPaidSurveyInviteForCheckout(session as any)

    expect(first).toEqual({ sent: true })
    expect(second).toEqual({ sent: false, reason: 'already_sent' })
    expect(email.send).toHaveBeenCalledTimes(1)
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'paid@example.com',
      subject: '__configured_subject__',
      text: '__configured_text__ https://example.com/survey',
      html: '<p>__configured_html__ https://example.com/survey</p>',
    }))
    expect(email.sendCommunitySurveyInvite).toHaveBeenCalledWith({
      to: 'paid@example.com',
      subject: '__configured_subject__',
      text: '__configured_text__ https://example.com/survey',
      html: '<p>__configured_html__ https://example.com/survey</p>',
      idempotencyKey: 'community-survey:user-survey-1',
    })

    const rows = await db.select().from(schema.communitySurveyInviteEmail).where(eq(schema.communitySurveyInviteEmail.stripeSessionId, 'cs_survey_once'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('sent')
    expect(rows[0]?.sentAt).toBeInstanceOf(Date)
  })

  it('skips survey invite email when checkout payment is not paid', async () => {
    const email = createMockEmailService()
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV('https://example.com/survey'),
      email,
    )

    const result = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_unpaid_survey',
      metadata: { userId: 'user-survey-unpaid' },
      customer_email: 'paid@example.com',
      payment_status: 'unpaid',
    } as any)

    expect(result).toEqual({ sent: false, reason: 'payment_not_paid' })
    expect(email.send).not.toHaveBeenCalled()
  })

  it('sends the survey invite only for the first paid checkout per user', async () => {
    const email = createMockEmailService()
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV('https://example.com/survey'),
      email,
    )

    const first = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_first_payment',
      metadata: { userId: 'user-survey-repeat' },
      customer_email: 'repeat@example.com',
      payment_status: 'paid',
    } as any)

    const second = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_second_payment',
      metadata: { userId: 'user-survey-repeat' },
      customer_email: 'repeat@example.com',
      payment_status: 'paid',
    } as any)

    expect(first).toEqual({ sent: true })
    expect(second).toEqual({ sent: false, reason: 'already_sent' })
    expect(email.send).toHaveBeenCalledTimes(1)

    const rows = await db.select().from(schema.communitySurveyInviteEmail).where(eq(schema.communitySurveyInviteEmail.userId, 'user-survey-repeat'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stripeSessionId).toBe('cs_first_payment')
  })

  it('retries delivery after the previous email attempt failed', async () => {
    const email = createMockEmailService()
    vi.mocked(email.sendCommunitySurveyInvite)
      .mockRejectedValueOnce(new Error('resend unavailable'))
      .mockResolvedValueOnce(undefined)
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV('https://example.com/survey'),
      email,
    )

    const session = {
      id: 'cs_retry_failed',
      metadata: { userId: 'user-survey-failed-retry' },
      customer_email: 'retry@example.com',
      payment_status: 'paid',
    }

    await expect(service.sendPaidSurveyInviteForCheckout(session as any)).rejects.toThrow('resend unavailable')

    const retry = await service.sendPaidSurveyInviteForCheckout(session as any)

    expect(retry).toEqual({ sent: true })
    expect(email.sendCommunitySurveyInvite).toHaveBeenCalledTimes(2)

    const rows = await db.select().from(schema.communitySurveyInviteEmail).where(eq(schema.communitySurveyInviteEmail.userId, 'user-survey-failed-retry'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('sent')
    expect(rows[0]?.failureReason).toBeNull()
    expect(rows[0]?.attemptCount).toBe(2)
  })

  it('does not let a later checkout retry the first checkout survey invite', async () => {
    const email = createMockEmailService()
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV('https://example.com/survey'),
      email,
    )

    await db.insert(schema.communitySurveyInviteEmail).values({
      userId: 'user-survey-failed-first-payment',
      stripeSessionId: 'cs_first_failed',
      toEmail: 'first-failed@example.com',
      surveyUrl: 'https://example.com/survey',
      status: 'failed',
      failureReason: 'resend unavailable',
      attemptCount: 1,
    })

    const result = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_later_payment',
      metadata: { userId: 'user-survey-failed-first-payment' },
      customer_email: 'first-failed@example.com',
      payment_status: 'paid',
    } as any)

    expect(result).toEqual({ sent: false, reason: 'already_pending' })
    expect(email.sendCommunitySurveyInvite).not.toHaveBeenCalled()

    const rows = await db.select().from(schema.communitySurveyInviteEmail).where(eq(schema.communitySurveyInviteEmail.userId, 'user-survey-failed-first-payment'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stripeSessionId).toBe('cs_first_failed')
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.attemptCount).toBe(1)
  })

  it('reclaims a stale pending invite so crash-before-send can recover', async () => {
    const email = createMockEmailService()
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV('https://example.com/survey'),
      email,
    )
    const staleUpdatedAt = new Date(Date.now() - 20 * 60 * 1000)

    await db.insert(schema.communitySurveyInviteEmail).values({
      userId: 'user-survey-stale-pending',
      stripeSessionId: 'cs_stale_original',
      toEmail: 'stale@example.com',
      surveyUrl: 'https://example.com/survey',
      status: 'pending',
      attemptCount: 1,
      updatedAt: staleUpdatedAt,
    })

    const result = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_stale_original',
      metadata: { userId: 'user-survey-stale-pending' },
      customer_email: 'stale@example.com',
      payment_status: 'paid',
    } as any)

    expect(result).toEqual({ sent: true })
    expect(email.sendCommunitySurveyInvite).toHaveBeenCalledTimes(1)

    const rows = await db.select().from(schema.communitySurveyInviteEmail).where(eq(schema.communitySurveyInviteEmail.userId, 'user-survey-stale-pending'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stripeSessionId).toBe('cs_stale_original')
    expect(rows[0]?.status).toBe('sent')
    expect(rows[0]?.attemptCount).toBe(2)
  })

  it('skips delivery when the survey URL is not configured', async () => {
    const email = createMockEmailService()
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV(null),
      email,
    )

    const result = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_no_survey_url',
      metadata: { userId: 'user-survey-2' },
      customer_email: 'paid@example.com',
      payment_status: 'paid',
    } as any)

    expect(result).toEqual({ sent: false, reason: 'survey_url_missing' })
    expect(email.send).not.toHaveBeenCalled()

    const retryFromLaterPayment = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_later_after_survey_url_missing',
      metadata: { userId: 'user-survey-2' },
      customer_email: 'paid@example.com',
      payment_status: 'paid',
    } as any)

    expect(retryFromLaterPayment).toEqual({ sent: false, reason: 'already_pending' })
    expect(email.send).not.toHaveBeenCalled()

    const rows = await db.select().from(schema.communitySurveyInviteEmail).where(eq(schema.communitySurveyInviteEmail.userId, 'user-survey-2'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stripeSessionId).toBe('cs_no_survey_url')
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.failureReason).toBe('Community survey URL missing')
  })

  it('claims the first paid checkout when the customer email is missing', async () => {
    const email = createMockEmailService()
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV('https://example.com/survey'),
      email,
    )

    const result = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_no_customer_email',
      metadata: { userId: 'user-survey-no-email' },
      payment_status: 'paid',
    } as any)

    expect(result).toEqual({ sent: false, reason: 'customer_email_missing' })
    expect(email.send).not.toHaveBeenCalled()

    const retryFromLaterPayment = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_later_after_customer_email_missing',
      metadata: { userId: 'user-survey-no-email' },
      customer_email: 'paid@example.com',
      payment_status: 'paid',
    } as any)

    expect(retryFromLaterPayment).toEqual({ sent: false, reason: 'already_pending' })
    expect(email.send).not.toHaveBeenCalled()

    const rows = await db.select().from(schema.communitySurveyInviteEmail).where(eq(schema.communitySurveyInviteEmail.userId, 'user-survey-no-email'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stripeSessionId).toBe('cs_no_customer_email')
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.failureReason).toBe('Checkout session missing customer email')
  })

  it('skips delivery when private survey email content is not configured', async () => {
    const email = createMockEmailService()
    const service = createCommunitySurveyService(
      db,
      createMockConfigKV('https://example.com/survey', {
        COMMUNITY_SURVEY_EMAIL_HTML: null,
      }),
      email,
    )

    const result = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_no_survey_email_content',
      metadata: { userId: 'user-survey-private-template' },
      customer_email: 'paid@example.com',
      payment_status: 'paid',
    } as any)

    expect(result).toEqual({ sent: false, reason: 'email_template_missing' })
    expect(email.send).not.toHaveBeenCalled()

    const retryFromLaterPayment = await service.sendPaidSurveyInviteForCheckout({
      id: 'cs_later_after_template_missing',
      metadata: { userId: 'user-survey-private-template' },
      customer_email: 'paid@example.com',
      payment_status: 'paid',
    } as any)

    expect(retryFromLaterPayment).toEqual({ sent: false, reason: 'already_pending' })
    expect(email.send).not.toHaveBeenCalled()

    const rows = await db.select().from(schema.communitySurveyInviteEmail).where(eq(schema.communitySurveyInviteEmail.userId, 'user-survey-private-template'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stripeSessionId).toBe('cs_no_survey_email_content')
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.failureReason).toBe('Community survey email content missing')
  })
})
