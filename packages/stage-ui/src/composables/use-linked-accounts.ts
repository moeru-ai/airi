import type { Ref } from 'vue'

import { computed, onMounted, shallowRef, watch } from 'vue'

/**
 * Provider key for the social-link / unlink endpoints. Matches the values
 * better-auth recognises on `/api/auth/link-social` and `/api/auth/unlink-account`.
 */
export type LinkedProviderId = 'google' | 'github' | (string & {})

/**
 * Trimmed view of the row better-auth returns from `/list-accounts`.
 *
 * `createdAt` is always an ISO string here even though the upstream client
 * may hand back `Date` — the composable normalises so consumers don't have
 * to handle both shapes.
 */
export interface LinkedAccountRow {
  id: string
  accountId: string
  providerId: string
  createdAt: string
  scopes: string[]
}

/**
 * Minimum surface of better-auth's typed client that the composable needs.
 *
 * Defined as a structural interface (rather than `ReturnType<typeof
 * createAuthClient>`) so callers can pass either the cookie-credentialed
 * client used by `apps/ui-server-auth` or the Bearer-only client used by
 * `apps/stage-web` — both satisfy these three methods.
 *
 * Methods are typed loosely on `data` because better-auth v1.6.6 widens
 * the OpenAPI-derived array element to `any[]`. We re-narrow inside the
 * composable; callers just hand the client back as-is.
 */
export interface LinkedAccountsClient {
  listAccounts: () => Promise<{
    data: Array<{
      id: string
      accountId: string
      providerId: string
      createdAt: Date | string
      scopes?: string[]
    }> | null
    error: { message?: string, status?: number } | null
  }>
  unlinkAccount: (args: { providerId: string, accountId?: string }) => Promise<{
    data: unknown
    error: { message?: string, status?: number } | null
  }>
  linkSocial: (args: { provider: string, callbackURL: string, errorCallbackURL?: string }) => Promise<{
    data: { url?: string, redirect?: boolean, status?: boolean } | null
    error: { message?: string, status?: number } | null
  }>
}

/**
 * Strings the composable surfaces back to the UI. Kept as plain strings
 * (already-translated) so the composable doesn't depend on a particular
 * i18n implementation. Functions take a `provider` interpolation arg
 * because the rendered strings need the provider's display name.
 */
export interface LinkedAccountsMessages {
  listFailed: string
  unlinkFailed: string
  linkFailed: string
  /** Shown when the user tries to unlink the only sign-in method they have. */
  lastAccount: string
  unlinked: (provider: string) => string
  linkStarted: (provider: string) => string
}

export interface UseLinkedAccountsArgs {
  client: LinkedAccountsClient
  /**
   * Reactive auth state. The composable refreshes the account list when
   * the user signs in and clears it when they sign out.
   */
  isAuthenticated: Ref<boolean>
  messages: LinkedAccountsMessages
  /**
   * Extracts a human-readable error string from caught errors. Both
   * consumers already have one (`errorMessageFrom` from `@moeru/std` or a
   * `describeProfileError` wrapper); pass yours so the composable doesn't
   * pin a specific dependency.
   */
  describeError: (error: unknown) => string
  /**
   * Callback URL the OAuth provider redirects to after consent. Defaults
   * to `window.location.href` so the user lands back on the same page —
   * which works correctly for both web-history (`/settings/account`,
   * `/auth/profile`) and hash-history (`/#/settings/account`) builds.
   */
  buildCallbackURL?: () => string
}

/**
 * Shared state + handlers for the "Connected accounts" UI.
 *
 * Use when:
 * - Driving any profile page that lets the user view, unlink, or link
 *   social providers (currently `apps/ui-server-auth`'s profile and
 *   `apps/stage-web`'s settings/account).
 *
 * Returns refs the template binds against and async handlers wired to
 * the better-auth client. UI rendering is the caller's responsibility —
 * the two consuming pages share ~all the logic but lay out the section
 * differently, so we deliberately stop short of a shared component.
 */
