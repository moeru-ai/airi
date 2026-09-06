import { describe, expect, it, vi } from 'vitest'

import {
  changePassword,
  emailChangeConsumedLocation,
  getCurrentSession,
  isPlaceholderEmail,
  signOut,
  updateUserProfile,
} from './profile'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ui-server-auth profile flow helpers', () => {
  it('identifies placeholder emails after trimming and case normalization', () => {
    expect(isPlaceholderEmail('123@steam.placeholder.local')).toBe(true)
    expect(isPlaceholderEmail('  USER@APPLE.PLACEHOLDER.LOCAL  ')).toBe(true)
    expect(isPlaceholderEmail('user@example.com')).toBe(false)
  })

  it('removes the native callback marker and error from the consumed location', () => {
    expect(emailChangeConsumedLocation({
      hash: '#security',
      query: {
        email_change: 'processed',
        error: 'TOKEN_EXPIRED',
        redirect: '/settings',
        source: ['account', 'banner'],
      },
    })).toEqual({
      hash: '#security',
      query: {
        redirect: '/settings',
        source: ['account', 'banner'],
      },
    })
  })

  it('preserves an unrelated error when the native callback marker is absent', () => {
    expect(emailChangeConsumedLocation({
      hash: '#security',
      query: {
        error: 'unrelated-login-error',
        redirect: '/settings',
      },
    })).toEqual({
      hash: '#security',
      query: {
        error: 'unrelated-login-error',
        redirect: '/settings',
      },
    })
  })

  it('preserves array callback and error values as malformed input', () => {
    expect(emailChangeConsumedLocation({
      hash: '',
      query: {
        email_change: ['processed', 'tampered'],
        error: ['TOKEN_EXPIRED', 'private-server-message'],
      },
    })).toEqual({
      hash: '',
      query: {
        email_change: ['processed', 'tampered'],
        error: ['TOKEN_EXPIRED', 'private-server-message'],
      },
    })
  })

  it('preserves an array error when the native callback marker is scalar', () => {
    expect(emailChangeConsumedLocation({
      hash: '#profile',
      query: {
        email_change: 'processed',
        error: ['TOKEN_EXPIRED', 'private-server-message'],
        keep: 'yes',
      },
    })).toEqual({
      hash: '#profile',
      query: {
        email_change: 'processed',
        error: ['TOKEN_EXPIRED', 'private-server-message'],
        keep: 'yes',
      },
    })
  })

  it('preserves an unknown scalar error and the native callback marker', () => {
    expect(emailChangeConsumedLocation({
      hash: '#profile',
      query: {
        email_change: 'processed',
        error: 'private-server-message',
        keep: 'yes',
      },
    })).toEqual({
      hash: '#profile',
      query: {
        email_change: 'processed',
        error: 'private-server-message',
        keep: 'yes',
      },
    })
  })

  it('parses the better-auth get-session response into a flat user shape', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      session: { id: 'sess-1' },
      user: {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.test',
        emailVerified: true,
        image: 'https://cdn.example.test/avatar.png',
        createdAt: '2025-04-01T00:00:00.000Z',
        // Field intentionally not in ProfileUser — must be ignored.
        twoFactorEnabled: true,
      },
    }))

    await expect(getCurrentSession({
      apiServerUrl: 'https://api.airi.test',
      fetchImpl,
    })).resolves.toEqual({
      user: {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.test',
        emailVerified: true,
        image: 'https://cdn.example.test/avatar.png',
        createdAt: '2025-04-01T00:00:00.000Z',
      },
    })

    // NOTICE:
    // We assert on the URL only, not on the fetch options shape. better-auth
    // client builds the request via better-fetch, which decorates the
    // options with framework metadata (plugins, jsonParser, signal, etc.).
    // Pinning option fields ties the test to better-auth internals; the URL
    // and the parsed result are the behavioural contract we actually care
    // about.
    // better-fetch passes a URL object, not a string, so coerce before
    // matching. URL.toString() yields the canonical href.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://api.airi.test/api/auth/get-session')
  })

  it('returns user=null when better-auth reports no session', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(null))

    await expect(getCurrentSession({
      apiServerUrl: 'https://api.airi.test',
      fetchImpl,
    })).resolves.toEqual({ user: null })
  })

  it('omits undefined fields from the update-user body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: true }))

    await updateUserProfile({
      apiServerUrl: 'https://api.airi.test',
      fetchImpl,
      name: 'Alice Renamed',
    })

    const init = fetchImpl.mock.calls[0]?.[1]
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Alice Renamed' })
  })

  it('passes image=null through so callers can clear avatars explicitly', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: true }))

    await updateUserProfile({
      apiServerUrl: 'https://api.airi.test',
      fetchImpl,
      image: null,
    })

    const init = fetchImpl.mock.calls[0]?.[1]
    expect(JSON.parse(String(init?.body))).toEqual({ image: null })
  })

  it('defaults change-password to revoking other sessions', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: true }))

    await changePassword({
      apiServerUrl: 'https://api.airi.test',
      fetchImpl,
      currentPassword: 'old-pw',
      newPassword: 'new-pw',
    })

    const init = fetchImpl.mock.calls[0]?.[1]
    expect(JSON.parse(String(init?.body))).toEqual({
      currentPassword: 'old-pw',
      newPassword: 'new-pw',
      revokeOtherSessions: true,
    })
  })

  it('surfaces server-side error messages for change-password', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      message: 'Invalid current password',
    }, 400))

    await expect(changePassword({
      apiServerUrl: 'https://api.airi.test',
      fetchImpl,
      currentPassword: 'wrong',
      newPassword: 'new-pw',
    })).rejects.toThrow('Invalid current password')
  })

  it('hits /sign-out via the auth client', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true }))

    await signOut({ apiServerUrl: 'https://api.airi.test', fetchImpl })

    // See URL-coercion + URL-only rationale above the get-session assertion.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://api.airi.test/api/auth/sign-out')
  })
})
