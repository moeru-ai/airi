import { describe, expect, it, vi } from 'vitest'

import { resolveRequestAuth } from './request-auth'

// Mock jose module
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}))

const { jwtVerify } = await import('jose')
const mockedJwtVerify = vi.mocked(jwtVerify)

const mockEnv = {
  API_SERVER_URL: 'http://localhost:3000',
} as any

describe('resolveRequestAuth', () => {
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
