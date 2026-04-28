/**
 * Linked social account flows backed by better-auth's typed Vue client.
 *
 * Use when:
 * - Driving the "Connected accounts" section on the profile page (list,
 *   unlink, and start the OAuth redirect flow to link a new provider).
 *
 * See `auth-client.ts` for the rationale on the cookie-based credentials
 * mode that distinguishes this client from stage-ui's Bearer-only one.
 */

import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import type { AuthFetchBase } from './auth-fetch'

import { getAuthClient } from './auth-client'

/**
 * View of a linked-account row that the UI cares about.
 *
 * Strict subset of better-auth's `/list-accounts` response. Tokens
 * (access/refresh/idToken) are intentionally NOT surfaced here — better-auth
 * also strips them server-side via `parseAccountOutput`.
 */
export interface LinkedAccount {
  /** Internal `account` row id; unstable across DB migrations, do not store. */
  id: string
  /** Provider-defined account identifier (e.g. GitHub user id). */
  accountId: string
  /** Provider key — `google`, `github`, or `credential` for password accounts. */
  providerId: string
  /** ISO timestamp when this provider was linked. */
  createdAt: string
  /** OAuth scopes granted at link time, split from the comma-joined column. */
  scopes: string[]
}

interface UnlinkSocialAccountArgs extends AuthFetchBase {
  providerId: OAuthProvider
  /**
   * Optional account id when the user has multiple rows for the same
   * provider; better-auth otherwise picks the first match.
   */
  accountId?: string
}

interface LinkSocialRedirectArgs extends AuthFetchBase {
  provider: OAuthProvider
  /**
   * URL to land on after the OAuth callback finishes the linking. Usually
   * the profile page itself so the freshly linked account shows up.
   */
  callbackURL: string
  /** URL to redirect to if linking fails (e.g. user denies consent). */
  errorCallbackURL?: string
}

/**
 * Read the current user's linked accounts via better-auth's `listAccounts`.
 *
 * Use when:
 * - Rendering the "Connected accounts" section on the profile page.
 * - Detecting whether the user has a `credential` account so the UI can
 *   warn before unlinking the last social provider.
 */
export async function listLinkedAccounts(args: AuthFetchBase): Promise<LinkedAccount[]> {
  const client = getAuthClient(args)
  const { data, error } = await client.listAccounts()
  if (error)
    throw new Error(error.message ?? 'listAccounts failed')
  if (!data)
    return []

  // NOTICE: better-auth's `listAccounts` typing in v1.6.6 widens each
  // array element to `any` (its OpenAPI schema is `type: object` without
  // field generics). We accept that and consume the row directly —
  // re-typing it inline would just dress the `any` up without buying
  // real safety. Field shape mirrors the server response at
  // node_modules/better-auth/dist/api/routes/account.mjs L20-50.
  return data.map(account => ({
    id: account.id,
    accountId: account.accountId,
    providerId: account.providerId,
    createdAt: account.createdAt instanceof Date
      ? account.createdAt.toISOString()
      : account.createdAt,
    scopes: account.scopes ?? [],
  }))
}

/**
 * Unlink a social provider via better-auth's `unlinkAccount`.
 *
 * Use when:
 * - User clicks "Unlink" next to a connected provider on the profile page.
 *
 * Expects:
 * - The user has at least one *other* way to sign in. Better-auth refuses
 *   to unlink the last account and returns
 *   `FAILED_TO_UNLINK_LAST_ACCOUNT`; the caller should surface that as a
 *   user-friendly message instead of swallowing it.
 */
export async function unlinkSocialAccount(args: UnlinkSocialAccountArgs): Promise<void> {
  const client = getAuthClient(args)
  const { error } = await client.unlinkAccount({
    providerId: args.providerId,
    ...(args.accountId ? { accountId: args.accountId } : {}),
  })
  if (error)
    throw new Error(error.message ?? 'unlinkAccount failed')
}

/**
 * Kick off the OAuth flow that links a new social provider via
 * better-auth's `linkSocial`.
 *
 * Use when:
 * - User clicks "Link" next to a not-yet-connected provider, or "Reconnect"
 *   after an unlink, on the profile page.
 *
 * Returns:
 * - The provider authorization URL the browser must navigate to. Caller
 *   typically does `window.location.assign(url)` to hand off to the OAuth
 *   provider.
 */
export async function requestSocialLinkRedirect(args: LinkSocialRedirectArgs): Promise<string> {
  const client = getAuthClient(args)
  const { data, error } = await client.linkSocial({
    provider: args.provider,
    callbackURL: args.callbackURL,
    ...(args.errorCallbackURL ? { errorCallbackURL: args.errorCallbackURL } : {}),
  })
  if (error)
    throw new Error(error.message ?? 'linkSocial failed')
  if (!data?.url)
    throw new Error('Unexpected response from link-social endpoint')
  return data.url
}
