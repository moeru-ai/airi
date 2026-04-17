import type { Account } from 'better-auth'

import { errorMessageFrom } from '@moeru/std'
import { computed, ref } from 'vue'

import { authClient, fetchSession, getAuthToken, signOut } from '../libs/auth'
import { SERVER_URL } from '../libs/server'
import { useAuthStore } from '../stores/auth'

export type { Account }

/**
 * Wraps an async operation with unified loading/error state management.
 *
 * Use when:
 * - Any account management operation needs consistent loading + error tracking.
 *
 * Expects:
 * - `loading` and `error` refs in scope (closed over).
 *
 * Returns:
 * - The result of `fn()`, re-throwing on failure after setting `error.value`.
 */
function createWithLoading(loading: ReturnType<typeof ref<boolean>>, error: ReturnType<typeof ref<string | null>>) {
  return async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
    loading.value = true
    error.value = null
    try {
      return await fn()
    }
    catch (err) {
      error.value = errorMessageFrom(err) ?? 'Unknown error'
      throw err
    }
    finally {
      loading.value = false
    }
  }
}

/**
 * Composable for managing the current user's account settings.
 *
 * Use when:
 * - Building account settings UI (profile, avatar, linked providers, password, email, delete account).
 * - Any component needs to read or mutate user account data through Better Auth + custom API endpoints.
 *
 * Expects:
 * - User is authenticated (auth store has a valid session).
 * - `authClient`, `fetchSession`, `signOut` are set up via `packages/stage-ui/src/libs/auth.ts`.
 *
 * Returns:
 * - Reactive state: `loading`, `error`, `accounts`, `hasCredential`, `hasGoogle`, `hasGitHub`.
 * - Mutation methods for profile, avatar, linked providers, password, email, and account deletion.
 *
 * Call stack:
 *
 * useAccountManagement
 *   -> {@link loadAccounts} (authClient.listAccounts)
 *   -> {@link updateProfile} (authClient.updateUser → fetchSession)
 *   -> {@link uploadAvatar} (fetch POST /api/v1/user/avatar → fetchSession)
 *   -> {@link removeAvatar} (fetch DELETE /api/v1/user/avatar → fetchSession)
 *   -> {@link linkProvider} (authClient.linkSocial)
 *   -> {@link unlinkProvider} (authClient.unlinkAccount → loadAccounts)
 *   -> {@link changePassword} (authClient.changePassword)
 *   -> {@link requestPasswordReset} (authClient.requestPasswordReset)
 *   -> {@link changeEmail} (authClient.changeEmail)
 *   -> {@link deleteAccount} (fetch POST /api/v1/user/delete → signOut)
 */
// NOTICE:
// These refs are hoisted to module scope so every component that calls
// `useAccountManagement()` shares the same reactive state. Previously each
// call created its own `accounts` ref, which meant only the component that
// actually called `loadAccounts()` (linked-accounts-section) saw the list —
// `password-section` kept `hasCredential = false` forever and always rendered
// "Set Password" even after a password had been set.
const sharedLoading = ref(false)
const sharedError = ref<string | null>(null)
const sharedAccounts = ref<Account[]>([])

