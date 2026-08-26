import type { LinkedAccountsClient } from './use-linked-accounts'

import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { useLinkedAccounts } from './use-linked-accounts'

function fakeLinkedAccountsClient(overrides: Partial<LinkedAccountsClient> = {}): LinkedAccountsClient {
  return {
    linkSocial: vi.fn(async () => ({ data: null, error: null })),
    linkSteam: vi.fn(async () => ({ data: null, error: null })),
    listAccounts: vi.fn(async () => ({ data: [], error: null })),
    unlinkAccount: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  }
}

describe('useLinkedAccounts', () => {
  it('passes the profile page URL as the OAuth link error callback URL', async () => {
    const linkSocial = vi.fn(async () => ({
      data: { redirect: false, status: true },
      error: null,
    }))

    const holder: {
      linkedAccounts?: ReturnType<typeof useLinkedAccounts>
    } = {}
    const app = createSSRApp({
      setup() {
        holder.linkedAccounts = useLinkedAccounts({
          buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
          client: {
            linkSocial,
            linkSteam: vi.fn(async () => ({ data: null, error: null })),
            listAccounts: vi.fn(async () => ({ data: [], error: null })),
            unlinkAccount: vi.fn(async () => ({ data: null, error: null })),
          },
          describeError: () => '',
          isAuthenticated: ref(false),
          messages: {
            lastAccount: 'last account',
            linkFailed: 'link failed',
            linkStarted: provider => `${provider} link started`,
            listFailed: 'list failed',
            unlinked: provider => `${provider} unlinked`,
            unlinkFailed: 'unlink failed',
          },
        })

        return () => null
      },
    })

    await renderToString(app)

    if (!holder.linkedAccounts)
      throw new Error('Expected linked accounts composable to initialize')

    await holder.linkedAccounts.link('github', 'GitHub')

    expect(linkSocial).toHaveBeenCalledWith({
      callbackURL: 'https://accounts.airi.build/ui/profile',
      errorCallbackURL: 'https://accounts.airi.build/ui/profile',
      provider: 'github',
    })
  })

  it('fires analytics hooks on unlink success and link handoff, but not on failure', async () => {
    const onUnlinked = vi.fn()
    const onLinkStarted = vi.fn()
    const unlinkAccount = vi.fn(async (): Promise<{ data: unknown, error: null | { message?: string } }> => ({ data: null, error: null }))
    const linkSocial = vi.fn(async (): Promise<{ data: null | { redirect?: boolean, status?: boolean, url?: string }, error: null | { message?: string } }> => ({
      data: { redirect: false, status: true },
      error: null,
    }))

    const holder: {
      linkedAccounts?: ReturnType<typeof useLinkedAccounts>
    } = {}
    const app = createSSRApp({
      setup() {
        holder.linkedAccounts = useLinkedAccounts({
          buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
          client: {
            linkSocial,
            linkSteam: vi.fn(async () => ({ data: null, error: null })),
            // Two rows so `isLastSignInMethod` doesn't veto the unlink.
            listAccounts: vi.fn(async () => ({
              data: [
                { accountId: 'a-1', createdAt: '2026-01-01T00:00:00Z', id: '1', providerId: 'github', scopes: [] },
                { accountId: 'a-2', createdAt: '2026-01-01T00:00:00Z', id: '2', providerId: 'credential', scopes: [] },
              ],
              error: null,
            })),
            unlinkAccount,
          },
          describeError: () => 'boom',
          isAuthenticated: ref(false),
          messages: {
            lastAccount: 'last account',
            linkFailed: 'link failed',
            linkStarted: provider => `${provider} link started`,
            listFailed: 'list failed',
            unlinked: provider => `${provider} unlinked`,
            unlinkFailed: 'unlink failed',
          },
          onLinkStarted,
          onUnlinked,
        })

        return () => null
      },
    })

    await renderToString(app)

    if (!holder.linkedAccounts)
      throw new Error('Expected linked accounts composable to initialize')

    await holder.linkedAccounts.refresh()
    await holder.linkedAccounts.unlink('github', 'GitHub')
    expect(onUnlinked).toHaveBeenCalledTimes(1)
    expect(onUnlinked).toHaveBeenCalledWith('github')

    await holder.linkedAccounts.link('google', 'Google')
    expect(onLinkStarted).toHaveBeenCalledTimes(1)
    expect(onLinkStarted).toHaveBeenCalledWith('google')

    // Failure paths must not fire the hooks — a failed unlink is not an
    // unlink, and a failed handoff never reached the provider.
    unlinkAccount.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    await holder.linkedAccounts.unlink('github', 'GitHub')
    expect(onUnlinked).toHaveBeenCalledTimes(1)

    linkSocial.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    await holder.linkedAccounts.link('google', 'Google')
    expect(onLinkStarted).toHaveBeenCalledTimes(1)
  })
})

describe('useLinkedAccounts link dispatch', () => {
  // Steam is OpenID 2.0, not OAuth2 — the composable must call the client's
  // dedicated `linkSteam` (backed by `/link/steam`) instead of `linkSocial`
  // (backed by `/link-social`, which only resolves OAuth2 providers).
  it('routes Steam links through linkSteam and other providers through linkSocial', async () => {
    const linkSocial = vi.fn(async () => ({
      data: { redirect: false, status: true },
      error: null,
    }))
    const linkSteam = vi.fn(async () => ({
      data: { redirect: false, status: true },
      error: null,
    }))

    // Separate composable instances: a successful link without a redirect
    // URL leaves `inFlight` set (the row refreshes in place), so a second
    // link call on the same instance would be a no-op.
    const steamHolder = await mountLinkedAccounts(fakeLinkedAccountsClient({ linkSteam }))
    await steamHolder.link('steam', 'Steam')
    expect(linkSteam).toHaveBeenCalledTimes(1)
    expect(linkSteam).toHaveBeenCalledWith({
      callbackURL: 'https://accounts.airi.build/ui/profile',
      errorCallbackURL: 'https://accounts.airi.build/ui/profile',
    })
    expect(linkSocial).not.toHaveBeenCalled()

    const socialHolder = await mountLinkedAccounts(fakeLinkedAccountsClient({ linkSocial }))
    await socialHolder.link('google', 'Google')
    expect(linkSocial).toHaveBeenCalledTimes(1)
    expect(linkSocial).toHaveBeenCalledWith({
      callbackURL: 'https://accounts.airi.build/ui/profile',
      errorCallbackURL: 'https://accounts.airi.build/ui/profile',
      provider: 'google',
    })
    expect(linkSteam).toHaveBeenCalledTimes(1)
  })
})

async function mountLinkedAccounts(client: LinkedAccountsClient) {
  const holder: {
    linkedAccounts?: ReturnType<typeof useLinkedAccounts>
  } = {}
  const app = createSSRApp({
    setup() {
      holder.linkedAccounts = useLinkedAccounts({
        buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
        client,
        describeError: () => '',
        isAuthenticated: ref(false),
        messages: {
          lastAccount: 'last account',
          linkFailed: 'link failed',
          linkStarted: provider => `${provider} link started`,
          listFailed: 'list failed',
          unlinked: provider => `${provider} unlinked`,
          unlinkFailed: 'unlink failed',
        },
      })

      return () => null
    },
  })

  await renderToString(app)
  if (!holder.linkedAccounts)
    throw new Error('Expected linked accounts composable to initialize')
  return holder.linkedAccounts
}
