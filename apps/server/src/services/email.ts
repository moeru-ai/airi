import type { Logger } from '@guiiai/logg'

import type { EmailMetrics } from '../otel'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { Resend } from 'resend'

import { ApiError } from '../utils/error'

/**
 * Outbound email payload accepted by {@link EmailService.send}.
 *
 * Use when:
 * - Building a higher-level transactional template (verification, reset, magic link, change-email).
 *
 * Expects:
 * - Both `html` and `text` set so deliverability scoring stays high (text fallback
 *   is what spam filters score when HTML is hostile or stripped).
 * - `to` is already validated by Better Auth (we trust caller for internal flows).
 */
export interface EmailPayload {
  /** Recipient address. Single address — Better Auth callbacks always emit one. */
  to: string
  /** Subject line. Plain text. */
  subject: string
  /** HTML body. */
  html: string
  /** Plain-text body. Required for spam-filter parity and accessibility. */
  text: string
}

/**
 * Email service abstraction shared by all Better Auth callbacks.
 *
 * Use when:
 * - Wiring `sendVerificationEmail` / `sendResetPassword` / `sendMagicLink` /
 *   `sendChangeEmailConfirmation` in `createAuth()`.
 *
 * Expects:
 * - Service is constructed once per process by `injeca` and shared across requests.
 *
 * Returns:
 * - A `send` method plus four high-level helpers that own subject/body composition.
 */
export interface EmailService {
  send: (payload: EmailPayload) => Promise<void>
  sendVerification: (params: { to: string, url: string }) => Promise<void>
  sendPasswordReset: (params: { to: string, url: string }) => Promise<void>
  sendMagicLink: (params: { to: string, url: string }) => Promise<void>
  sendChangeEmailConfirmation: (params: { to: string, newEmail: string, url: string }) => Promise<void>
  /**
   * Send the irreversible-action confirmation for `user.deleteUser` flow.
   *
   * Wired into better-auth's `user.deleteUser.sendDeleteAccountVerification`.
   * The link expires per `deleteTokenExpiresIn` (default 24h) and is
   * single-use; clicking it triggers `beforeDelete` → soft-delete handlers →
   * hard-delete user.
   *
   * Source: node_modules/better-auth/dist/api/routes/update-user.mjs L286-300.
   */
  sendDeleteAccountVerification: (params: { to: string, url: string }) => Promise<void>
}

interface EmailConfig {
  apiKey: string
  fromEmail: string
  fromName?: string
}

/**
 * Format an RFC 5322 display-name + address pair for the `From` header.
 *
 * Before:
 * - `{ fromEmail: 'noreply@a.io', fromName: 'AIRI' }`
 *
 * After:
 * - `'AIRI <noreply@a.io>'`
 */
function formatFrom(config: EmailConfig): string {
  if (config.fromName)
    return `${config.fromName} <${config.fromEmail}>`
  return config.fromEmail
}

/**
 * Construct the email service.
 *
 * Use when:
 * - DI assembly in `apps/server/src/app.ts`.
 *
 * Expects:
 * - `RESEND_API_KEY` is set in env. When empty, `send` throws an `ApiError`
 *   instead of silently dropping mail — Better Auth surfaces it back to the
 *   caller so frontend can show a clear "email service not configured" error.
 */