export function useAccountManagement() {
  const loading = sharedLoading
  const error = sharedError
  const accounts = sharedAccounts

  const withLoading = createWithLoading(loading, error)

  const hasCredential = computed(() => accounts.value.some(a => a.providerId === 'credential'))
  const hasGoogle = computed(() => accounts.value.some(a => a.providerId === 'google'))
  const hasGitHub = computed(() => accounts.value.some(a => a.providerId === 'github'))

  /**
   * Load all linked accounts for the current user.
   * Updates `accounts` reactive ref on success.
   */
  async function loadAccounts(): Promise<void> {
    await withLoading(async () => {
      const { data, error: err } = await authClient.listAccounts()
      if (err) {
        throw new Error(err.message ?? 'Failed to list accounts')
      }
      accounts.value = (data ?? []) as Account[]
    })
  }

  /**
   * Update the user's profile fields (name, image, etc.).
   * Refreshes the auth store session after update.
   */
  async function updateProfile(data: { name?: string, image?: string }): Promise<void> {
    await withLoading(async () => {
      const { error: err } = await authClient.updateUser(data)
      if (err) {
        throw new Error(err.message ?? 'Failed to update profile')
      }
      await fetchSession()
    })
  }

  /**
   * Upload a new avatar image for the current user.
   * POSTs FormData to `/api/v1/user/avatar` with Bearer token auth.
   * Refreshes the auth store session after upload.
   *
   * Returns:
   * - The new avatar URL string.
   */
  async function uploadAvatar(file: File): Promise<string> {
    return withLoading(async () => {
      const formData = new FormData()
      formData.append('file', file)

      const token = getAuthToken()
      const headers: HeadersInit = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const res = await fetch(`${SERVER_URL}/api/v1/user/avatar`, {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'omit',
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`Avatar upload failed: ${text}`)
      }

      const json = await res.json() as { url: string }
      await fetchSession()
      return json.url
    })
  }

  /**
   * Remove the current user's avatar.
   * DELETEs `/api/v1/user/avatar` and refreshes the auth store session.
   */
  async function removeAvatar(): Promise<void> {
    await withLoading(async () => {
      const token = getAuthToken()
      const headers: HeadersInit = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const res = await fetch(`${SERVER_URL}/api/v1/user/avatar`, {
        method: 'DELETE',
        headers,
        credentials: 'omit',
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`Avatar removal failed: ${text}`)
      }

      await fetchSession()
    })
  }

  /**
   * Initiate OAuth provider linking for the current user.
   * Redirects to OAuth flow; returns to `window.location.href` after completion.
   */
  async function linkProvider(provider: 'google' | 'github'): Promise<void> {
    await withLoading(async () => {
      const { error: err } = await authClient.linkSocial({
        provider,
        callbackURL: window.location.href,
      })
      if (err) {
        throw new Error(err.message ?? `Failed to link ${provider}`)
      }
    })
  }

  /**
   * Unlink a social/OAuth provider from the current user.
   *
   * Use when:
   * - The user clicks "Unlink" on a connected provider in account settings.
   *
   * Expects:
   * - `accounts` has been loaded (via {@link loadAccounts}); otherwise the
   *   safety check below is degenerate.
   *
   * Returns:
   * - `{ needsPassword: true }` if removing this provider would leave the
   *   user with NO remaining login method (no other social provider AND no
   *   password credential). The caller is expected to prompt them to set a
   *   password (or link another provider) first.
   * - `{ needsPassword: false }` if unlink succeeded — at least one other
   *   login method remains.
   *
   * ROOT CAUSE:
   *
   * The previous check was `if (!hasCredential) return { needsPassword: true }`,
   * which only looked for the password (`credential`) provider. A user with
   * Google + GitHub linked but no password could never unlink either one
   * because the gate insisted they "set a password" first — even though
   * removing one social provider would still leave the other as a working
   * login method.
   *
   * The fix: check whether ANY login method survives after this unlink, not
   * just whether a password exists. We require at least one remaining
   * provider in the account list (could be `credential`, another social
   * provider, etc.).
   */
  async function unlinkProvider(providerId: string): Promise<{ needsPassword: boolean }> {
    const remaining = accounts.value.filter(a => a.providerId !== providerId)
    if (remaining.length === 0) {
      return { needsPassword: true }
    }

    await withLoading(async () => {
      const { error: err } = await authClient.unlinkAccount({ providerId })
      if (err) {
        throw new Error(err.message ?? 'Failed to unlink provider')
      }
      await loadAccounts()
    })

    return { needsPassword: false }
  }

  /**
   * Change the current user's password.
   * Requires the existing password for verification.
   */
  async function changePassword(current: string, newPwd: string): Promise<void> {
    await withLoading(async () => {
      const { error: err } = await authClient.changePassword({
        currentPassword: current,
        newPassword: newPwd,
        revokeOtherSessions: false,
      })
      if (err) {
        throw new Error(err.message ?? 'Failed to change password')
      }
    })
  }

  /**
   * Send a password reset email to the current user's email address.
   * Useful for OAuth-only users who want to set a password.
   */
  async function requestPasswordReset(): Promise<void> {
    const authStore = useAuthStore()
    const email = authStore.user?.email

    await withLoading(async () => {
      if (!email) {
        throw new Error('No email address found for current user')
      }

      const { error: err } = await authClient.requestPasswordReset({
        email,
      })
      if (err) {
        throw new Error(err.message ?? 'Failed to request password reset')
      }
    })
  }

  /**
   * Initiate an email change for the current user.
   * Better Auth sends a verification email; user must confirm via link.
   */
  async function changeEmail(newEmail: string): Promise<void> {
    await withLoading(async () => {
      const { error: err } = await authClient.changeEmail({
        newEmail,
      })
      if (err) {
        throw new Error(err.message ?? 'Failed to change email')
      }
    })
  }

  /**
   * Soft-delete the current user account via custom endpoint.
   * POSTs to `/api/v1/user/delete`, then calls `signOut()` to clear local state.
   *
   * NOTICE: We do NOT use `authClient.deleteUser()` here — that is a hard-delete.
   * The custom endpoint at `/api/v1/user/delete` sets `deletedAt` and revokes sessions
   * without permanently destroying the record.
   * See: decisions.md — Soft Delete Strategy
   */
  async function deleteAccount(): Promise<void> {
    await withLoading(async () => {
      const token = getAuthToken()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const res = await fetch(`${SERVER_URL}/api/v1/user/delete`, {
        method: 'POST',
        headers,
        credentials: 'omit',
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`Account deletion failed: ${text}`)
      }

      await signOut()
    })
  }

  /**
   * Resend verification email to the current user's email address.
   */
  async function sendVerificationEmail(): Promise<void> {
    const authStore = useAuthStore()
    const email = authStore.user?.email

    await withLoading(async () => {
      if (!email) {
        throw new Error('No email address found for current user')
      }

      const { error: err } = await authClient.sendVerificationEmail({
        email,
        callbackURL: '/auth/verify-email',
      })
      if (err) {
        throw new Error(err.message ?? 'Failed to send verification email')
      }
    })
  }

  return {
    loading,
    error,
    accounts,
    hasCredential,
    hasGoogle,
    hasGitHub,
    loadAccounts,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    linkProvider,
    unlinkProvider,
    changePassword,
    requestPasswordReset,
    changeEmail,
    deleteAccount,
    sendVerificationEmail,
  }
}
