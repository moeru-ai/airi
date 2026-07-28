import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../utils/error'
import { createSteamDesktopSignInRoute } from './desktop-sign-in'

/** Fixed-length S256 challenge fixture (43 base64url chars). */
const CODE_CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

function createMockDb() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ banned: false, banExpires: null }]),
        })),
      })),
    })),
  }
}

function signInBody(overrides?: Record<string, unknown>) {
  return JSON.stringify({
    ticket: 'deadbeef',
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    ...overrides,
  })
}

function buildApp(env: { STEAM_PUBLISHER_KEY: string }, collaborators?: Record<string, unknown>) {
  const route = createSteamDesktopSignInRoute({
    auth: {} as never,
    db: createMockDb() as never,
    env: {
      API_SERVER_URL: 'http://localhost:3000',
      AUTH_UI_URL: 'https://accounts.airi.build/ui',
      ...env,
    } as never,
    collaborators: {
      authenticateUserTicket: vi.fn(async () => '76561198000000000'),
      checkAppOwnership: vi.fn(async () => true),
      getPlayerSummaries: vi.fn(async () => null),
      findLinkedSteamUser: vi.fn(async () => ({ userId: 'user-steam-1' })),
      createEnrollmentToken: vi.fn(async () => 'enroll-tok'),
      issueElectronOidcCode: vi.fn(async () => 'auth-code-1'),
      ...collaborators,
    } as never,
  })

  return new Hono()
    .route('/api/auth/steam', route)
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode }, err.statusCode)
      return c.json({ error: 'internal' }, 500)
    })
}

describe('post /api/auth/steam/desktop-sign-in', () => {
  it('returns an authorization code when the steamId is linked', async () => {
    const issueElectronOidcCode = vi.fn(async () => 'auth-code-1')
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' }, { issueElectronOidcCode })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody(),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toEqual({ code: 'auth-code-1' })
    expect(issueElectronOidcCode).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-steam-1',
      codeChallenge: CODE_CHALLENGE,
    }))
  })

  it('returns 403 STEAM_NEEDS_ENROLLMENT with token + authUiUrl when unlinked', async () => {
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' }, {
      findLinkedSteamUser: vi.fn(async () => null),
    })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody(),
    })
    expect(res.status).toBe(403)
    const body = await res.json() as Record<string, unknown>
    expect(body.errorCode).toBe('STEAM_NEEDS_ENROLLMENT')
    expect(body.enrollToken).toBe('enroll-tok')
    expect(body.authUiUrl).toBe('https://accounts.airi.build/ui')
  })

  it('returns 503 when Steam publisher key is unset', async () => {
    const app = buildApp({ STEAM_PUBLISHER_KEY: '' })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody({ ticket: 'abc123' }),
    })
    expect(res.status).toBe(503)
  })

  it('returns 400 for invalid ticket body', async () => {
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody({ ticket: 'not-hex!' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when code_challenge is missing', async () => {
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 'deadbeef' }),
    })
    expect(res.status).toBe(400)
  })
})