export function createEmailService(config: EmailConfig, logger: Logger = useLogger('email'), metrics?: EmailMetrics | null): EmailService {
  // NOTICE:
  // Construct Resend lazily so the server can boot in environments where the
  // RESEND_API_KEY is intentionally empty (e.g. local dev that never exercises
  // email flows). Calls to `send` will throw, which Better Auth surfaces.
  // Root cause summary: Resend's constructor logs but does not throw on empty
  // keys; explicit guard keeps the failure mode visible at the call site.
  // Source: node_modules/.pnpm/resend@*/node_modules/resend/dist/index.cjs
  // Removal condition: when we make RESEND_API_KEY required at env-parse time.
  let client: Resend | null = null
  function getClient(): Resend {
    if (!client) {
      if (!config.apiKey) {
        throw new ApiError(
          503,
          'email/service_not_configured',
          'Email service not configured (RESEND_API_KEY is missing).',
        )
      }
      client = new Resend(config.apiKey)
    }
    return client
  }

  const from = formatFrom(config)

  async function send(payload: EmailPayload, template: string = 'unknown'): Promise<void> {
    const startedAt = Date.now()
    try {
      const { error } = await getClient().emails.send({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      })

      if (error) {
        logger.withFields({ to: payload.to, subject: payload.subject, errorName: error.name }).error(error.message)
        metrics?.failures.add(1, { template, error_name: error.name })
        metrics?.duration.record((Date.now() - startedAt) / 1000, { template, outcome: 'error' })
        throw new ApiError(502, 'email/send_failed', error.message, { providerError: error.name })
      }
      metrics?.send.add(1, { template })
      metrics?.duration.record((Date.now() - startedAt) / 1000, { template, outcome: 'ok' })
    }
    catch (error) {
      if (error instanceof ApiError)
        throw error

      const message = errorMessageFrom(error) ?? 'Unknown email send error'
      logger.withFields({ to: payload.to, subject: payload.subject }).error(message)
      metrics?.failures.add(1, { template, error_name: 'unhandled' })
      metrics?.duration.record((Date.now() - startedAt) / 1000, { template, outcome: 'error' })
      throw new ApiError(502, 'email/send_failed', message)
    }
  }

  return {
    send,
    async sendVerification({ to, url }) {
      await send({
        to,
        subject: 'Verify your email for Project AIRI',
        html: renderVerificationHtml(url),
        text: renderVerificationText(url),
      }, 'verification')
    },
    async sendPasswordReset({ to, url }) {
      await send({
        to,
        subject: 'Reset your Project AIRI password',
        html: renderPasswordResetHtml(url),
        text: renderPasswordResetText(url),
      }, 'password_reset')
    },
    async sendMagicLink({ to, url }) {
      await send({
        to,
        subject: 'Your Project AIRI sign-in link',
        html: renderMagicLinkHtml(url),
        text: renderMagicLinkText(url),
      }, 'magic_link')
    },
    async sendChangeEmailConfirmation({ to, newEmail, url }) {
      await send({
        to,
        subject: 'Confirm your new email address for Project AIRI',
        html: renderChangeEmailHtml(url, newEmail),
        text: renderChangeEmailText(url, newEmail),
      }, 'change_email')
    },
    async sendDeleteAccountVerification({ to, url }) {
      await send({
        to,
        subject: 'Confirm account deletion for Project AIRI',
        html: renderDeleteAccountHtml(url),
        text: renderDeleteAccountText(url),
      }, 'delete_account')
    },
  }
}

