import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { ApiError } from '../../../utils/error'
import { createSteamDesktopSignInRoute } from './desktop-sign-in'

import * as schema from '../../../schemas'

/** Fixed-length S256 challenge fixture (43 base64url chars). */
const CODE_CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const STEAM_ID = '76561198000000000'

function signInBody(overrides?: Record<string, unknown>) {
  return JSON.stringify({
    ticket: 'deadbeef',
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    ...overrides,
  })
}

async function buildApp(env: { STEAM_PUBLISHER_KEY: string, STEAM_APP_ID?: string }, collaborators?: Record<string, unknown>) {
  const db = await mockDB(schema)
  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    secret: 'test-secret',
    baseURL: 'http://localhost',
  })

  const route = createSteamDesktopSignInRoute({
    auth: { $context: auth.$context } as never,
    env: {
      API_SERVER_URL: 'http://localhost:3000',
      STEAM_APP_ID: '3885340',
      ...env,
    } as never,
    collaborators: {
      authenticateUserTicket: vi.fn(async () => STEAM_ID),
      issueElectronOidcCode: vi.fn(async () => 'auth-code-1'),
      ...collaborators,
    } as never,
  })

  return {
    app: new Hono()
      .route('/api/auth/steam', route)
      .onError((err, c) => {
        if (err instanceof ApiError)
          return c.json({ error: err.errorCode }, err.statusCode)
        return c.json({ error: 'internal' }, 500)
      }),
    context: await auth.$context,
  }
}

describe('post /api/auth/steam/desktop-sign-in', () => {
  it('creates a new AIRI user and returns an authorization code on first ticket exchange', async () => {
    const { app, context } = await buildApp({ STEAM_PUBLISHER_KEY: 'test-key' })

    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody(),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toEqual({ code: 'auth-code-1' })

    const account = await context.internalAdapter.findAccountByProviderId(STEAM_ID, 'steam')
    expect(account).not.toBeNull()
    const user = await context.internalAdapter.findUserById(account!.userId)
    expect(user?.email).toBe(`${STEAM_ID}@steam.placeholder.local`)
  })

  it('returns 401 STEAM_TICKET_INVALID when ticket verification fails', async () => {
    const { app } = await buildApp({ STEAM_PUBLISHER_KEY: 'test-key' }, {
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
    const { app } = await buildApp({ STEAM_PUBLISHER_KEY: '' })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody({ ticket: 'abc123' }),
    })
    expect(res.status).toBe(503)
  })

  it('returns 503 when Steam app id is unset', async () => {
    const { app } = await buildApp({ STEAM_PUBLISHER_KEY: 'test-key', STEAM_APP_ID: '' })
    const res = await app.request('/api/auth/steam/desktop-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signInBody({ ticket: 'abc123' }),
    })
    expect(res.status).toBe(503)
  })
})
