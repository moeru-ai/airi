import type { RawAuthClient } from './auth-client'

import { describe, expect, it, vi } from 'vitest'

import { toLinkedAccountsClient } from './auth-client'

// NOTICE:
// `RawAuthClient` methods carry better-auth's generated `BetterFetchResponse`
// return types, whose exact shape depends on each endpoint's zod schema and
// isn't practical to replicate by hand in a plain mock. We only exercise the
// `{ data, error }` shape `toLinkedAccountsClient` actually reads, so an
// `as unknown as RawAuthClient` cast on each test double is safe here.
// Removal condition: better-auth exposes a narrower testing-only client type.
function fakeRawAuthClient(overrides: Partial<Record<keyof RawAuthClient, unknown>>): RawAuthClient {
  return {
    listAccounts: vi.fn(),
    unlinkAccount: vi.fn(),
    linkSocial: vi.fn(),
    $fetch: vi.fn(),
    ...overrides,
  } as unknown as RawAuthClient
}

describe('toLinkedAccountsClient', () => {
  it('passes listAccounts and unlinkAccount straight through', async () => {
    const listAccounts = vi.fn(async () => ({ data: [], error: null }))
    const unlinkAccount = vi.fn(async () => ({ data: { status: true }, error: null }))

    const wrapped = toLinkedAccountsClient(fakeRawAuthClient({ listAccounts, unlinkAccount }))
    await wrapped.listAccounts()
    await wrapped.unlinkAccount({ providerId: 'steam' })

    expect(listAccounts).toHaveBeenCalledTimes(1)
    expect(unlinkAccount).toHaveBeenCalledWith({ providerId: 'steam' })
  })

  it('routes google/github linking through the real linkSocial endpoint', async () => {
    const linkSocial = vi.fn(async () => ({ data: { url: 'https://accounts.google.com/o/oauth2/auth' }, error: null }))

    const wrapped = toLinkedAccountsClient(fakeRawAuthClient({ linkSocial }))
    await wrapped.linkSocial({ provider: 'google', callbackURL: '/profile' })

    expect(linkSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/profile' })
  })

  // Steam is OpenID 2.0, not OAuth2 — better-auth's `/link-social` validates
  // `provider` against a `SocialProviderListEnum` and would reject 'steam'
  // before ever reaching a plugin (account.mjs L71). The wrapper must divert
  // Steam linking to the plugin's own `/link/steam` endpoint via `$fetch`
  // instead of calling the client's `linkSocial`.
  it('routes Steam linking through $fetch(\'/link/steam\') instead of linkSocial', async () => {
    const linkSocial = vi.fn()
    const $fetch = vi.fn(async () => ({ data: { url: 'https://steamcommunity.com/openid/login?...', redirect: true }, error: null }))

    const wrapped = toLinkedAccountsClient(fakeRawAuthClient({ linkSocial, $fetch }))
    const result = await wrapped.linkSocial({ provider: 'steam', callbackURL: '/profile', errorCallbackURL: '/profile?error=steam' })

    expect(linkSocial).not.toHaveBeenCalled()
    expect($fetch).toHaveBeenCalledWith('/link/steam', {
      method: 'POST',
      body: { callbackURL: '/profile', errorCallbackURL: '/profile?error=steam' },
    })
    expect(result.data?.url).toBe('https://steamcommunity.com/openid/login?...')
  })
})
