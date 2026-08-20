import type { Database } from '../db'
import type { RequestAuthSession } from '../request-auth'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveRequestAuth } from '../request-auth'

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}))

const { createRemoteJWKSet, jwtVerify } = await import('jose')
const mockedCreateRemoteJWKSet = vi.mocked(createRemoteJWKSet)
const mockedJwtVerify = vi.mocked(jwtVerify)

const mockEnv = {
  AUTH_SERVER_URL: 'https://api.airi.build',
  TEST_AUTH_TOKEN: '',
  TEST_AUTH_USER_ID: 'test-user',
  TEST_AUTH_USER_EMAIL: 'test@example.com',
  TEST_AUTH_USER_NAME: 'Test User',
} as const

function createUser(overrides: Partial<RequestAuthSession['user']> = {}): RequestAuthSession['user'] {
  const now = new Date()
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    emailVerified: true,
    image: null,
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function createDb(user: RequestAuthSession['user'] | null, failure?: Error): Database {
  return {
    query: {
      user: {
        findFirst: vi.fn(async () => {
          if (failure)
            throw failure
          return user
        }),
      },
    },
  } as unknown as Database
}

function mockValidJwt(subject = 'user-1') {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600
  mockedJwtVerify.mockResolvedValue({
    payload: { sub: subject, iat, exp, jti: 'jwt-token-id' },
    protectedHeader: { alg: 'RS256' },
    key: new Uint8Array(),
  })
  return { iat, exp }
}

describe('resolveRequestAuth', () => {
  beforeEach(() => {
    mockedJwtVerify.mockReset()
    mockedCreateRemoteJWKSet.mockClear()
  })

  it('verifies access tokens against the public API issuer and audience', async () => {
    const { iat, exp } = mockValidJwt()
    const user = createUser()

    const result = await resolveRequestAuth(
      createDb(user),
      mockEnv,
      new Headers({ Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.test.sig' }),
    )

    expect(mockedCreateRemoteJWKSet).toHaveBeenCalledWith(new URL('https://api.airi.build/api/auth/jwks'))
    expect(mockedJwtVerify).toHaveBeenCalledWith('eyJhbGciOiJSUzI1NiJ9.test.sig', 'mock-jwks', {
      issuer: 'https://api.airi.build/api/auth',
      audience: 'https://api.airi.build',
    })
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

  it('fetches JWKS privately while preserving the public issuer contract', async () => {
    mockValidJwt()

    await resolveRequestAuth(
      createDb(createUser()),
      {
        ...mockEnv,
        AUTH_SERVER_INTERNAL_URL: 'http://auth:3000',
      },
      new Headers({ Authorization: 'Bearer jwt' }),
    )

    expect(mockedCreateRemoteJWKSet).toHaveBeenCalledWith(new URL('http://auth:3000/api/auth/jwks'))
    expect(mockedJwtVerify).toHaveBeenCalledWith('jwt', 'mock-jwks', {
      issuer: 'https://api.airi.build/api/auth',
      audience: 'https://api.airi.build',
    })
  })

  it('rejects a banned principal after signature verification', async () => {
    mockValidJwt()
    const result = await resolveRequestAuth(
      createDb(createUser({ banned: true, banExpires: null })),
      mockEnv,
      new Headers({ Authorization: 'Bearer jwt' }),
    )
    expect(result).toBeNull()
  })

  it('accepts a principal whose temporary ban has expired', async () => {
    mockValidJwt()
    const user = createUser({ banned: true, banExpires: new Date(Date.now() - 1000) })
    const result = await resolveRequestAuth(
      createDb(user),
      mockEnv,
      new Headers({ Authorization: 'Bearer jwt' }),
    )
    expect(result?.user).toEqual(user)
  })

  it('returns the configured test principal without querying JWKS', async () => {
    const result = await resolveRequestAuth(
      createDb(null),
      {
        ...mockEnv,
        TEST_AUTH_TOKEN: 'test-secret',
        TEST_AUTH_USER_ID: 'test-user-1',
        TEST_AUTH_USER_EMAIL: 'Test@Example.com',
        TEST_AUTH_USER_NAME: 'Local Test User',
      },
      new Headers({ Authorization: 'Bearer test-secret' }),
    )

    expect(result?.user.id).toBe('test-user-1')
    expect(result?.user.email).toBe('test@example.com')
    expect(mockedJwtVerify).not.toHaveBeenCalled()
  })

  it('returns null for missing, invalid, or subjectless bearer tokens', async () => {
    expect(await resolveRequestAuth(createDb(null), mockEnv, new Headers())).toBeNull()

    mockedJwtVerify.mockRejectedValueOnce(new Error('invalid signature'))
    expect(await resolveRequestAuth(
      createDb(null),
      mockEnv,
      new Headers({ Authorization: 'Bearer invalid' }),
    )).toBeNull()

    mockedJwtVerify.mockResolvedValueOnce({
      payload: { exp: Math.floor(Date.now() / 1000) + 3600 },
      protectedHeader: { alg: 'RS256' },
      key: new Uint8Array(),
    })
    expect(await resolveRequestAuth(
      createDb(null),
      mockEnv,
      new Headers({ Authorization: 'Bearer subjectless' }),
    )).toBeNull()
  })

  it('propagates temporary JWKS failures', async () => {
    mockedJwtVerify.mockRejectedValueOnce(new TypeError('fetch failed'))

    await expect(resolveRequestAuth(
      createDb(null),
      mockEnv,
      new Headers({ Authorization: 'Bearer valid-token' }),
    )).rejects.toThrow('fetch failed')
  })

  it('propagates database failures after JWT verification', async () => {
    mockValidJwt()
    await expect(resolveRequestAuth(
      createDb(null, new Error('database unavailable')),
      mockEnv,
      new Headers({ Authorization: 'Bearer valid-token' }),
    )).rejects.toThrow('database unavailable')
  })
})
