import type Stripe from 'stripe'

import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../adapters/config-kv'
import type { EmailService } from '../adapters/email'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { and, eq, lte, or, sql } from 'drizzle-orm'

import * as schema from '../../schemas/community'

const logger = useLogger('community-survey')

type SurveyInviteResult
  = | { sent: true }
    | { sent: false, reason: 'already_pending' | 'already_sent' | 'customer_email_missing' | 'email_template_missing' | 'payment_not_paid' | 'survey_url_missing' | 'user_id_missing' }

interface SurveyInviteClaim {
  claimed: boolean
  reason?: 'already_pending' | 'already_sent'
}

interface SurveyInviteEmailContent {
  subject: string
  html: string
  text: string
}

const surveyUrlPlaceholder = '{{surveyUrl}}'

/**
 * Build the provider-side idempotency key for a user's first paid survey invite.
 */
function buildSurveyInviteIdempotencyKey(userId: string): string {
  return `community-survey:${userId}`
}

/**
 * Render private runtime-configured survey email content.
 *
 * Before:
 * - `"Open: {{surveyUrl}}"`
 *
 * After:
 * - `"Open: https://example.com/survey"`
 */
function renderSurveyInviteEmailContent(template: SurveyInviteEmailContent, surveyUrl: string): SurveyInviteEmailContent {
  return {
    subject: template.subject.trim(),
    html: template.html.replaceAll(surveyUrlPlaceholder, surveyUrl),
    text: template.text.replaceAll(surveyUrlPlaceholder, surveyUrl),
  }
}

/**
 * Create the paid-community survey service.
 *
 * Use when:
 * - A Stripe checkout webhook has already fulfilled the user's paid benefit.
 * - The survey email should be delivered for the user's first paid checkout only.
 *
 * Expects:
 * - `COMMUNITY_SURVEY_URL` is configured in ConfigKV when this flow is enabled.
 * - Stripe checkout sessions carry `metadata.userId` from checkout creation.
 *
 * Returns:
 * - A service that claims an idempotency row before sending email.
 */
