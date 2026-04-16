import type { Env } from '../libs/env'

import { useLogger } from '@guiiai/logg'
import { Resend } from 'resend'

/**
 * Parameters for sending a transactional email.
 */
export interface SendEmailParams {
  /** Recipient email address. */
  to: string
  /** Email subject line. */
  subject: string
  /** HTML body content. */
  html: string
}

/**
 * Reusable email content returned by template helpers.
 */
export interface EmailContent {
  /** Email subject line. */
  subject: string
  /** HTML body content. */
  html: string
}

/**
 * Email service built on Resend.
 *
 * Use when:
 * - Sending transactional emails (password reset, email verification, email change)
 * - Checking if email sending is configured in the current environment
 *
 * Expects:
 * - `env.RESEND_API_KEY` to be set for emails to actually send
 * - `env.RESEND_FROM_EMAIL` to override the default sender address
 *
 * Returns:
 * - Factory object with `sendEmail`, template helpers, and `isAvailable`
 */
export interface EmailService {
  /**
   * Send a transactional email via Resend.
   *
   * Use when:
   * - Triggering auth-related emails (password reset, verification)
   * - Always use fire-and-forget (`void emailService.sendEmail(...)`) in auth hooks — never await
   *
   * Expects:
   * - Resend is configured; logs a warning and silently skips when not available
   *
   * Returns:
   * - Resolves (never throws) — email failure must not crash auth flows
   */
  sendEmail: (params: SendEmailParams) => Promise<void>

  /**
   * Build email content for a password reset request.
   *
   * Use when:
   * - User triggers "forgot password" flow
   *
   * Expects:
   * - `url` is the full password-reset link including the token
   *
   * Returns:
   * - `{ subject, html }` ready to pass to `sendEmail`
   */
  passwordResetEmail: (url: string) => EmailContent

  /**
   * Build email content for an initial email address verification.
   *
   * Use when:
   * - New user registers and needs to verify their email
   *
   * Expects:
   * - `url` is the full verification link including the token
   *
   * Returns:
   * - `{ subject, html }` ready to pass to `sendEmail`
   */
  emailVerificationEmail: (url: string) => EmailContent

  /**
   * Build email content for verifying a new email address after a change request.
   *
   * Use when:
   * - Existing user has requested to change their email address
   *
   * Expects:
   * - `url` is the full verification link for the new address
   *
   * Returns:
   * - `{ subject, html }` ready to pass to `sendEmail`
   */
  changeEmailVerificationEmail: (url: string) => EmailContent

  /**
   * Check whether the email service is configured and ready.
   *
   * Use when:
   * - Conditionally rendering UI that depends on email availability
   * - Guarding optional email flows
   *
   * Returns:
   * - `true` when `RESEND_API_KEY` is set, `false` otherwise
   */
  isAvailable: () => boolean
}

/**
 * Shared wrapper for action link buttons used across all email templates.
 *
 * Before:
 * - `buildActionButton('Reset Password', 'https://example.com/reset?token=abc')`
 *
 * After:
 * - HTML anchor styled as a button pointing to the provided URL
 */
function buildActionButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;padding:14px 32px;background-color:#EC92AD;color:#ffffff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.3px;">${label}</a>`
}

/**
 * Wraps a content block in a standardised AIRI email shell.
 *
 * Before:
 * - Raw content string
 *
 * After:
 * - Full HTML document with header, content area, and footer
 */
