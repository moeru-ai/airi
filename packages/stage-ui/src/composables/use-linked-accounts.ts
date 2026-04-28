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
 * Minimum surface of better-auth's typed client the composable needs.
 * Structural so cookie-credentialed (ui-server-auth) and Bearer-only
 * (stage-web) clients both fit.
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
 * Already-translated strings the composable surfaces back to the UI;
 * keeps i18n implementation out of stage-ui.
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
  /** Drives auto-refresh on sign-in and clear on sign-out. */
  isAuthenticated: Ref<boolean>
  messages: LinkedAccountsMessages
  /** Caller-supplied error stringifier (e.g. `errorMessageFrom`). */
  describeError: (error: unknown) => string
  /**
   * OAuth post-consent return URL.
   * @default `() => window.location.href` — survives both web-history
   *          and hash-history routers without further configuration.
   */
  buildCallbackURL?: () => string
}

/**
 * Shared state + handlers for the "Connected accounts" section.
 * Two consumers (ui-server-auth profile, stage-web settings/account)
 * share all the logic but render the section differently, so this stops
 * at a composable rather than a shared component.
 */
export function useLinkedAccounts(args: UseLinkedAccountsArgs) {
  const linkedAccounts = shallowRef<LinkedAccountRow[]>([])
  const loading = shallowRef(true)
  /**
   * `true` after the first successful `listAccounts`. Survives transient
   * fetch errors so a momentary 5xx doesn't flip `hasCredentialAccount`
   * to false and mis-route credentialed users into the email-set-password
   * branch. Resets only on sign-out.
   * Source: PR #1753 review (chatgpt-codex-connector P2).
   */
  const loaded = shallowRef(false)
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
   * Client-side mirror of better-auth's `FAILED_TO_UNLINK_LAST_ACCOUNT`
   * guard so we can surface a user-friendly message before round-tripping.
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
      // better-auth 1.6.6 widens listAccounts elements to `any`; consume
      // the row directly rather than dressing `any` up with a fake shape.
      // Field layout: node_modules/better-auth/dist/api/routes/account.mjs L20-50.
      linkedAccounts.value = (data ?? []).map(account => ({
        id: account.id,
        accountId: account.accountId,
        providerId: account.providerId,
        createdAt: account.createdAt instanceof Date
          ? account.createdAt.toISOString()
          : account.createdAt,
        scopes: account.scopes ?? [],
      }))
      loaded.value = true
    }
    catch (err) {
      // Keep prior `linkedAccounts` on error so a transient 5xx doesn't
      // flip `hasCredentialAccount` and mis-route the password UI.
      // Source: PR #1753 review (chatgpt-codex-connector P2).
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
    if (next) {
      refresh()
    }
    else {
      // Don't leak previous user's accounts into the next session.
      linkedAccounts.value = []
      loaded.value = false
    }
  })

  return {
    linkedAccounts,
    loading,
    loaded,
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
