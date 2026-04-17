import type { Account } from 'better-auth'

import { setActivePinia } from 'pinia'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAccounts = vi.fn()
const unlinkAccount = vi.fn()

vi.mock('../libs/auth', () => ({
  authClient: {
    listAccounts,
    unlinkAccount,
    updateUser: vi.fn(),
    linkSocial: vi.fn(),
    changePassword: vi.fn(),
    requestPasswordReset: vi.fn(),
    changeEmail: vi.fn(),
    sendVerificationEmail: vi.fn(),
  },
  fetchSession: vi.fn(),
  getAuthToken: vi.fn(() => 'token'),
  signOut: vi.fn(),
}))

vi.mock('../libs/server', () => ({
  SERVER_URL: 'http://localhost:3000',
}))

const { useAccountManagement } = await import('./use-account-management')
const { resetAccountManagementState } = await import('./use-account-management-state')

/**
 * Build a minimal Better-Auth `Account` shape for tests.
 *
 * Use when:
 * - Seeding `accounts.value` for unlink/link checks
 *
 * Returns:
 * - A loose `Account` good enough for `providerId`-only assertions
 *
 * @example fakeAccount('google') // → { providerId: 'google', ... }
 */
function fakeAccount(providerId: string): Account {
  return {
    id: `acct-${providerId}`,
    providerId,
    accountId: `external-${providerId}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Account
}

describe('useAccountManagement.unlinkProvider', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listAccounts.mockReset()
    unlinkAccount.mockReset()
  })

  afterEach(() => {
    // NOTICE:
    // The composable holds module-scoped shared refs (sharedAccounts) so the
    // state survives across tests in the same Vitest worker. Reset by
    // assigning a fresh empty list before each scenario.
    const { accounts } = useAccountManagement()
    accounts.value = []
  })

  it('Issue #1674: allows unlinking google when github is still linked, even with no password', async () => {
    // ROOT CAUSE:
    //
    // Old logic gated unlink on `hasCredential` (password) only. A user
    // with two social providers and no password could never unlink either
    // — the prompt told them to "set a password" first, even though the
    // other social provider would still keep them logged in.
    //
    // We fixed this by checking whether ANY login method survives the
    // unlink, not just whether a password exists.
    //
    // Reference: PR #1674 review comment by Rainbowbird.
    const { accounts, unlinkProvider } = useAccountManagement()
    accounts.value = [fakeAccount('google'), fakeAccount('github')]

    listAccounts.mockResolvedValue({ data: [fakeAccount('github')], error: null })
    unlinkAccount.mockResolvedValue({ data: null, error: null })

    const result = await unlinkProvider('google')

    expect(result).toEqual({ needsPassword: false })
    expect(unlinkAccount).toHaveBeenCalledWith({ providerId: 'google' })
  })

  it('blocks unlinking the only login method (single social, no password)', async () => {
    const { accounts, unlinkProvider } = useAccountManagement()
    accounts.value = [fakeAccount('google')]

    const result = await unlinkProvider('google')

    expect(result).toEqual({ needsPassword: true })
    expect(unlinkAccount).not.toHaveBeenCalled()
  })

  it('allows unlinking a social provider when password credential remains', async () => {
    const { accounts, unlinkProvider } = useAccountManagement()
    accounts.value = [fakeAccount('credential'), fakeAccount('google')]

    listAccounts.mockResolvedValue({ data: [fakeAccount('credential')], error: null })
    unlinkAccount.mockResolvedValue({ data: null, error: null })

    const result = await unlinkProvider('google')

    expect(result).toEqual({ needsPassword: false })
    expect(unlinkAccount).toHaveBeenCalledWith({ providerId: 'google' })
  })

  it('blocks unlinking the password when no other provider is linked', async () => {
    const { accounts, unlinkProvider } = useAccountManagement()
    accounts.value = [fakeAccount('credential')]

    const result = await unlinkProvider('credential')

    expect(result).toEqual({ needsPassword: true })
    expect(unlinkAccount).not.toHaveBeenCalled()
  })
})

describe('resetAccountManagementState', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('Issue #1674: clears module-scoped accounts/loading/error so a new sign-in starts clean', () => {
    // ROOT CAUSE:
    //
    // sharedAccounts/sharedLoading/sharedError live at module scope so all
    // consumers of `useAccountManagement` see the same list. Without an
    // explicit reset, those refs survived sign-out and account switches —
    // the next user briefly saw the previous user's linked providers and
    // password state in the settings UI.
    //
    // We fixed this by exposing `resetAccountManagementState` and calling
    // it from the auth layer on sign-out and on user-id changes.
    //
    // Reference: PR #1674 review comment by Rainbowbird.
    const { accounts, loading, error } = useAccountManagement()
    accounts.value = [fakeAccount('google'), fakeAccount('github')]
    loading.value = true
    error.value = 'previous-failure'

    resetAccountManagementState()

    expect(accounts.value).toEqual([])
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
  })
})