function buildEmailShell(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#FDF2F4;font-family:'Nunito','DM Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FDF2F4;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(236,146,173,0.12);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#EC92AD 0%,#F3E2E7 100%);padding:28px 32px;">
              <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.5px;font-family:'Nunito','DM Sans',sans-serif;">AIRI</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#FDF2F4;border-top:1px solid #F3E2E7;">
              <p style="margin:0;color:#b5a3a8;font-size:12px;font-family:'Nunito','DM Sans',sans-serif;">
                This email was sent by AIRI. If you did not request this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Create the AIRI email service backed by Resend.
 *
 * Use when:
 * - Wiring up transactional email capability during server startup
 *
 * Expects:
 * - `env.RESEND_API_KEY` — when absent, `sendEmail` logs a warning and no-ops silently
 * - `env.RESEND_FROM_EMAIL` — optional custom sender; falls back to `noreply@airi.moeru.ai`
 *
 * Returns:
 * - `EmailService` — factory object; no class instantiation
 *
 * Call stack:
 *
 * createApp (../app.ts)
 *   -> {@link createEmailService}
 *     -> Resend SDK (resend)
 */
export function createEmailService(env: Env): EmailService {
  const logger = useLogger('email-service')
  const from = env.RESEND_FROM_EMAIL ?? 'noreply@airi.moeru.ai'

  // Lazily instantiate Resend only when the API key is available.
  // We capture it here so `sendEmail` does not re-read env on every call.
  const client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

  async function sendEmail(params: SendEmailParams): Promise<void> {
    if (!client) {
      logger.warn('Email service not configured — skipping send (set RESEND_API_KEY to enable)')
      return
    }

    try {
      await client.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      })
    }
    catch (error) {
      // NOTICE:
      // Email failure must never propagate — auth flows (password reset, verification)
      // call this fire-and-forget. Throwing would crash the auth handler mid-flight.
      // Root cause: Better Auth hooks run synchronously; awaiting email delivery is not safe.
      // Removal condition: Never — this is an intentional design constraint.
      logger.withError(error).error('Failed to send email')
    }
  }

  function passwordResetEmail(url: string): EmailContent {
    const content = `
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#2d2a2b;font-family:'Nunito','DM Sans',sans-serif;">Reset your password</h1>
      <p style="margin:0 0 28px;color:#5a5456;font-size:15px;line-height:1.7;font-family:'Nunito','DM Sans',sans-serif;">
        We received a request to reset the password for your AIRI account.
        Click the button below to choose a new password.
      </p>
      <p style="margin:0 0 28px;text-align:center;">${buildActionButton('Reset Password', url)}</p>
      <p style="margin:0;color:#b5a3a8;font-size:13px;line-height:1.6;font-family:'Nunito','DM Sans',sans-serif;">
        This link expires in 1 hour. If you did not request a password reset, no action is needed.
      </p>`
    return {
      subject: 'Reset your AIRI password',
      html: buildEmailShell('Reset your AIRI password', content),
    }
  }

  function emailVerificationEmail(url: string): EmailContent {
    const content = `
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#2d2a2b;font-family:'Nunito','DM Sans',sans-serif;">Verify your email address</h1>
      <p style="margin:0 0 28px;color:#5a5456;font-size:15px;line-height:1.7;font-family:'Nunito','DM Sans',sans-serif;">
        Thanks for signing up for AIRI! Please verify your email address to activate your account.
      </p>
      <p style="margin:0 0 28px;text-align:center;">${buildActionButton('Verify Email', url)}</p>
      <p style="margin:0;color:#b5a3a8;font-size:13px;line-height:1.6;font-family:'Nunito','DM Sans',sans-serif;">
        This link expires in 24 hours.
      </p>`
    return {
      subject: 'Verify your AIRI email address',
      html: buildEmailShell('Verify your AIRI email address', content),
    }
  }

  function changeEmailVerificationEmail(url: string): EmailContent {
    const content = `
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#2d2a2b;font-family:'Nunito','DM Sans',sans-serif;">Confirm your new email address</h1>
      <p style="margin:0 0 28px;color:#5a5456;font-size:15px;line-height:1.7;font-family:'Nunito','DM Sans',sans-serif;">
        You recently requested to change the email address on your AIRI account.
        Click the button below to confirm your new address.
      </p>
      <p style="margin:0 0 28px;text-align:center;">${buildActionButton('Confirm Email Change', url)}</p>
      <p style="margin:0;color:#b5a3a8;font-size:13px;line-height:1.6;font-family:'Nunito','DM Sans',sans-serif;">
        This link expires in 1 hour. If you did not request this change, please secure your account immediately.
      </p>`
    return {
      subject: 'Confirm your new AIRI email address',
      html: buildEmailShell('Confirm your new AIRI email address', content),
    }
  }

  function isAvailable(): boolean {
    return client !== null
  }

  return {
    sendEmail,
    passwordResetEmail,
    emailVerificationEmail,
    changeEmailVerificationEmail,
    isAvailable,
  }
}
