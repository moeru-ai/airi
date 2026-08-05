import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../mock-db'
import { steam } from './steam'

import * as schema from '../../schemas'

/** Test fixture: arbitrary valid-format SteamID64 used in fake OpenID callbacks. */
const STEAM_ID = '76561198012345678'

/**
 * Merges `Set-Cookie` headers from one or more responses into a single
 * `Cookie` header value, later sources overriding earlier ones by name.
 *
 * Tests call `auth.handler` directly with no shared cookie jar, so they
 * must forward cookies themselves; real browsers carry them automatically
 * across the Steam round trip since they're same-site.
 *
 * `Headers.get('set-cookie')` comma-joins repeated headers, which breaks on
 * cookies whose own attributes contain commas (e.g. `Expires=Thu, 01...`);
 * `getSetCookie()` returns each header value un-mangled. Merging by name
 * (not just concatenating) matters here because the callback response both
 * clears the spent `better-auth.state` cookie (empty value) and, on a later
 * `/link/steam` call, sets a *new* `better-auth.state` for the next round
 * trip — a naive concatenation would send both, and cookie-header parsers
 * are free to keep whichever duplicate they see first.
 */
function forwardableCookieHeader(...headerSources: Headers[]): string {
  const cookies = new Map<string, string>()
  for (const headers of headerSources) {
    for (const setCookie of headers.getSetCookie()) {
      const [nameValue] = setCookie.split(';')
      const [name, value] = nameValue.split('=')
      cookies.set(name, value)
    }
  }
  return Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
}

/** Builds a fake Steam OpenID `id_res` callback query, as if Steam redirected the browser here. */
function buildCallbackQuery(state: string, steamId = STEAM_ID): string {
  const params = new URLSearchParams({
    state,
    'openid.mode': 'id_res',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.return_to': 'http://localhost/api/auth/steam/callback',
    'openid.response_nonce': '2026-07-31T00:00:00Zxxxxx',
    'openid.assoc_handle': 'test-handle',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'test-signature',
  })
  return params.toString()
}

async function createTestAuth() {
  const db = await mockDB(schema)
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    secret: 'test-secret',
    baseURL: 'http://localhost',
    plugins: [steam()],
  })
}

