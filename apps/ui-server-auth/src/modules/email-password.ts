/**
 * Email + password auth flows backed by better-auth's built-in routes.
 *
 * Use when:
 * - Driving sign-in / sign-up / forgot-password / reset-password forms in
 *   the OIDC login UI (`apps/ui-server-auth`).
 *
 * Each function shares the {@link AuthFetchBase} contract via auth-fetch.ts;
 * see that module for HTTP-level expectations (credentials, error parsing).
 */

import type { AuthFetchBase } from './auth-fetch'

import { errorMessageFrom } from '@moeru/std'

import { postAuthJSON } from './auth-fetch'

interface CheckEmailArgs extends AuthFetchBase {
  email: string
}

/**
 * Result of the email-first identifier probe.
 *
 * Drives whether the unified UI shows the password field (existing
 * credential user), the create-account fields (new email), or steers the
 * user toward a social provider (existing social-only user).
 */
export interface CheckEmailResult {
  /** A user row matches this email (case-insensitive). */
  exists: boolean
  /** That user has a `credential` account, i.e. can sign in via password. */
  hasPassword: boolean
}

interface EmailSignInArgs extends AuthFetchBase {
  email: string
  password: string
  callbackURL?: string
  /** @default true */
  rememberMe?: boolean
}

interface EmailSignUpArgs extends AuthFetchBase {
  email: string
  password: string
  name: string
  callbackURL?: string
}

interface RequestPasswordResetArgs extends AuthFetchBase {
  email: string
  /**
   * Frontend page that better-auth redirects to with `?token=...` after
   * validating the email link.
   */
  redirectTo: string
}

interface ResetPasswordArgs extends AuthFetchBase {
  newPassword: string
  token: string
}

interface SignInResult {
  /** Set when better-auth allows browser to follow the OIDC redirect itself. */
  redirectURL: string | null
  /**
   * True if email verification is still pending; UI should route to
   * the `verify-email` notice page.
   */
  requiresVerification: boolean
}

interface SignUpResult {
  /**
   * True when sendOnSignUp / requireEmailVerification fired; UI shows
   * `please check inbox` instead of an immediate session.
   */
  requiresVerification: boolean
}

/**
 * Probe whether an email is already registered before showing password / sign-up fields.
 *
 * Use when:
 * - Implementing the email-first identifier step on the unified sign-in page.
 *
 * Expects:
 * - `email` is the raw user input; the server normalizes (trim + lowercase).
 *
 * Returns:
 * - {@link CheckEmailResult} indicating existence and whether a credential
 *   account is attached. UI uses these to pick the second step.
 */
export async function checkEmail(args: CheckEmailArgs): Promise<CheckEmailResult> {
  return postAuthJSON(
    args,
    '/check-email',
    { email: args.email },
    (data) => {
      const exists = Boolean((data as { exists?: unknown })?.exists)
      const hasPassword = Boolean((data as { hasPassword?: unknown })?.hasPassword)
      return { exists, hasPassword }
    },
  )
}

export async function signInWithEmail(args: EmailSignInArgs): Promise<SignInResult> {
  return postAuthJSON(
    args,
    '/sign-in/email',
    {
      email: args.email,
      password: args.password,
      callbackURL: args.callbackURL,
      rememberMe: args.rememberMe ?? true,
    },
    (data) => {
      const url = typeof (data as { url?: unknown })?.url === 'string'
        ? (data as { url: string }).url
        : null
      // NOTICE:
      // better-auth surfaces `requiresEmailVerification` (rather than throwing)
      // when emailAndPassword.requireEmailVerification is true and the user is
      // not yet verified. Frontend uses this to route into the `verify-email`
      // notice page instead of bouncing to the OIDC callback.
      // Source: node_modules/better-auth/dist/api/routes/sign-in.mjs L235+
      const requiresVerification = Boolean(
        (data as { requiresEmailVerification?: unknown })?.requiresEmailVerification,
      )
      return { redirectURL: url, requiresVerification }
    },
  )
}

export async function signUpWithEmail(args: EmailSignUpArgs): Promise<SignUpResult> {
  return postAuthJSON(
    args,
    '/sign-up/email',
    {
      email: args.email,
      password: args.password,
      name: args.name,
      callbackURL: args.callbackURL,
    },
    (data) => {
      // When verification is required, better-auth returns `{ token: null, user: ... }`
      // and queues the verification email; otherwise it returns a session token.
      const token = (data as { token?: unknown })?.token
      return { requiresVerification: token === null || token === undefined }
    },
  )
}

export async function requestPasswordReset(args: RequestPasswordResetArgs): Promise<void> {
  await postAuthJSON(
    args,
    '/request-password-reset',
    { email: args.email, redirectTo: args.redirectTo },
    () => undefined,
  )
}

export async function resetPasswordWithToken(args: ResetPasswordArgs): Promise<void> {
  // NOTICE:
  // /reset-password takes the token from the query string in addition to
  // the JSON body — the body alone is not enough. Encode it in both spots
  // so we match the better-auth contract regardless of which one the
  // current version reads.
  // Source: node_modules/better-auth/dist/api/routes/password.mjs L120+
  await postAuthJSON(
    args,
    `/reset-password?token=${encodeURIComponent(args.token)}`,
    { newPassword: args.newPassword, token: args.token },
    () => undefined,
  )
}

export function describeAuthError(error: unknown): string {
  return errorMessageFrom(error) ?? 'Unexpected error'
}
