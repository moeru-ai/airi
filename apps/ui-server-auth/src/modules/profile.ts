/**
 * Account profile flows backed by better-auth's built-in user routes.
 *
 * Use when:
 * - Driving the profile page in `apps/ui-server-auth` (load current user,
 *   update display name, change password, sign out).
 *
 * Each function shares the {@link AuthFetchBase} contract via auth-fetch.ts;
 * see that module for HTTP-level expectations (credentials, error parsing).
 */

import type { AuthFetchBase } from './auth-fetch'

import { errorMessageFrom } from '@moeru/std'

import { getAuthJSON, postAuthJSON } from './auth-fetch'

/**
 * Subset of the better-auth `user` row needed to render the profile page.
 *
 * Mirrors the shape returned by `/api/auth/get-session`; extra fields are
 * ignored intentionally so this module doesn't drift if better-auth adds
 * unrelated columns.
 */
export interface ProfileUser {
  id: string
  /** Display name set on sign-up or via {@link updateUserProfile}. */
  name: string
  email: string
  /** True once the user clicked the verification link sent on sign-up. */
  emailVerified: boolean
  /** Avatar URL — usually populated by social providers; may be empty. */
  image: string | null
  /** ISO timestamp from `created_at`. */
  createdAt: string | null
}

/**
 * Result of a `/get-session` probe.
 *
 * `user` is `null` when no session cookie is present (or it expired). Caller
 * uses that to redirect to the sign-in page instead of rendering the form.
 */
export interface CurrentSessionResult {
  user: ProfileUser | null
}

interface UpdateUserProfileArgs extends AuthFetchBase {
  /** Trim before passing — server stores the value as-is. */
  name?: string
  /** Optional avatar URL. Pass `null` to clear it. */
  image?: string | null
}

interface ChangePasswordArgs extends AuthFetchBase {
  currentPassword: string
  newPassword: string
  /**
   * Revoke other active sessions after password change.
   *
   * @default true
   */
  revokeOtherSessions?: boolean
}

/**
 * Read the current session from `/api/auth/get-session`.
 *
 * Use when:
 * - Bootstrapping the profile page; decides whether to render the form or
 *   bounce the user to the sign-in page.
 *
 * Expects:
 * - Browser sends the better-auth session cookie (`credentials: include`).
 *
 * Returns:
 * - `user: null` when there's no active session (better-auth returns an empty
 *   body for unauthenticated GETs).
 * - {@link CurrentSessionResult} with the trimmed user fields otherwise.
 */
export async function getCurrentSession(args: AuthFetchBase): Promise<CurrentSessionResult> {
  return getAuthJSON(args, '/get-session', (data) => {
    // NOTICE:
    // better-auth returns either `null` or an empty object for an
    // unauthenticated GET to `/get-session`, not a 401. Treat both as
    // "no session" so the caller can branch on user === null without a
    // separate try/catch.
    // Source: node_modules/better-auth/dist/api/routes/session.mjs (`getSession`)
    if (!data || typeof data !== 'object' || !('user' in data) || !data.user)
      return { user: null }

    const raw = (data as { user: unknown }).user as Record<string, unknown>
    const user: ProfileUser = {
      id: typeof raw.id === 'string' ? raw.id : '',
      name: typeof raw.name === 'string' ? raw.name : '',
      email: typeof raw.email === 'string' ? raw.email : '',
      emailVerified: Boolean(raw.emailVerified),
      image: typeof raw.image === 'string' ? raw.image : null,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    }
    return { user }
  })
}

/**
 * Update the signed-in user's display name and/or avatar.
 *
 * Use when:
 * - Saving the "display name" form on the profile page.
 *
 * Expects:
 * - Caller has already trimmed `name` and confirmed it's non-empty.
 * - `image` is either an absolute URL or `null` (clear).
 *
 * Returns:
 * - Resolves on 2xx; throws with the better-auth error message otherwise.
 */
export async function updateUserProfile(args: UpdateUserProfileArgs): Promise<void> {
  const body: Record<string, unknown> = {}
  if (args.name !== undefined)
    body.name = args.name
  if (args.image !== undefined)
    body.image = args.image

  await postAuthJSON(args, '/update-user', body, () => undefined)
}

/**
 * Change the signed-in user's password using their current credential.
 *
 * Use when:
 * - User is signed in and wants to rotate their password from the profile
 *   page (not the forgot-password email flow).
 *
 * Expects:
 * - The user has a `credential` account; social-only users get a server-side
 *   error which surfaces as a thrown `Error` here.
 *
 * Returns:
 * - Resolves on 2xx. By default, all other sessions are revoked
 *   (`revokeOtherSessions = true`) so a stolen old session can't keep
 *   working after a forced rotation.
 */
export async function changePassword(args: ChangePasswordArgs): Promise<void> {
  await postAuthJSON(
    args,
    '/change-password',
    {
      currentPassword: args.currentPassword,
      newPassword: args.newPassword,
      revokeOtherSessions: args.revokeOtherSessions ?? true,
    },
    () => undefined,
  )
}

/**
 * Sign the current user out via `/api/auth/sign-out`.
 *
 * Use when:
 * - User clicks "Sign out" on the profile page.
 *
 * Returns:
 * - Resolves once the better-auth session cookie has been cleared by the
 *   server. Caller is expected to navigate the user back to the sign-in
 *   page after this resolves.
 */
export async function signOut(args: AuthFetchBase): Promise<void> {
  await postAuthJSON(args, '/sign-out', {}, () => undefined)
}

export function describeProfileError(error: unknown): string {
  return errorMessageFrom(error) ?? 'Unexpected error'
}
