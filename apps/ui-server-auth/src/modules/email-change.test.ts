import { afterEach, describe, expect, it, vi } from 'vitest'

import { changeEmail, parseEmailChangeError } from './email-change'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('email-change HTTP helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the native Better Auth change-email body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: true }))
    vi.stubGlobal('fetch', fetchImpl)

    await changeEmail({
      apiServerUrl: 'https://api.airi.test',
      callbackURL: 'https://auth.example.com/profile?email_change=processed',
      newEmail: 'new@example.com',
    })

    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.airi.test/api/auth/change-email')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      newEmail: 'new@example.com',
      callbackURL: 'https://auth.example.com/profile?email_change=processed',
    })
  })

  it('uses credentials include', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: true }))
    vi.stubGlobal('fetch', fetchImpl)

    await changeEmail({
      apiServerUrl: 'https://api.airi.test',
      callbackURL: 'https://auth.example.com/profile?email_change=processed',
      newEmail: 'new@example.com',
    })

    const [, init] = fetchImpl.mock.calls[0] ?? []
    expect((init as RequestInit).credentials).toBe('include')
  })

  it('does not accept custom stage or maskedEmail fields', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      status: true,
      stage: 'awaiting_old_email',
      maskedEmail: 'n***@example.test',
    }))
    vi.stubGlobal('fetch', fetchImpl)

    await expect(changeEmail({
      apiServerUrl: 'https://api.airi.test',
      callbackURL: 'https://auth.example.com/profile?email_change=processed',
      newEmail: 'new@example.com',
    })).resolves.toBeUndefined()
  })

  it('keeps a stable top-level rate-limit error code', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests',
    }, 429))
    vi.stubGlobal('fetch', fetchImpl)

    await expect(changeEmail({
      apiServerUrl: 'https://api.airi.test',
      callbackURL: 'https://auth.example.com/ui/profile?email_change=processed',
      newEmail: 'new@example.com',
    })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      status: 429,
    })
  })

  it('does not treat a top-level server message as a stable code', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      error: 'Database unavailable',
    }, 500))
    vi.stubGlobal('fetch', fetchImpl)

    await expect(changeEmail({
      apiServerUrl: 'https://api.airi.test',
      callbackURL: 'https://auth.example.com/ui/profile?email_change=processed',
      newEmail: 'new@example.com',
    })).rejects.toMatchObject({
      code: null,
      status: 500,
    })
  })

  it('accepts one whitelisted Better Auth error query value', () => {
    expect(parseEmailChangeError('TOKEN_EXPIRED')).toBe('TOKEN_EXPIRED')
  })

  it.each([
    ['array', ['INVALID_TOKEN']],
    ['unknown value', 'SERVER_ERROR'],
    ['provider message', 'Database unavailable'],
  ])('rejects %s callback values', (_, value) => {
    expect(parseEmailChangeError(value)).toBeNull()
  })
})