export function createCommunitySurveyService(
  db: Database,
  configKV: ConfigKVService,
  email: EmailService,
) {
  /**
   * Claim one checkout session for survey invite delivery.
   */
  async function claimInvite(input: {
    userId: string
    stripeSessionId: string
    toEmail: string | null
    surveyUrl: string | null
  }): Promise<SurveyInviteClaim> {
    const now = new Date()
    // A process can crash after writing `pending` but before calling Resend.
    // Ten minutes is long enough to avoid normal in-flight duplicate webhook
    // races while still letting Stripe retries recover the stuck row quickly.
    const stalePendingBefore = new Date(now.getTime() - 10 * 60 * 1000)
    const [inserted] = await db.insert(schema.communitySurveyInviteEmail)
      .values({
        userId: input.userId,
        stripeSessionId: input.stripeSessionId,
        toEmail: input.toEmail,
        surveyUrl: input.surveyUrl,
        status: 'pending',
        attemptCount: 1,
      })
      .onConflictDoNothing({ target: schema.communitySurveyInviteEmail.userId })
      .returning()

    if (inserted)
      return { claimed: true }

    const [retry] = await db.update(schema.communitySurveyInviteEmail)
      .set({
        toEmail: input.toEmail,
        surveyUrl: input.surveyUrl,
        status: 'pending',
        failureReason: null,
        attemptCount: sql`${schema.communitySurveyInviteEmail.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(and(
        eq(schema.communitySurveyInviteEmail.userId, input.userId),
        eq(schema.communitySurveyInviteEmail.stripeSessionId, input.stripeSessionId),
        or(
          eq(schema.communitySurveyInviteEmail.status, 'failed'),
          and(
            eq(schema.communitySurveyInviteEmail.status, 'pending'),
            lte(schema.communitySurveyInviteEmail.updatedAt, stalePendingBefore),
          ),
        ),
      ))
      .returning()

    if (retry)
      return { claimed: true }

    const existing = await db.query.communitySurveyInviteEmail.findFirst({
      where: eq(schema.communitySurveyInviteEmail.userId, input.userId),
    })

    return {
      claimed: false,
      reason: existing?.status === 'sent' ? 'already_sent' : 'already_pending',
    }
  }

  /**
   * Mark a claimed survey invite as sent.
   */
  async function markSent(stripeSessionId: string): Promise<void> {
    const now = new Date()
    await db.update(schema.communitySurveyInviteEmail)
      .set({
        status: 'sent',
        sentAt: now,
        failureReason: null,
        updatedAt: now,
      })
      .where(eq(schema.communitySurveyInviteEmail.stripeSessionId, stripeSessionId))
  }

  /**
   * Mark a claimed survey invite as failed so Stripe webhook retries can send it again.
   */
  async function markFailed(stripeSessionId: string, failureReason: string): Promise<void> {
    await db.update(schema.communitySurveyInviteEmail)
      .set({
        status: 'failed',
        failureReason,
        updatedAt: new Date(),
      })
      .where(eq(schema.communitySurveyInviteEmail.stripeSessionId, stripeSessionId))
  }

  /**
   * Load private email content from runtime config so copy never lands in PRs.
   */
  async function loadEmailContent(surveyUrl: string): Promise<SurveyInviteEmailContent | null> {
    const [subject, html, text] = await Promise.all([
      configKV.getOptional('COMMUNITY_SURVEY_EMAIL_SUBJECT'),
      configKV.getOptional('COMMUNITY_SURVEY_EMAIL_HTML'),
      configKV.getOptional('COMMUNITY_SURVEY_EMAIL_TEXT'),
    ])

    if (!subject?.trim() || !html?.trim() || !text?.trim())
      return null

    return renderSurveyInviteEmailContent({ subject, html, text }, surveyUrl)
  }

  return {
    /**
     * Send the survey invite for one paid checkout session.
     *
     * Use when:
     * - `checkout.session.completed` has passed the payment fulfillment checks.
     *
     * Expects:
     * - A customer email is present on the Checkout Session.
     *
     * Returns:
     * - `{ sent: true }` only when this call actually submits the email.
     */
    async sendPaidSurveyInviteForCheckout(session: Stripe.Checkout.Session): Promise<SurveyInviteResult> {
      if (session.payment_status !== 'paid')
        return { sent: false, reason: 'payment_not_paid' }

      const userId = session.metadata?.userId
      if (!userId) {
        logger.withFields({ sessionId: session.id }).warn('Checkout session missing userId; skipping survey invite email')
        return { sent: false, reason: 'user_id_missing' }
      }

      const surveyUrl = (await configKV.getOptional('COMMUNITY_SURVEY_URL'))?.trim() || null
      const toEmail = session.customer_details?.email || session.customer_email
      const claim = await claimInvite({
        userId,
        stripeSessionId: session.id,
        toEmail: toEmail ?? null,
        surveyUrl,
      })
      if (!claim.claimed)
        return { sent: false, reason: claim.reason ?? 'already_pending' }

      if (!surveyUrl) {
        const message = 'Community survey URL missing'
        logger.withFields({ userId, sessionId: session.id }).warn(`${message}; skipping survey invite email`)
        await markFailed(session.id, message)
        return { sent: false, reason: 'survey_url_missing' }
      }

      if (!toEmail) {
        const message = 'Checkout session missing customer email'
        logger.withFields({ userId, sessionId: session.id }).warn(`${message}; skipping survey invite email`)
        await markFailed(session.id, message)
        return { sent: false, reason: 'customer_email_missing' }
      }

      const emailContent = await loadEmailContent(surveyUrl)
      if (!emailContent) {
        const message = 'Community survey email content missing'
        logger.withFields({ userId, sessionId: session.id }).warn(`${message}; skipping survey invite email`)
        await markFailed(session.id, message)
        return { sent: false, reason: 'email_template_missing' }
      }

      try {
        await email.sendCommunitySurveyInvite({
          to: toEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          idempotencyKey: buildSurveyInviteIdempotencyKey(userId),
        })
        await markSent(session.id)
        logger.withFields({ userId, sessionId: session.id, toEmail }).log('Sent paid community survey invite')
        return { sent: true }
      }
      catch (error) {
        const message = errorMessageFrom(error) ?? 'Unknown community survey email error'
        await markFailed(session.id, message)
        throw error
      }
    },
  }
}

export type CommunitySurveyService = ReturnType<typeof createCommunitySurveyService>
