import { describe, expect, it, vi } from 'vitest'

import { resolveRequestAuth, revokeOIDCAccessToken } from './request-auth'

function createSelectDb(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(rows),
        })),
      })),
    })),
  }
}

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

    const db = createSelectDb([])
    const result = await resolveRequestAuth(
      auth,
      db as any,
      new Headers({ Authorization: 'Bearer ignored' }),
    )

    expect(result).toBe(authSession)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('falls back to a trusted OIDC access token when no better-auth session exists', async () => {
    const createdAt = new Date('2026-04-02T10:00:00.000Z')
    const expiresAt = new Date('2026-04-02T11:00:00.000Z')
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      emailVerified: true,
      image: null,
      createdAt,
      updatedAt: createdAt,
    }

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

    const db = createSelectDb([{
      id: 'oauth-token-row',
      userId: 'user-1',
      sessionId: null,
      createdAt,
      expiresAt,
    }])

    const result = await resolveRequestAuth(
      auth,
      db as any,
      new Headers({ Authorization: 'Bearer oidc-access-token' }),
    )

    expect(result).toEqual({
      user,
      session: {
        id: 'oauth-token-row',
        userId: 'user-1',
        token: 'oidc-access-token',
        createdAt,
        updatedAt: createdAt,
        expiresAt,
        ipAddress: null,
        userAgent: null,
      },
    })
  })
})

describe('revokeOIDCAccessToken', () => {
  it('revokes the related refresh token and removes access tokens in one transaction', async () => {
    const deleteWhere = vi.fn()
    const updateWhere = vi.fn()
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => {
      await callback({
        delete: vi.fn(() => ({ where: deleteWhere })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({ where: updateWhere })),
        })),
      })
    })

    const db = {
      ...createSelectDb([{
        id: 'access-row-1',
        refreshId: 'refresh-row-1',
      }]),
      transaction,
    }

    const revoked = await revokeOIDCAccessToken(
      db as any,
      'oidc-access-token',
    )

    expect(revoked).toBe(true)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(deleteWhere).toHaveBeenCalledTimes(2)
    expect(updateWhere).toHaveBeenCalledTimes(1)
  })
})
