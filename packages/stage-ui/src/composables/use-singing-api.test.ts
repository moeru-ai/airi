// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import { resolveElectronSingingBaseUrlFromApi } from './use-singing-api'

describe('useSingingApi helpers', () => {
  it('uses the main-process provided local singing server url', async () => {
    const getLocalServerInfo = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.1:27123',
      port: 27123,
      ready: true,
    })

    await expect(resolveElectronSingingBaseUrlFromApi({ getLocalServerInfo }))
      .resolves
      .toBe('http://127.0.0.1:27123')
  })

  it('fails closed when the local singing server is unavailable', async () => {
    const getLocalServerInfo = vi.fn().mockResolvedValue({
      url: null,
      port: null,
      ready: false,
      error: 'Port 27123 is already in use by another process',
    })

    await expect(resolveElectronSingingBaseUrlFromApi({ getLocalServerInfo }))
      .rejects
      .toThrow('Port 27123 is already in use by another process')
  })
})
