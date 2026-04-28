import { describe, expect, it, vi } from 'vitest'

import { changePassword, getCurrentSession, signOut, updateUserProfile } from './profile'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ui-server-auth profile flow helpers', () => {
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

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.airi.test/api/auth/get-session',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
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

  it('posts to /sign-out with credentials included', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ success: true }))

    await signOut({ apiServerUrl: 'https://api.airi.test', fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.airi.test/api/auth/sign-out',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })
})
