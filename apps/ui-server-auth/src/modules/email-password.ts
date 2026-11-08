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

import type { InferOutput } from 'valibot'

import type { AuthFetchBase } from './auth-fetch'

import { errorMessageFrom } from '@moeru/std'
import { boolean, object, optional, parse } from 'valibot'

import { postAuthJSON } from './auth-fetch'

interface CheckEmailArgs extends AuthFetchBase {
  email: string
}

/** The discovery response selects a form without granting an authenticated session. */
const CheckEmailResultSchema = object({
  exists: boolean(),
  hasPassword: boolean(),
  // Supported policy: absent status is unknown during independent API and UI deployments.
  emailVerified: optional(boolean()),
})

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
 * - Account existence, credential presence, and verification state for navigation.
 */
export async function checkEmail(args: CheckEmailArgs): Promise<InferOutput<typeof CheckEmailResultSchema>> {
  return postAuthJSON(
    args,
    '/check-email',
    { email: args.email },
    data => parse(CheckEmailResultSchema, data),
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
