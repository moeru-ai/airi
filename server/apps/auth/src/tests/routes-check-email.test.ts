import type { AuthRoutesDeps } from '../routes'

import { user } from '@proj-airi/auth-shared'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../error'
import { createAuthRoutes } from '../routes'

/** Replaces database I/O while exercising the public discovery route and its validation. */
async function buildRoute(rows: Array<Array<{ id: string, emailVerified?: unknown }>>) {
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
  // Source: user report in a private development conversation, tracked in https://github.com/moeru-ai/airi/pull/2893.
  // ROOT CAUSE:
  // Before: discovery omitted verification status, so unverified users reached password entry.
  // Fix: return the stored flag so clients can route directly to verification.
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

  // Report: https://github.com/moeru-ai/airi/pull/2893#discussion_r4236517844
  // ROOT CAUSE:
  // Before: the route serialized adapter output without validating its response contract.
  // Fix: reject malformed verification flags before sending a successful response.
  it.each([null, undefined, 'false', 0])('rejects malformed adapter verification status %s', async (emailVerified) => {
    const { app } = await buildRoute([[{ id: 'user-1', emailVerified }], []])
    const response = await app.request('/api/auth/check-email', { method: 'POST', body: JSON.stringify({ email: 'user@example.com' }) })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'INTERNAL_SERVER_ERROR' })
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
