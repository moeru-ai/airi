import { describe, expect, it, vi } from 'vitest'

import { ensureDynamicFirstPartyRedirectUri, seedTrustedClients } from './auth'

function createMockDb(existingRowsByCall: unknown[][] = []) {
  const limit = vi.fn()
  for (const rows of existingRowsByCall) {
    limit.mockResolvedValueOnce(rows)
  }

  const capturedValues: any[] = []
  const values = vi.fn(async (value: any) => {
    capturedValues.push(value)
  })

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit,
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values,
    })),
  }

  return { db, limit, values, capturedValues }
}

describe('seedTrustedClients', () => {
  it('seeds trusted first-party clients with explicit oauth metadata', async () => {
    const { db, values, capturedValues } = createMockDb([[], [], []])

    await seedTrustedClients(db as any, {
      API_SERVER_URL: 'http://localhost:3000',
    } as any)

    expect(values).toHaveBeenCalledTimes(3)

    // Web — public client (no secret, PKCE only)
    const webClient = capturedValues[0]
    if (!webClient)
      throw new Error('Expected web client seed insert')

    expect(webClient.clientId).toBe('airi-stage-web')
    expect(webClient.clientSecret).toBeNull()
    expect(webClient.public).toBe(true)
    // Includes default URIs + derived from API_SERVER_URL (localhost:3000)
    expect(webClient.redirectUris).toEqual([
      'https://airi.moeru.ai/auth/callback',
      'http://localhost:5173/auth/callback',
      'http://localhost:4173/auth/callback',
      'http://localhost:3000/auth/callback',
    ])
    expect(webClient.scopes).toEqual(['openid', 'profile', 'email', 'offline_access'])
    expect(webClient.grantTypes).toEqual(['authorization_code', 'refresh_token'])
    expect(webClient.responseTypes).toEqual(['code'])
    expect(webClient.tokenEndpointAuthMethod).toBe('none')
    expect(webClient.requirePKCE).toBe(true)
    expect(webClient.skipConsent).toBe(true)

    // Electron — public native client (PKCE only)
    const electronClient = capturedValues[1]
    if (!electronClient)
      throw new Error('Expected electron client seed insert')

    expect(electronClient.clientId).toBe('airi-stage-electron')
    expect(electronClient.clientSecret).toBeNull()
    expect(electronClient.public).toBe(true)
    expect(electronClient.tokenEndpointAuthMethod).toBe('none')
    expect(electronClient.redirectUris).toEqual([
      'http://localhost:3000/api/auth/oidc/electron-callback',
    ])

    // Mobile — public client (no secret, PKCE only)
    const pocketClient = capturedValues[2]
    if (!pocketClient)
      throw new Error('Expected pocket client seed insert')

    expect(pocketClient.clientId).toBe('airi-stage-pocket')
    expect(pocketClient.clientSecret).toBeNull()
    expect(pocketClient.public).toBe(true)
    expect(pocketClient.tokenEndpointAuthMethod).toBe('none')
    expect(pocketClient.redirectUris).toEqual([
      'capacitor://localhost/auth/callback',
    ])
  })

  it('updates existing clients to match current config', async () => {
    const setCalls: any[] = []
    const set = vi.fn((vals: any) => {
      setCalls.push(vals)
      return { where: vi.fn() }
    })

    const { db, values } = createMockDb([
      [{ clientId: 'airi-stage-web' }],
      [],
      [],
    ]);
    (db as any).update = vi.fn(() => ({ set }))

    await seedTrustedClients(db as any, {
      API_SERVER_URL: 'http://localhost:3000',
    } as any)

    expect(values).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenCalledTimes(1)
    expect(setCalls[0].public).toBe(true)
    expect(setCalls[0].tokenEndpointAuthMethod).toBe('none')
    expect(setCalls[0].clientSecret).toBeNull()
  })
})

describe('ensureDynamicFirstPartyRedirectUri', () => {
  it('appends a trusted web callback redirect URI discovered from the authorize request', async () => {
    const setCalls: any[] = []
    const updateWhere = vi.fn()
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              { redirectUris: ['https://airi.moeru.ai/auth/callback'] },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: any) => {
          setCalls.push(value)
          return { where: updateWhere }
        }),
      })),
    }

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-web&redirect_uri=https%3A%2F%2Fpreview.kwaa.workers.dev%2Fauth%2Fcallback'),
    )

    expect(setCalls).toHaveLength(1)
    expect(setCalls[0].redirectUris).toEqual([
      'https://airi.moeru.ai/auth/callback',
      'https://preview.kwaa.workers.dev/auth/callback',
    ])
    expect(updateWhere).toHaveBeenCalledTimes(1)
  })

  it('appends a same-origin electron relay redirect URI discovered from the authorize request', async () => {
    const setCalls: any[] = []
    const updateWhere = vi.fn()
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              { redirectUris: ['https://api.airi.build/api/auth/oidc/electron-callback'] },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: any) => {
          setCalls.push(value)
          return { where: updateWhere }
        }),
      })),
    }

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://airi-server-dev.up.railway.app/api/auth/oauth2/authorize?client_id=airi-stage-electron&redirect_uri=https%3A%2F%2Fairi-server-dev.up.railway.app%2Fapi%2Fauth%2Foidc%2Felectron-callback'),
    )

    expect(setCalls).toHaveLength(1)
    expect(setCalls[0].redirectUris).toEqual([
      'https://api.airi.build/api/auth/oidc/electron-callback',
      'https://airi-server-dev.up.railway.app/api/auth/oidc/electron-callback',
    ])
    expect(updateWhere).toHaveBeenCalledTimes(1)
  })

  it('ignores untrusted or non-callback redirect URIs', async () => {
    const db = {
      select: vi.fn(),
      update: vi.fn(),
    }

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-web&redirect_uri=https%3A%2F%2Fevil.example%2Fauth%2Fcallback'),
    )

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-web&redirect_uri=https%3A%2F%2Fairi.moeru.ai%2Fother-path'),
    )

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-electron&redirect_uri=https%3A%2F%2Fother.example%2Fapi%2Fauth%2Foidc%2Felectron-callback'),
    )

    expect(db.select).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })
})
