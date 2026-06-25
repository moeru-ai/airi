import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveRequestAuth } from '../request-auth'

// Mock jose module
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}))

const { jwtVerify } = await import('jose')
const mockedJwtVerify = vi.mocked(jwtVerify)

const mockEnv = {
  API_SERVER_URL: 'http://localhost:3000',
  TEST_AUTH_TOKEN: '',
  TEST_AUTH_USER_ID: 'test-user',
  TEST_AUTH_USER_EMAIL: 'test@example.com',
  TEST_AUTH_USER_NAME: 'Test User',
  TEST_AUTH_USER_ROLE: '',
} as any

describe('resolveRequestAuth', () => {
  beforeEach(() => {
    mockedJwtVerify.mockReset()
  })

  it('rejects a banned principal even when the session resolves (immediate revocation)', async () => {
    // `user.banned` comes from the better-auth admin plugin and is loaded with
    // the user row, so the hot-path gate is a field check (no extra query).
    const authSession = {
      user: { id: 'user-1', email: 'banned@example.com', name: 'User', emailVerified: true, image: null, banned: true, banExpires: null, createdAt: new Date(), updatedAt: new Date() },
      session: { id: 'session-1', userId: 'user-1', token: 'session-token', createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), ipAddress: null, userAgent: null },
    }
    const auth = { api: { getSession: vi.fn().mockResolvedValue(authSession) } }

    const result = await resolveRequestAuth(auth as any, mockEnv, new Headers())

    expect(result).toBeNull()
  })

  it('treats an expired ban (banExpires in the past) as not banned', async () => {
    const authSession = {
      user: { id: 'user-1', email: 'expired@example.com', name: 'User', emailVerified: true, image: null, banned: true, banExpires: new Date(Date.now() - 1000), createdAt: new Date(), updatedAt: new Date() },
      session: { id: 'session-1', userId: 'user-1', token: 'session-token', createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), ipAddress: null, userAgent: null },
    }
    const auth = { api: { getSession: vi.fn().mockResolvedValue(authSession) } }

    const result = await resolveRequestAuth(auth as any, mockEnv, new Headers())

    expect(result).toBe(authSession)
  })

  it('returns the better-auth session when it is already available', async () => {
    const authSession = {
      user: { id: 'user-1', email: 'user@example.com', name: 'User', emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() },
      session: { id: 'session-1', userId: 'user-1', token: 'session-token', createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), ipAddress: null, userAgent: null },
    }

    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(authSession),
      },
    }

    const result = await resolveRequestAuth(
      auth as any,
      mockEnv,
      new Headers({ Authorization: 'Bearer ignored' }),
    )

    expect(result).toBe(authSession)
    expect(mockedJwtVerify).not.toHaveBeenCalled()
  })

  it('verifies JWT and returns user session when no better-auth session exists', async () => {
    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 3600
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockedJwtVerify.mockResolvedValue({
      payload: {
        sub: 'user-1',
        iss: 'http://localhost:3000/api/auth',
        aud: ['http://localhost:3000', 'http://localhost:3000/api/auth/oauth2/userinfo'],
        iat,
        exp,
        jti: 'jwt-token-id',
      },
      protectedHeader: { alg: 'RS256' },
      key: {} as any,
    } as any)

    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
      $context: Promise.resolve({
        internalAdapter: {
          findUserById: vi.fn().mockResolvedValue(user),
        },
      }),
    }

    const result = await resolveRequestAuth(
      auth as any,
      mockEnv,
      new Headers({ Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.test.sig' }),
    )

    expect(result).toEqual({
      user,
      session: {
        id: 'jwt-token-id',
        userId: 'user-1',
        token: 'eyJhbGciOiJSUzI1NiJ9.test.sig',
        createdAt: new Date(iat * 1000),
        updatedAt: new Date(iat * 1000),
        expiresAt: new Date(exp * 1000),
        ipAddress: null,
        userAgent: null,
      },
    })
  })

  it('returns null when JWT verification fails', async () => {
    mockedJwtVerify.mockRejectedValue(new Error('invalid signature'))

    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    }

    const result = await resolveRequestAuth(
      auth as any,
      mockEnv,
      new Headers({ Authorization: 'Bearer invalid-jwt' }),
    )

    expect(result).toBeNull()
  })

  it('returns the configured test user when bearer token matches TEST_AUTH_TOKEN', async () => {
    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    }

    const result = await resolveRequestAuth(
      auth as any,
      {
        ...mockEnv,
        TEST_AUTH_TOKEN: 'test-secret',
        TEST_AUTH_USER_ID: 'test-user-1',
        TEST_AUTH_USER_EMAIL: 'Test@Example.com',
        TEST_AUTH_USER_NAME: 'Local Test User',
        TEST_AUTH_USER_ROLE: 'admin',
      },
      new Headers({ Authorization: 'Bearer test-secret' }),
    )

    expect(result?.user.id).toBe('test-user-1')
    expect(result?.user.email).toBe('test@example.com')
    expect(result?.user.name).toBe('Local Test User')
    expect(result?.user.role).toBe('admin')
    expect(result?.session.userId).toBe('test-user-1')
    expect(result?.session.token).toBe('test-secret')
    expect(mockedJwtVerify).not.toHaveBeenCalled()
  })

  it('falls through to JWT verification when TEST_AUTH_TOKEN does not match', async () => {
    mockedJwtVerify.mockRejectedValue(new Error('invalid signature'))

    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    }

    const result = await resolveRequestAuth(
      auth as any,
      {
        ...mockEnv,
        TEST_AUTH_TOKEN: 'test-secret',
      },
      new Headers({ Authorization: 'Bearer different-secret' }),
    )

    expect(result).toBeNull()
    expect(mockedJwtVerify).toHaveBeenCalled()
  })

  it('returns null when no Authorization header is present', async () => {
    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    }

    const result = await resolveRequestAuth(
      auth as any,
      mockEnv,
      new Headers(),
    )

    expect(result).toBeNull()
  })

  it('returns null when JWT has no sub claim', async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        iss: 'http://localhost:3000',
        aud: 'http://localhost:3000',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      protectedHeader: { alg: 'RS256' },
      key: {} as any,
    } as any)

    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    }

    const result = await resolveRequestAuth(
      auth as any,
      mockEnv,
      new Headers({ Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.nosub.sig' }),
    )

    expect(result).toBeNull()
  })
})
