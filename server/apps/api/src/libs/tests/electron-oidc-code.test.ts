import { describe, expect, it, vi } from 'vitest'

import { issueElectronOidcCode } from '../electron-oidc-code'

describe('issueElectronOidcCode', () => {
  it('rejects a banned user before creating a session', async () => {
    const createSession = vi.fn()
    const findUserById = vi.fn(async () => ({
      id: 'user-1',
      banned: true,
      banExpires: null,
    }))

    await expect(issueElectronOidcCode({
      auth: {
        $context: Promise.resolve({
          internalAdapter: { findUserById, createSession },
          authCookies: { sessionToken: { name: 'session' } },
          secret: 'test-secret',
        }),
        handler: vi.fn(),
      } as never,
      env: { API_SERVER_URL: 'http://localhost:3000' } as never,
      userId: 'user-1',
      codeChallenge: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })).rejects.toMatchObject({
      statusCode: 403,
    })

    expect(findUserById).toHaveBeenCalledWith('user-1')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('treats an expired ban as not banned and continues to createSession', async () => {
    const createSession = vi.fn(async () => ({ token: 'session-token' }))
    const findUserById = vi.fn(async () => ({
      id: 'user-1',
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    }))
    const handler = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://localhost:3000/callback?code=auth-code-1' },
    }))

    const code = await issueElectronOidcCode({
      auth: {
        $context: Promise.resolve({
          internalAdapter: { findUserById, createSession },
          authCookies: { sessionToken: { name: 'session' } },
          secret: 'test-secret',
        }),
        handler,
      } as never,
      env: { API_SERVER_URL: 'http://localhost:3000' } as never,
      userId: 'user-1',
      codeChallenge: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })

    expect(code).toBe('auth-code-1')
    expect(createSession).toHaveBeenCalledWith('user-1')
  })
})
