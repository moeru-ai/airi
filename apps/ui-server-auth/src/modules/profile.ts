/**
 * Account profile flows backed by better-auth's typed Vue client.
 *
 * Use when:
 * - Driving the profile page in `apps/ui-server-auth` (load current user,
 *   update display name / avatar, change password, sign out).
 *
 * Why this delegates to {@link getAuthClient} instead of hand-rolling
 * `fetch` wrappers: better-auth already returns typed payloads. Mapping
 * `unknown` JSON to a hand-written interface duplicated work the upstream
 * client already does and produced a layer of defensive `typeof x ===
 * 'string' ? x : ''` casts that were brittle and noisy. See
 * `auth-client.ts` for the rationale on the cookie-based credentials mode.
 */

import type { AuthFetchBase } from './auth-fetch'

import { errorMessageFrom } from '@moeru/std'

import { getAuthClient } from './auth-client'

/**
 * Trimmed view of the better-auth `user` row exposed via `/get-session`.
 *
 * Mirrors the better-auth `User` shape but flattens `createdAt` to a
 * string (or null) for ergonomic rendering — better-auth's client returns
 * `Date`, but the profile page formats it via `Intl.DateTimeFormat` which
 * accepts both. We keep the string projection so consumers don't have to
 * worry about Date-vs-string drift across the ui-server-auth boundary.
 */
export interface ProfileUser {
  id: string
  /** Display name set on sign-up or via {@link updateUserProfile}. */
  name: string
  email: string
  /** True once the user clicked the verification link sent on sign-up. */
  emailVerified: boolean
  /**
   * Avatar URL. Server decorates this so it's always populated for
   * signed-in users: provider-set / user-uploaded URL when present, or a
   * Gravatar fallback derived server-side from the email hash. The UI
   * detects the fallback by URL prefix
   * (`https://www.gravatar.com/avatar/`).
   */
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
 * Read the current session via the typed better-auth client.
 *
 * Use when:
 * - Bootstrapping the profile page; decides whether to render the form or
 *   bounce the user to the sign-in page.
 *
 * Returns:
 * - `user: null` for unauthenticated requests (better-auth client returns
 *   `null` data, not an error, in that case).
 * - {@link CurrentSessionResult} with the trimmed user fields otherwise.
 */
export async function getCurrentSession(args: AuthFetchBase): Promise<CurrentSessionResult> {
  const client = getAuthClient(args)
  const { data, error } = await client.getSession()
  if (error)
    throw new Error(error.message ?? `Auth request failed (${error.status ?? 'unknown'})`)
  if (!data?.user)
    return { user: null }

  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      emailVerified: data.user.emailVerified,
      image: data.user.image ?? null,
      createdAt: toIsoString(data.user.createdAt),
    },
  }
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
 */
export async function updateUserProfile(args: UpdateUserProfileArgs): Promise<void> {
  const client = getAuthClient(args)
  const body: { name?: string, image?: string | null } = {}
  if (args.name !== undefined)
    body.name = args.name
  if (args.image !== undefined)
    body.image = args.image
  const { error } = await client.updateUser(body)
  if (error)
    throw new Error(error.message ?? 'updateUser failed')
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
 */
export async function changePassword(args: ChangePasswordArgs): Promise<void> {
  const client = getAuthClient(args)
  const { error } = await client.changePassword({
    currentPassword: args.currentPassword,
    newPassword: args.newPassword,
    revokeOtherSessions: args.revokeOtherSessions ?? true,
  })
  if (error)
    throw new Error(error.message ?? 'changePassword failed')
}

/**
 * Sign the current user out via better-auth's `/sign-out` endpoint.
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
  const client = getAuthClient(args)
  const { error } = await client.signOut()
  if (error)
    throw new Error(error.message ?? 'signOut failed')
}

export function describeProfileError(error: unknown): string {
  return errorMessageFrom(error) ?? 'Unexpected error'
}

/**
 * Normalise better-auth's `Date | string | null | undefined` createdAt into
 * the ISO string the rest of the UI expects.
 *
 * Before:
 * - `new Date('2025-04-01T00:00:00.000Z')` / `'2025-04-01T00:00:00.000Z'` / `null`
 *
 * After:
 * - `'2025-04-01T00:00:00.000Z'` / `'2025-04-01T00:00:00.000Z'` / `null`
 */
function toIsoString(value: unknown): string | null {
  if (value instanceof Date)
    return value.toISOString()
  if (typeof value === 'string')
    return value
  return null
}
