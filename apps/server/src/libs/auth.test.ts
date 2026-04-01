import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { seedTrustedClients } from './auth'

async function hashSecret(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  )
  return Buffer.from(hash).toString('base64url')
}

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
      OIDC_CLIENT_ID_WEB: 'airi-stage-web',
      OIDC_CLIENT_SECRET_WEB: 'web-secret',
      OIDC_CLIENT_ID_ELECTRON: 'airi-stage-electron',
      OIDC_CLIENT_SECRET_ELECTRON: 'electron-secret',
      OIDC_CLIENT_ID_POCKET: 'airi-stage-pocket',
      OIDC_CLIENT_SECRET_POCKET: 'pocket-secret',
    } as any)

    expect(values).toHaveBeenCalledTimes(3)

    const webClient = capturedValues[0]
    if (!webClient)
      throw new Error('Expected web client seed insert')

    expect(webClient.clientId).toBe('airi-stage-web')
    expect(webClient.clientSecret).toBe(await hashSecret('web-secret'))
    expect(webClient.public).toBe(false)
    expect(webClient.redirectUris).toEqual([
      'https://airi.moeru.ai/auth/callback',
      'http://localhost:5173/auth/callback',
      'http://localhost:4173/auth/callback',
    ])
    expect(webClient.scopes).toEqual(['openid', 'profile', 'email', 'offline_access'])
    expect(webClient.grantTypes).toEqual(['authorization_code', 'refresh_token'])
    expect(webClient.responseTypes).toEqual(['code'])
    expect(webClient.tokenEndpointAuthMethod).toBe('client_secret_post')
    expect(webClient.requirePKCE).toBe(true)
    expect(webClient.skipConsent).toBe(true)

    const electronClient = capturedValues[1]
    if (!electronClient)
      throw new Error('Expected electron client seed insert')

    expect(electronClient.clientId).toBe('airi-stage-electron')
    expect(electronClient.redirectUris).toEqual([
      'http://localhost:3000/api/auth/oidc/electron-callback',
    ])

    const pocketClient = capturedValues[2]
    if (!pocketClient)
      throw new Error('Expected pocket client seed insert')

    expect(pocketClient.clientId).toBe('airi-stage-pocket')
    expect(pocketClient.redirectUris).toEqual([
      'capacitor://localhost/auth/callback',
    ])
  })

  it('skips inserts for trusted clients that already exist', async () => {
    const { db, values } = createMockDb([
      [{ clientId: 'airi-stage-web' }],
    ])

    await seedTrustedClients(db as any, {
      API_SERVER_URL: 'http://localhost:3000',
      OIDC_CLIENT_ID_WEB: 'airi-stage-web',
      OIDC_CLIENT_SECRET_WEB: 'web-secret',
    } as any)

    expect(values).not.toHaveBeenCalled()
  })
})