export function useLinkedAccounts(args: UseLinkedAccountsArgs) {
  const linkedAccounts = shallowRef<LinkedAccountRow[]>([])
  const loading = shallowRef(true)
  const error = shallowRef<string | null>(null)
  const message = shallowRef<string | null>(null)
  /** Provider id currently being linked / unlinked. `null` when idle. */
  const inFlight = shallowRef<string | null>(null)

  const accountsByProvider = computed(() => {
    const map = new Map<string, LinkedAccountRow>()
    for (const account of linkedAccounts.value)
      map.set(account.providerId, account)
    return map
  })

  const hasCredentialAccount = computed(() => accountsByProvider.value.has('credential'))
  const socialLinkedCount = computed(
    () => linkedAccounts.value.filter(a => a.providerId !== 'credential').length,
  )

  /**
   * Returns true when unlinking `providerId` would leave the user with no
   * remaining sign-in method.
   *
   * Keeping the guard client-side (in addition to better-auth's server-side
   * `FAILED_TO_UNLINK_LAST_ACCOUNT`) lets us show a friendlier message
   * without round-tripping a known-bad request.
   */
  function isLastSignInMethod(providerId: string): boolean {
    if (providerId === 'credential')
      return socialLinkedCount.value === 0
    return !hasCredentialAccount.value && socialLinkedCount.value <= 1
  }

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await args.client.listAccounts()
      if (apiError)
        throw new Error(apiError.message ?? 'listAccounts failed')
      if (!data) {
        linkedAccounts.value = []
        return
      }
      // NOTICE: better-auth's listAccounts widens each element to `any` in
      // v1.6.6 — we read fields directly without re-typing inline (see
      // `## TS/JS 反模式` in the global CLAUDE.md: don't dress up `any`
      // as a fake structural type).
      linkedAccounts.value = data.map(account => ({
        id: account.id,
        accountId: account.accountId,
        providerId: account.providerId,
        createdAt: account.createdAt instanceof Date
          ? account.createdAt.toISOString()
          : account.createdAt,
        scopes: account.scopes ?? [],
      }))
    }
    catch (err) {
      linkedAccounts.value = []
      error.value = args.describeError(err) || args.messages.listFailed
    }
    finally {
      loading.value = false
    }
  }

  async function unlink(providerId: string, providerName: string) {
    if (inFlight.value)
      return

    if (isLastSignInMethod(providerId)) {
      error.value = args.messages.lastAccount
      message.value = null
      return
    }

    inFlight.value = providerId
    error.value = null
    message.value = null

    try {
      const { error: apiError } = await args.client.unlinkAccount({ providerId })
      if (apiError)
        throw new Error(apiError.message ?? 'unlinkAccount failed')
      message.value = args.messages.unlinked(providerName)
      await refresh()
    }
    catch (err) {
      error.value = args.describeError(err) || args.messages.unlinkFailed
    }
    finally {
      inFlight.value = null
    }
  }

  async function link(providerId: LinkedProviderId, providerName: string) {
    if (inFlight.value)
      return

    inFlight.value = providerId
    error.value = null
    message.value = args.messages.linkStarted(providerName)

    try {
      const callbackURL = args.buildCallbackURL ? args.buildCallbackURL() : window.location.href
      const { data, error: apiError } = await args.client.linkSocial({
        provider: providerId,
        callbackURL,
      })
      if (apiError)
        throw new Error(apiError.message ?? 'linkSocial failed')
      if (data?.url) {
        window.location.assign(data.url)
        return
      }
      // No URL came back (e.g. provider returned success synchronously) —
      // refresh so the new row shows up without a navigation.
      await refresh()
    }
    catch (err) {
      error.value = args.describeError(err) || args.messages.linkFailed
      message.value = null
      inFlight.value = null
    }
  }

  // Auto-refresh: load on mount when already authed; react to sign-in /
  // sign-out so the list never shows stale rows.
  onMounted(() => {
    if (args.isAuthenticated.value)
      refresh()
  })

  watch(args.isAuthenticated, (next) => {
    if (next)
      refresh()
    else
      linkedAccounts.value = []
  })

  return {
    linkedAccounts,
    loading,
    error,
    message,
    inFlight,
    accountsByProvider,
    hasCredentialAccount,
    socialLinkedCount,
    isLastSignInMethod,
    refresh,
    unlink,
    link,
  }
}
