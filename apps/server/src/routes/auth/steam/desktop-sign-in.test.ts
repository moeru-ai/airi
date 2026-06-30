import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../utils/error'
import { createSteamDesktopSignInRoute } from './desktop-sign-in'

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
      mintElectronOidcTokens: vi.fn(async () => ({
        accessToken: 'jwt-access',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
      })),
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
  it('returns OIDC tokens when the steamId is linked', async () => {
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 'deadbeef' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.accessToken).toBe('jwt-access')
    expect(body.expiresIn).toBe(3600)
  })

  it('returns 403 STEAM_NEEDS_ENROLLMENT with token + authUiUrl when unlinked', async () => {
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' }, {
      findLinkedSteamUser: vi.fn(async () => null),
    })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 'deadbeef' }),
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
      body: JSON.stringify({ ticket: 'abc123' }),
    })
    expect(res.status).toBe(503)
  })

  it('returns 400 for invalid ticket body', async () => {
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 'not-hex!' }),
    })
    expect(res.status).toBe(400)
  })
})