describe('steam auth plugin', () => {
  let auth: Awaited<ReturnType<typeof createTestAuth>>

  beforeAll(async () => {
    auth = await createTestAuth()
  })

  afterEach(() => vi.unstubAllGlobals())

  // NOTICE:
  // We mock the module-global `fetch` for Steam's `check_authentication`
  // dumb-mode verification POST instead of hitting the real
  // steamcommunity.com endpoint, keeping this test hermetic and fast.
  // Root cause of picking dumb mode over signature verification: see the
  // plugin's own doc comment in ./steam.ts.
  function mockSteamVerification(isValid: boolean) {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (url.toString() === 'https://steamcommunity.com/openid/login') {
        return new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${isValid}`, { status: 200 })
      }
      throw new Error(`Unexpected fetch to ${url}`)
    }))
  }

  it('redirects to the Steam OpenID login URL on sign-in start', async () => {
    const response = await auth.api.signInSteam({
      body: { callbackURL: 'http://localhost/ui/profile' },
      returnHeaders: true,
    })

    const url = new URL(response.response.url)
    expect(url.origin + url.pathname).toBe('https://steamcommunity.com/openid/login')
    expect(url.searchParams.get('openid.mode')).toBe('checkid_setup')
    expect(url.searchParams.get('openid.realm')).toBe('http://localhost')
    expect(url.searchParams.get('openid.return_to')).toContain('/steam/callback?state=')
  })

  it('skips the automatic redirect when disableRedirect is set', async () => {
    const { response } = await auth.api.signInSteam({
      body: { callbackURL: 'http://localhost/ui/profile', disableRedirect: true },
      returnHeaders: true,
    })

    expect(response.redirect).toBe(false)
  })

  it('creates a user with a placeholder email on first sign-in and reuses the same account on later sign-ins', async () => {
    mockSteamVerification(true)
    const context = await auth.$context

    const { response: startResponse, headers: startHeaders } = await auth.api.signInSteam({
      body: { callbackURL: 'http://localhost/ui/profile' },
      returnHeaders: true,
    })
    const returnToState = new URL(new URL(startResponse.url).searchParams.get('openid.return_to')!).searchParams.get('state')!

    const callbackResponse = await auth.handler(
      new Request(`http://localhost/api/auth/steam/callback?${buildCallbackQuery(returnToState)}`, {
        headers: { cookie: forwardableCookieHeader(startHeaders) },
      }),
    )

    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get('location')).toBe('http://localhost/ui/profile')
    expect(callbackResponse.headers.get('set-cookie')).toMatch(/better-auth\.session_token=/)

    const account = await context.internalAdapter.findAccountByProviderId(STEAM_ID, 'steam')
    expect(account).not.toBeNull()
    const user = await context.internalAdapter.findUserById(account!.userId)
    expect(user?.email).toBe(`${STEAM_ID}@steam.placeholder.local`)
    expect(user?.emailVerified).toBe(true)

    const { response: secondStart, headers: secondStartHeaders } = await auth.api.signInSteam({
      body: { callbackURL: 'http://localhost/ui/profile' },
      returnHeaders: true,
    })
    const secondState = new URL(new URL(secondStart.url).searchParams.get('openid.return_to')!).searchParams.get('state')!

    await auth.handler(new Request(`http://localhost/api/auth/steam/callback?${buildCallbackQuery(secondState)}`, {
      headers: { cookie: forwardableCookieHeader(secondStartHeaders) },
    }))

    const accountAfterSecondSignIn = await context.internalAdapter.findAccountByProviderId(STEAM_ID, 'steam')
    expect(accountAfterSecondSignIn?.userId).toBe(account?.userId)
  })

  it('redirects to an error URL when Steam verification fails', async () => {
    mockSteamVerification(false)

    const { response: startResponse, headers: startHeaders } = await auth.api.signInSteam({
      body: { callbackURL: 'http://localhost/ui/profile' },
      returnHeaders: true,
    })
    const returnToState = new URL(new URL(startResponse.url).searchParams.get('openid.return_to')!).searchParams.get('state')!

    const otherSteamId = '76561198099999999'
    const callbackResponse = await auth.handler(
      new Request(`http://localhost/api/auth/steam/callback?${buildCallbackQuery(returnToState, otherSteamId)}`, {
        headers: { cookie: forwardableCookieHeader(startHeaders) },
      }),
    )

    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get('location')).toContain('error=steam_openid_verification_failed')
  })

  it('links a second Steam account to the already-signed-in user instead of creating a new one', async () => {
    mockSteamVerification(true)
    const context = await auth.$context

    // Sign in as a fresh user via Steam first, to get a session cookie to link against.
    const primarySteamId = '76561198011111111'
    const { response: primaryStart, headers: primaryStartHeaders } = await auth.api.signInSteam({
      body: { callbackURL: 'http://localhost/ui/profile' },
      returnHeaders: true,
    })
    const primaryState = new URL(new URL(primaryStart.url).searchParams.get('openid.return_to')!).searchParams.get('state')!
    const primaryCallback = await auth.handler(new Request(
      `http://localhost/api/auth/steam/callback?${buildCallbackQuery(primaryState, primarySteamId)}`,
      { headers: { cookie: forwardableCookieHeader(primaryStartHeaders) } },
    ))
    const sessionCookie = forwardableCookieHeader(primaryCallback.headers)
    const primaryUserId = (await context.internalAdapter.findAccountByProviderId(primarySteamId, 'steam'))!.userId

    // Now link a second Steam account to that same session.
    const secondSteamId = '76561198022222222'
    const { response: linkStart, headers: linkStartHeaders } = await auth.api.linkSteam({
      body: { callbackURL: 'http://localhost/ui/profile' },
      headers: { cookie: sessionCookie },
      returnHeaders: true,
    })
    const linkState = new URL(new URL(linkStart.url).searchParams.get('openid.return_to')!).searchParams.get('state')!
    const linkCallback = await auth.handler(new Request(
      `http://localhost/api/auth/steam/callback?${buildCallbackQuery(linkState, secondSteamId)}`,
      { headers: { cookie: forwardableCookieHeader(primaryCallback.headers, linkStartHeaders) } },
    ))

    expect(linkCallback.status).toBe(302)
    expect(linkCallback.headers.get('location')).toBe('http://localhost/ui/profile')

    const linkedAccount = await context.internalAdapter.findAccountByProviderId(secondSteamId, 'steam')
    expect(linkedAccount?.userId).toBe(primaryUserId)
  })

  it('refuses to link a Steam account that already belongs to a different user', async () => {
    mockSteamVerification(true)
    const context = await auth.$context

    const claimedSteamId = '76561198033333333'
    const claimingUserId = (await context.internalAdapter.createUser({
      email: 'someone-else@example.com',
      emailVerified: true,
      name: 'Someone Else',
    })).id
    await context.internalAdapter.linkAccount({
      userId: claimingUserId,
      providerId: 'steam',
      accountId: claimedSteamId,
    })

    // A second, unrelated user tries to link the same Steam account.
    const { response: primaryStart, headers: primaryStartHeaders } = await auth.api.signInSteam({
      body: { callbackURL: 'http://localhost/ui/profile' },
      returnHeaders: true,
    })
    const primarySteamId = '76561198044444444'
    const primaryState = new URL(new URL(primaryStart.url).searchParams.get('openid.return_to')!).searchParams.get('state')!
    const primaryCallback = await auth.handler(new Request(
      `http://localhost/api/auth/steam/callback?${buildCallbackQuery(primaryState, primarySteamId)}`,
      { headers: { cookie: forwardableCookieHeader(primaryStartHeaders) } },
    ))
    const sessionCookie = forwardableCookieHeader(primaryCallback.headers)

    const { response: linkStart, headers: linkStartHeaders } = await auth.api.linkSteam({
      body: { callbackURL: 'http://localhost/ui/profile' },
      headers: { cookie: sessionCookie },
      returnHeaders: true,
    })
    const linkState = new URL(new URL(linkStart.url).searchParams.get('openid.return_to')!).searchParams.get('state')!
    const linkCallback = await auth.handler(new Request(
      `http://localhost/api/auth/steam/callback?${buildCallbackQuery(linkState, claimedSteamId)}`,
      { headers: { cookie: forwardableCookieHeader(primaryCallback.headers, linkStartHeaders) } },
    ))

    expect(linkCallback.status).toBe(302)
    expect(linkCallback.headers.get('location')).toContain('error=account_already_linked_to_different_user')

    const stillClaimingUser = await context.internalAdapter.findAccountByProviderId(claimedSteamId, 'steam')
    expect(stillClaimingUser?.userId).toBe(claimingUserId)
  })
})
