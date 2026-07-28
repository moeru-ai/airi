import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { useLinkedAccounts } from './use-linked-accounts'

const defaultMessages = {
  listFailed: 'list failed',
  unlinkFailed: 'unlink failed',
  linkFailed: 'link failed',
  lastAccount: 'last account',
  unlinked: (provider: string) => `${provider} unlinked`,
  linkStarted: (provider: string) => `${provider} link started`,
}

interface AccountRow {
  id: string
  accountId: string
  providerId: string
  createdAt: string
  scopes: string[]
}

async function mountLinkedAccounts(options: {
  accounts: AccountRow[]
  unlinkAccount?: ReturnType<typeof vi.fn>
  linkSocial?: ReturnType<typeof vi.fn>
  describeError?: () => string
  buildCallbackURL?: () => string
  onUnlinked?: ReturnType<typeof vi.fn>
  onLinkStarted?: ReturnType<typeof vi.fn>
}) {
  const unlinkAccount = options.unlinkAccount ?? vi.fn(async () => ({ data: null, error: null }))
  const linkSocial = options.linkSocial ?? vi.fn(async () => ({ data: null, error: null }))
  const holder: { linkedAccounts?: ReturnType<typeof useLinkedAccounts> } = {}

  const app = createSSRApp({
    setup() {
      holder.linkedAccounts = useLinkedAccounts({
        client: {
          listAccounts: vi.fn(async () => ({ data: options.accounts, error: null })),
          unlinkAccount,
          linkSocial,
        },
        isAuthenticated: ref(false),
        describeError: options.describeError ?? (() => ''),
        buildCallbackURL: options.buildCallbackURL,
        messages: defaultMessages,
        onUnlinked: options.onUnlinked,
        onLinkStarted: options.onLinkStarted,
      })
      return () => null
    },
  })

  await renderToString(app)

  if (!holder.linkedAccounts)
    throw new Error('Expected linked accounts composable to initialize')

  return { linkedAccounts: holder.linkedAccounts, unlinkAccount, linkSocial }
}

describe('useLinkedAccounts', () => {
  it('passes the profile page URL as the OAuth link error callback URL', async () => {
    const linkSocial = vi.fn(async () => ({
      data: { status: true, redirect: false },
      error: null,
    }))

    const { linkedAccounts } = await mountLinkedAccounts({
      accounts: [],
      linkSocial,
      buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
    })

    await linkedAccounts.link('github', 'GitHub')

    expect(linkSocial).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: 'https://accounts.airi.build/ui/profile',
      errorCallbackURL: 'https://accounts.airi.build/ui/profile',
    })
  })

  it('fires analytics hooks on unlink success and link handoff, but not on failure', async () => {
    const onUnlinked = vi.fn()
    const onLinkStarted = vi.fn()
    const unlinkAccount = vi.fn(async (): Promise<{ data: unknown, error: { message?: string } | null }> => ({ data: null, error: null }))
    const linkSocial = vi.fn(async (): Promise<{ data: { url?: string, redirect?: boolean, status?: boolean } | null, error: { message?: string } | null }> => ({
      data: { status: true, redirect: false },
      error: null,
    }))

    const { linkedAccounts } = await mountLinkedAccounts({
      // Two rows so `isLastSignInMethod` doesn't veto the unlink.
      accounts: [
        { id: '1', accountId: 'a-1', providerId: 'github', createdAt: '2026-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a-2', providerId: 'credential', createdAt: '2026-01-01T00:00:00Z', scopes: [] },
      ],
      unlinkAccount,
      linkSocial,
      describeError: () => 'boom',
      buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
      onUnlinked,
      onLinkStarted,
    })

    await linkedAccounts.refresh()
    await linkedAccounts.unlink('github', 'GitHub')
    expect(onUnlinked).toHaveBeenCalledTimes(1)
    expect(onUnlinked).toHaveBeenCalledWith('github')

    await linkedAccounts.link('google', 'Google')
    expect(onLinkStarted).toHaveBeenCalledTimes(1)
    expect(onLinkStarted).toHaveBeenCalledWith('google')

    unlinkAccount.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    await linkedAccounts.unlink('github', 'GitHub')
    expect(onUnlinked).toHaveBeenCalledTimes(1)

    linkSocial.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    await linkedAccounts.link('google', 'Google')
    expect(onLinkStarted).toHaveBeenCalledTimes(1)
  })

  it('treats a linked Steam account as another sign-in method for last-account unlink', async () => {
    const { linkedAccounts, unlinkAccount } = await mountLinkedAccounts({
      accounts: [
        { id: '1', accountId: 'g-1', providerId: 'google', createdAt: '2026-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: '76561198000000000', providerId: 'steam', createdAt: '2026-01-02T00:00:00Z', scopes: [] },
      ],
    })

    await linkedAccounts.refresh()
    await linkedAccounts.unlink('google', 'Google')

    expect(unlinkAccount).toHaveBeenCalledTimes(1)
    expect(unlinkAccount).toHaveBeenCalledWith({ providerId: 'google' })
    expect(linkedAccounts.error.value).toBeNull()
  })

  it('blocks unlinking the only non-credential sign-in method when Steam is absent', async () => {
    const { linkedAccounts, unlinkAccount } = await mountLinkedAccounts({
      accounts: [
        { id: '1', accountId: 'g-1', providerId: 'google', createdAt: '2026-01-01T00:00:00Z', scopes: [] },
      ],
    })

    await linkedAccounts.refresh()
    await linkedAccounts.unlink('google', 'Google')

    expect(unlinkAccount).not.toHaveBeenCalled()
    expect(linkedAccounts.error.value).toBe('last account')
  })
})
