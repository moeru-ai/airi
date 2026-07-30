import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../utils/error'
import { createSteamDesktopSignInRoute } from './desktop-sign-in'

/** Fixed-length S256 challenge fixture (43 base64url chars). */
const CODE_CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

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
    auth: { $context: Promise.resolve({ internalAdapter: {} }) } as never,
    env: {
      API_SERVER_URL: 'http://localhost:3000',
      ...env,
    } as never,
    collaborators: {
      authenticateUserTicket: vi.fn(async () => '76561198000000000'),
      resolveOrCreateSteamUser: vi.fn(async () => ({ userId: 'user-steam-1' })),
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
  it('creates a new AIRI user and returns an authorization code on first ticket exchange', async () => {
    const resolveOrCreateSteamUser = vi.fn(async () => ({ userId: 'new-steam-user' }))
    const issueElectronOidcCode = vi.fn(async () => 'auth-code-1')
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' }, { resolveOrCreateSteamUser, issueElectronOidcCode })

    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody(),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toEqual({ code: 'auth-code-1' })
    expect(resolveOrCreateSteamUser).toHaveBeenCalledWith(expect.anything(), '76561198000000000')
    expect(issueElectronOidcCode).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'new-steam-user',
      codeChallenge: CODE_CHALLENGE,
    }))
  })

  it('resolves the same AIRI user on a repeat ticket exchange (no duplicate account)', async () => {
    const resolveOrCreateSteamUser = vi.fn(async () => ({ userId: 'existing-steam-user' }))
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' }, { resolveOrCreateSteamUser })

    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody(),
    })

    expect(res.status).toBe(200)
    expect(resolveOrCreateSteamUser).toHaveBeenCalledTimes(1)
  })

  it('returns 401 STEAM_TICKET_INVALID when ticket verification fails', async () => {
    const app = buildApp({ STEAM_PUBLISHER_KEY: 'test-key' }, {
      authenticateUserTicket: vi.fn(async () => {
        throw new Error('Steam AuthenticateUserTicket: InvalidTicket')
      }),
    })

    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody(),
    })

    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('STEAM_TICKET_INVALID')
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
