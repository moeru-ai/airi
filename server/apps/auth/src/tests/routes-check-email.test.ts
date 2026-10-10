import type { AuthRoutesDeps } from '../routes'

import { user } from '@proj-airi/auth-shared'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../error'
import { createAuthRoutes } from '../routes'

/** Replaces database I/O while exercising the public discovery route and its validation. */
async function buildRoute(rows: Array<Array<{ id: string, emailVerified?: boolean }>>) {
  const limit = vi.fn()
  for (const result of rows)
    limit.mockResolvedValueOnce(result)
  const select = vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) }))
  const deps = {
    auth: { handler: vi.fn(), api: { getSession: vi.fn() } },
    db: { select },
    env: { PUBLIC_URL: 'https://api.airi.test', AUTH_UI_URL: 'https://accounts.airi.test/ui', ADDITIONAL_TRUSTED_ORIGINS: [] },
    rateLimitMetrics: null,
  } as unknown as AuthRoutesDeps
  const app = new Hono().route('/', await createAuthRoutes(deps)).onError((error, c) => {
    if (error instanceof ApiError)
      return c.json({ error: error.errorCode }, error.statusCode)
    throw error
  })
  return { app, select }
}

describe('email verification discovery', () => {
  // Report: unverified accounts enter the password page before returning to verification.
  // ROOT CAUSE: discovery omitted the persisted verification flag.
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('returns verification=%s and credential=%s independently', async (emailVerified, hasPassword) => {
    const { app, select } = await buildRoute([[{ id: 'user-1', emailVerified }], hasPassword ? [{ id: 'credential-1' }] : []])
    const response = await app.request('/api/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ' User@Example.com ' }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ exists: true, hasPassword, emailVerified })
    expect(select).toHaveBeenNthCalledWith(1, { id: user.id, emailVerified: user.emailVerified })
  })

  it('returns false for an unknown email without reading credential accounts', async () => {
    const { app, select } = await buildRoute([[]])
    const response = await app.request('/api/auth/check-email', { method: 'POST', body: JSON.stringify({ email: 'new@example.com' }) })
    expect(await response.json()).toEqual({ exists: false, hasPassword: false, emailVerified: false })
    expect(select).toHaveBeenCalledOnce()
  })

  it.each(['{}', '{"email":42}', '{"email":"invalid"}', 'not-json'])('rejects invalid input: %s', async (body) => {
    const { app, select } = await buildRoute([])
    const response = await app.request('/api/auth/check-email', { method: 'POST', body })
    expect(response.status).toBe(400)
    expect(select).not.toHaveBeenCalled()
  })
})
