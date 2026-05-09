import type { Env } from '../../libs/env'

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../../utils/error'
import { adminGuard, parseAdminEmails } from '../admin-guard'

describe('parseAdminEmails', () => {
  it('returns empty Set for empty string (production-safe default)', () => {
    expect(parseAdminEmails('')).toEqual(new Set())
  })

  it('parses single email without commas', () => {
    expect(parseAdminEmails('alice@example.com')).toEqual(new Set(['alice@example.com']))
  })

  it('parses multiple emails, trims whitespace, and lowercases', () => {
    expect(parseAdminEmails(' Alice@Example.com , bob@example.com,Carol@EXAMPLE.com ')).toEqual(
      new Set(['alice@example.com', 'bob@example.com', 'carol@example.com']),
    )
  })

  it('drops empty entries from trailing commas', () => {
    expect(parseAdminEmails('alice@example.com,,bob@example.com,')).toEqual(
      new Set(['alice@example.com', 'bob@example.com']),
    )
  })
})

interface MockUser {
  id: string
  email: string
  emailVerified: boolean
}

function buildHonoApp(env: Env, attachUser: MockUser | null) {
  return new Hono()
    .use('*', async (c, next) => {
      // Stand-in for sessionMiddleware: just sets the user.
      ;(c as any).set('user', attachUser)
      await next()
    })
    .use('*', adminGuard(env))
    .get('/protected', c => c.json({ ok: true }))
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode }, err.statusCode)
      throw err
    })
}

describe('adminGuard middleware', () => {
  it('returns 401 when no user is on the context', async () => {
    const app = buildHonoApp({ ADMIN_EMAILS: 'alice@example.com' } as Env, null)
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'UNAUTHORIZED' })
  })

  it('returns 403 when user is signed in but their email is not in the allowlist', async () => {
    const app = buildHonoApp(
      { ADMIN_EMAILS: 'alice@example.com' } as Env,
      { id: 'uid_random', email: 'random@example.com', emailVerified: true },
    )
    const res = await app.request('/protected')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN' })
  })

  it('returns 403 when allowlist is empty (production default)', async () => {
    const app = buildHonoApp(
      { ADMIN_EMAILS: '' } as Env,
      { id: 'uid_alpha', email: 'alice@example.com', emailVerified: true },
    )
    const res = await app.request('/protected')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN' })
  })

  it('returns 403 when email matches but emailVerified is false', async () => {
    const app = buildHonoApp(
      { ADMIN_EMAILS: 'alice@example.com' } as Env,
      { id: 'uid_alpha', email: 'alice@example.com', emailVerified: false },
    )
    const res = await app.request('/protected')
    expect(res.status).toBe(403)
    // Different message but still FORBIDDEN — caller doesn't need to distinguish
    expect(await res.json()).toEqual({ error: 'FORBIDDEN' })
  })

  it('passes through when email is in allowlist and verified', async () => {
    const app = buildHonoApp(
      { ADMIN_EMAILS: 'alice@example.com,bob@example.com' } as Env,
      { id: 'uid_beta', email: 'bob@example.com', emailVerified: true },
    )
    const res = await app.request('/protected')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('matches case-insensitively (operator types Bob@Example.com, env has bob@example.com)', async () => {
    const app = buildHonoApp(
      { ADMIN_EMAILS: 'bob@example.com' } as Env,
      { id: 'uid_beta', email: 'Bob@Example.com', emailVerified: true },
    )
    const res = await app.request('/protected')
    expect(res.status).toBe(200)
  })
})
