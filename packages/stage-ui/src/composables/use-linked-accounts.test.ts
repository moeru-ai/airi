import type { RawLinkedAccountsClient } from './use-linked-accounts'

import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { useLinkedAccounts, withSteamLinking } from './use-linked-accounts'

// NOTICE:
// `RawLinkedAccountsClient['$fetch']` is a generic function type
// (`<T>(path, options) => Promise<{ data: T | null, ... }>`), and `vi.fn(...)`
// widens a generic implementation's return type to `unknown` instead of
// preserving the per-call `T` — see vitest/tinyspy's `Mock<T>` wrapping,
// which infers from the concrete call signature, not a generic one. A test
// double for a genuinely generic method isn't practical to type exactly, so
// `overrides.$fetch` (when supplied) is cast at the call site instead.
// Removal condition: vitest ships a `Mock` type that preserves generics.
function fakeRawClient(overrides: Partial<RawLinkedAccountsClient>): RawLinkedAccountsClient {
  return {
    listAccounts: vi.fn(async () => ({ data: [], error: null })),
    unlinkAccount: vi.fn(async () => ({ data: null, error: null })),
    linkSocial: vi.fn(async () => ({ data: null, error: null })),
    $fetch: vi.fn(async () => ({ data: null, error: null })) as unknown as RawLinkedAccountsClient['$fetch'],
    ...overrides,
  }
}

describe('useLinkedAccounts', () => {
  it('passes the profile page URL as the OAuth link error callback URL', async () => {
    const linkSocial = vi.fn(async () => ({
      data: { status: true, redirect: false },
      error: null,
    }))

    const holder: {
      linkedAccounts?: ReturnType<typeof useLinkedAccounts>
    } = {}
    const app = createSSRApp({
      setup() {
        holder.linkedAccounts = useLinkedAccounts({
          client: {
            listAccounts: vi.fn(async () => ({ data: [], error: null })),
            unlinkAccount: vi.fn(async () => ({ data: null, error: null })),
            linkSocial,
          },
          isAuthenticated: ref(false),
          describeError: () => '',
          buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
          messages: {
            listFailed: 'list failed',
            unlinkFailed: 'unlink failed',
            linkFailed: 'link failed',
            lastAccount: 'last account',
            unlinked: provider => `${provider} unlinked`,
            linkStarted: provider => `${provider} link started`,
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

    const holder: {
      linkedAccounts?: ReturnType<typeof useLinkedAccounts>
    } = {}
    const app = createSSRApp({
      setup() {
        holder.linkedAccounts = useLinkedAccounts({
          client: {
            // Two rows so `isLastSignInMethod` doesn't veto the unlink.
            listAccounts: vi.fn(async () => ({
              data: [
                { id: '1', accountId: 'a-1', providerId: 'github', createdAt: '2026-01-01T00:00:00Z', scopes: [] },
                { id: '2', accountId: 'a-2', providerId: 'credential', createdAt: '2026-01-01T00:00:00Z', scopes: [] },
              ],
              error: null,
            })),
            unlinkAccount,
            linkSocial,
          },
          isAuthenticated: ref(false),
          describeError: () => 'boom',
          buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
          messages: {
            listFailed: 'list failed',
            unlinkFailed: 'unlink failed',
            linkFailed: 'link failed',
            lastAccount: 'last account',
            unlinked: provider => `${provider} unlinked`,
            linkStarted: provider => `${provider} link started`,
          },
          onUnlinked,
          onLinkStarted,
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

describe('withSteamLinking', () => {
  it('passes listAccounts and unlinkAccount straight through', async () => {
    const listAccounts = vi.fn(async () => ({ data: [], error: null }))
    const unlinkAccount = vi.fn(async () => ({ data: { status: true }, error: null }))

    const wrapped = withSteamLinking(fakeRawClient({ listAccounts, unlinkAccount }))
    await wrapped.listAccounts()
    await wrapped.unlinkAccount({ providerId: 'steam' })

    expect(listAccounts).toHaveBeenCalledTimes(1)
    expect(unlinkAccount).toHaveBeenCalledWith({ providerId: 'steam' })
  })

  it('routes google/github linking through the real linkSocial endpoint', async () => {
    const linkSocial = vi.fn(async () => ({ data: { url: 'https://accounts.google.com/o/oauth2/auth' }, error: null }))

    const wrapped = withSteamLinking(fakeRawClient({ linkSocial }))
    await wrapped.linkSocial({ provider: 'google', callbackURL: '/profile' })

    expect(linkSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/profile' })
  })

  // Steam is OpenID 2.0, not OAuth2 — better-auth's `/link-social` validates
  // `provider` against a `SocialProviderListEnum` and would reject 'steam'
  // before ever reaching a plugin (better-auth/dist/api/routes/account.mjs).
  // The wrapper must divert Steam linking to the plugin's own `/link/steam`
  // endpoint via `$fetch` instead of calling the client's `linkSocial`.
  it('routes Steam linking through $fetch(\'/link/steam\') instead of linkSocial', async () => {
    const linkSocial = vi.fn()
    const $fetch = vi.fn(async () => ({
      data: { url: 'https://steamcommunity.com/openid/login?...', redirect: true },
      error: null,
    })) as unknown as RawLinkedAccountsClient['$fetch']

    const wrapped = withSteamLinking(fakeRawClient({ linkSocial, $fetch }))
    const result = await wrapped.linkSocial({ provider: 'steam', callbackURL: '/profile', errorCallbackURL: '/profile?error=steam' })

    expect(linkSocial).not.toHaveBeenCalled()
    expect($fetch).toHaveBeenCalledWith('/link/steam', {
      method: 'POST',
      body: { callbackURL: '/profile', errorCallbackURL: '/profile?error=steam' },
    })
    expect(result.data?.url).toBe('https://steamcommunity.com/openid/login?...')
  })
})