// NOTICE:
// Templates are intentionally minimal inline HTML. Goal here is functional
// delivery + plaintext fallback. Visual design is deferred (see
// docs/ai/context/email-auth-resend.md "不做" section).

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderActionEmailHtml(args: { heading: string, body: string, ctaLabel: string, url: string, footer: string }): string {
  const safeUrl = escapeHtml(args.url)
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, sans-serif; color: #111; max-width: 480px; margin: 24px auto; padding: 0 16px;">
  <h2 style="margin: 0 0 16px;">${escapeHtml(args.heading)}</h2>
  <p style="margin: 0 0 16px;">${escapeHtml(args.body)}</p>
  <p style="margin: 0 0 16px;"><a href="${safeUrl}" style="display: inline-block; padding: 10px 16px; background: #111; color: #fff; border-radius: 6px; text-decoration: none;">${escapeHtml(args.ctaLabel)}</a></p>
  <p style="margin: 0 0 16px; font-size: 12px; color: #666;">If the button doesn't work, copy this URL into your browser:<br/><span style="word-break: break-all;">${safeUrl}</span></p>
  <p style="margin: 24px 0 0; font-size: 12px; color: #888;">${escapeHtml(args.footer)}</p>
</body></html>`
}

function renderActionEmailText(args: { heading: string, body: string, url: string, footer: string }): string {
  return `${args.heading}\n\n${args.body}\n\n${args.url}\n\n${args.footer}\n`
}

function renderVerificationHtml(url: string): string {
  return renderActionEmailHtml({
    heading: 'Verify your email',
    body: 'Welcome to Project AIRI. Click the button below to confirm this is your email address.',
    ctaLabel: 'Verify email',
    url,
    footer: 'If you did not create an account, you can safely ignore this email.',
  })
}

function renderVerificationText(url: string): string {
  return renderActionEmailText({
    heading: 'Verify your email',
    body: 'Welcome to Project AIRI. Open this link to confirm your email address:',
    url,
    footer: 'If you did not create an account, you can safely ignore this email.',
  })
}

function renderPasswordResetHtml(url: string): string {
  return renderActionEmailHtml({
    heading: 'Reset your password',
    body: 'We received a request to reset the password for your Project AIRI account.',
    ctaLabel: 'Reset password',
    url,
    footer: 'If you did not request this, you can safely ignore this email — your password will not change.',
  })
}

function renderPasswordResetText(url: string): string {
  return renderActionEmailText({
    heading: 'Reset your password',
    body: 'Open this link to reset your Project AIRI password:',
    url,
    footer: 'If you did not request this, you can safely ignore this email — your password will not change.',
  })
}

function renderMagicLinkHtml(url: string): string {
  return renderActionEmailHtml({
    heading: 'Sign in to Project AIRI',
    body: 'Click the button below to sign in. This link expires shortly and can be used once.',
    ctaLabel: 'Sign in',
    url,
    footer: 'If you did not request this link, you can safely ignore this email.',
  })
}

function renderMagicLinkText(url: string): string {
  return renderActionEmailText({
    heading: 'Sign in to Project AIRI',
    body: 'Open this link to sign in (single-use, expires shortly):',
    url,
    footer: 'If you did not request this link, you can safely ignore this email.',
  })
}

function renderChangeEmailHtml(url: string, newEmail: string): string {
  return renderActionEmailHtml({
    heading: 'Confirm your new email',
    body: `Confirm that ${newEmail} should become your Project AIRI account email.`,
    ctaLabel: 'Confirm new email',
    url,
    footer: 'If you did not request this change, contact support immediately.',
  })
}

function renderChangeEmailText(url: string, newEmail: string): string {
  return renderActionEmailText({
    heading: 'Confirm your new email',
    body: `Confirm that ${newEmail} should become your Project AIRI account email by opening this link:`,
    url,
    footer: 'If you did not request this change, contact support immediately.',
  })
}

// NOTICE:
// Wording is intentionally short and direct. Account deletion hard-deletes
// the auth identity (cascade) and soft-archives business records; the user
// cannot recover the account through the UI.
// See `apps/server/docs/ai-context/account-deletion.md`.
function renderDeleteAccountHtml(url: string): string {
  return renderActionEmailHtml({
    heading: 'Confirm account deletion',
    body: 'Click below to permanently delete your Project AIRI account. This cannot be undone. Active subscription will be canceled, Flux balance cleared. Link expires in 24 hours.',
    ctaLabel: 'Delete my account',
    url,
    footer: 'Did not request this? Ignore this email and rotate your password.',
  })
}

function renderDeleteAccountText(url: string): string {
  return renderActionEmailText({
    heading: 'Confirm account deletion',
    body: 'Open this link to permanently delete your Project AIRI account. This cannot be undone. Active subscription will be canceled, Flux balance cleared. Link expires in 24 hours.',
    url,
    footer: 'Did not request this? Ignore this email and rotate your password.',
  })
}
