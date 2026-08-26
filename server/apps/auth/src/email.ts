import type { Logger } from '@guiiai/logg'

import type { EmailMetrics } from './otel'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { Resend } from 'resend'

import { ApiError } from './error'

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
  /** HTML body. */
  html: string
  /** Subject line. Plain text. */
  subject: string
  /** Plain-text body. Required for spam-filter parity and accessibility. */
  text: string
  /** Recipient address. Single address — Better Auth callbacks always emit one. */
  to: string
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
  sendChangeEmailConfirmation: (params: { newEmail: string, to: string, url: string }) => Promise<void>
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
  sendMagicLink: (params: { to: string, url: string }) => Promise<void>
  sendPasswordReset: (params: { to: string, url: string }) => Promise<void>
  sendVerification: (params: { to: string, url: string }) => Promise<void>
}

interface EmailConfig {
  apiKey: string
  fromEmail: string
  fromName?: string
}

/**
 * Construct the email service.
 *
 * Use when:
 * - DI assembly in `server/apps/auth/src/server.ts`.
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
  let client: null | Resend = null
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
        html: payload.html,
        subject: payload.subject,
        text: payload.text,
        to: [payload.to],
      })

      if (error) {
        logger.withFields({ errorName: error.name, subject: payload.subject, to: payload.to }).error(error.message)
        metrics?.failures.add(1, { error_name: error.name, template })
        metrics?.duration.record((Date.now() - startedAt) / 1000, { outcome: 'error', template })
        throw new ApiError(502, 'email/send_failed', error.message, { providerError: error.name })
      }
      metrics?.send.add(1, { template })
      metrics?.duration.record((Date.now() - startedAt) / 1000, { outcome: 'ok', template })
    }
    catch (error) {
      if (error instanceof ApiError)
        throw error

      const message = errorMessageFrom(error) ?? 'Unknown email send error'
      logger.withFields({ subject: payload.subject, to: payload.to }).error(message)
      metrics?.failures.add(1, { error_name: 'unhandled', template })
      metrics?.duration.record((Date.now() - startedAt) / 1000, { outcome: 'error', template })
      throw new ApiError(502, 'email/send_failed', message)
    }
  }

  return {
    send,
    async sendChangeEmailConfirmation({ newEmail, to, url }) {
      await send({
        html: renderChangeEmailHtml(url, newEmail),
        subject: 'Confirm your new email address for Project AIRI',
        text: renderChangeEmailText(url, newEmail),
        to,
      }, 'change_email')
    },
    async sendDeleteAccountVerification({ to, url }) {
      await send({
        html: renderDeleteAccountHtml(url),
        subject: 'Confirm account deletion for Project AIRI',
        text: renderDeleteAccountText(url),
        to,
      }, 'delete_account')
    },
    async sendMagicLink({ to, url }) {
      await send({
        html: renderMagicLinkHtml(url),
        subject: 'Your Project AIRI sign-in link',
        text: renderMagicLinkText(url),
        to,
      }, 'magic_link')
    },
    async sendPasswordReset({ to, url }) {
      await send({
        html: renderPasswordResetHtml(url),
        subject: 'Reset your Project AIRI password',
        text: renderPasswordResetText(url),
        to,
      }, 'password_reset')
    },
    async sendVerification({ to, url }) {
      await send({
        html: renderVerificationHtml(url),
        subject: 'Verify your email for Project AIRI',
        text: renderVerificationText(url),
        to,
      }, 'verification')
    },
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// NOTICE:
// Templates are intentionally minimal inline HTML. Goal here is functional
// delivery + plaintext fallback. Visual design is deferred (see
// docs/ai/context/email-auth-resend.md "不做" section).

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

function renderActionEmailHtml(args: { body: string, ctaLabel: string, footer: string, heading: string, url: string }): string {
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

function renderActionEmailText(args: { body: string, footer: string, heading: string, url: string }): string {
  return `${args.heading}\n\n${args.body}\n\n${args.url}\n\n${args.footer}\n`
}

function renderChangeEmailHtml(url: string, newEmail: string): string {
  return renderActionEmailHtml({
    body: `Confirm that ${newEmail} should become your Project AIRI account email.`,
    ctaLabel: 'Confirm new email',
    footer: 'If you did not request this change, contact support immediately.',
    heading: 'Confirm your new email',
    url,
  })
}

function renderChangeEmailText(url: string, newEmail: string): string {
  return renderActionEmailText({
    body: `Confirm that ${newEmail} should become your Project AIRI account email by opening this link:`,
    footer: 'If you did not request this change, contact support immediately.',
    heading: 'Confirm your new email',
    url,
  })
}

// NOTICE:
// Wording is intentionally short and direct. Account deletion hard-deletes
// the auth identity (cascade) and soft-archives business records; the user
// cannot recover the account through the UI.
// See `server/apps/api/docs/ai-context/account-deletion.md`.
function renderDeleteAccountHtml(url: string): string {
  return renderActionEmailHtml({
    body: 'Click below to permanently delete your Project AIRI account. This cannot be undone. Active subscription will be canceled, Flux balance cleared. Link expires in 24 hours.',
    ctaLabel: 'Delete my account',
    footer: 'Did not request this? Ignore this email and rotate your password.',
    heading: 'Confirm account deletion',
    url,
  })
}

function renderDeleteAccountText(url: string): string {
  return renderActionEmailText({
    body: 'Open this link to permanently delete your Project AIRI account. This cannot be undone. Active subscription will be canceled, Flux balance cleared. Link expires in 24 hours.',
    footer: 'Did not request this? Ignore this email and rotate your password.',
    heading: 'Confirm account deletion',
    url,
  })
}

function renderMagicLinkHtml(url: string): string {
  return renderActionEmailHtml({
    body: 'Click the button below to sign in. This link expires shortly and can be used once.',
    ctaLabel: 'Sign in',
    footer: 'If you did not request this link, you can safely ignore this email.',
    heading: 'Sign in to Project AIRI',
    url,
  })
}

function renderMagicLinkText(url: string): string {
  return renderActionEmailText({
    body: 'Open this link to sign in (single-use, expires shortly):',
    footer: 'If you did not request this link, you can safely ignore this email.',
    heading: 'Sign in to Project AIRI',
    url,
  })
}

function renderPasswordResetHtml(url: string): string {
  return renderActionEmailHtml({
    body: 'We received a request to reset the password for your Project AIRI account.',
    ctaLabel: 'Reset password',
    footer: 'If you did not request this, you can safely ignore this email — your password will not change.',
    heading: 'Reset your password',
    url,
  })
}

function renderPasswordResetText(url: string): string {
  return renderActionEmailText({
    body: 'Open this link to reset your Project AIRI password:',
    footer: 'If you did not request this, you can safely ignore this email — your password will not change.',
    heading: 'Reset your password',
    url,
  })
}

function renderVerificationHtml(url: string): string {
  return renderActionEmailHtml({
    body: 'Welcome to Project AIRI. Click the button below to confirm this is your email address.',
    ctaLabel: 'Verify email',
    footer: 'If you did not create an account, you can safely ignore this email.',
    heading: 'Verify your email',
    url,
  })
}

function renderVerificationText(url: string): string {
  return renderActionEmailText({
    body: 'Welcome to Project AIRI. Open this link to confirm your email address:',
    footer: 'If you did not create an account, you can safely ignore this email.',
    heading: 'Verify your email',
    url,
  })
}
