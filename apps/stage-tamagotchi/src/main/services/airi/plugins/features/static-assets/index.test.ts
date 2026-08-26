import type { StaticAssetService } from '../../../http-server/static-assets'
import type { StaticAssetSession } from '../../../http-server/static-assets/types'
import type { ExtensionAssetCookie, ExtensionAssetCookieAdapter } from './index'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createExtensionAssetService } from './index'

const mockState = vi.hoisted(() => ({
  createStaticAssetService: vi.fn(),
}))

vi.mock('../../../http-server/static-assets', () => ({
  createStaticAssetService: mockState.createStaticAssetService,
}))

function createFakeCookieAdapter() {
  const setCookies: ExtensionAssetCookie[] = []
  const removedCookies: ExtensionAssetCookie[] = []

  return {
    adapter: {
      removeCookie: vi.fn(async (cookie) => {
        removedCookies.push(cookie)
      }),
      setCookie: vi.fn(async (cookie) => {
        setCookies.push(cookie)
      }),
    } satisfies ExtensionAssetCookieAdapter,
    removedCookies,
    setCookies,
  }
}

function createFakeServer(options: {
  baseUrl?: string
  createSessionResult?: StaticAssetSession
  revokeAllResult?: StaticAssetSession[]
  revokeByExtensionIdResult?: StaticAssetSession[]
  revokeByOwnerSessionIdResult?: StaticAssetSession[]
} = {}) {
  return {
    createSession: vi.fn(() => options.createSessionResult ?? createSession('asset-session-1')),
    getBaseUrl: vi.fn(() => options.baseUrl),
    key: 'static-assets',
    revokeAll: vi.fn(() => options.revokeAllResult ?? []),
    revokeByExtensionId: vi.fn(() => options.revokeByExtensionIdResult ?? []),
    revokeByOwnerSessionId: vi.fn(() => options.revokeByOwnerSessionIdResult ?? []),
    revokeSession: vi.fn((assetSessionId: string) => createSession(assetSessionId)),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  } satisfies StaticAssetService
}

function createSession(assetSessionId: string, extensionId = 'airi-plugin-game-chess'): StaticAssetSession {
  return {
    assetSessionId,
    cookieName: `airi_extension_asset_session_${assetSessionId}`,
    cookiePath: `/_airi/extensions/${extensionId}/sessions/${assetSessionId}/ui`,
    cookieValue: `cookie-value-${assetSessionId}`,
    expiresAt: 123_456,
  }
}

describe('createExtensionAssetService', () => {
  beforeEach(() => {
    mockState.createStaticAssetService.mockReset()
  })

  it('creates a cookie-backed asset session before returning the mounted URL', async () => {
    const server = createFakeServer({
      baseUrl: 'http://127.0.0.1:48123',
      createSessionResult: createSession('asset-session-1'),
    })
    const { adapter, setCookies } = createFakeCookieAdapter()
    mockState.createStaticAssetService.mockReturnValue(server)

    const service = createExtensionAssetService({
      cookieAdapter: adapter,
      getManifestEntryByExtensionId: () => new Map(),
    })

    const result = await service.createAssetSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'owner-session-1',
      pathPrefix: 'assets/',
      routeAssetPath: 'assets/app.js',
      ttlMs: 60_000,
      version: '1.0.0',
    })

    expect(server.createSession).toHaveBeenCalledWith({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'owner-session-1',
      pathPrefix: 'assets/',
      ttlMs: 60_000,
      version: '1.0.0',
    })
    expect(adapter.setCookie).toHaveBeenCalledOnce()
    expect(setCookies).toEqual([
      {
        expiresAt: 123_456,
        name: 'airi_extension_asset_session_asset-session-1',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui',
        value: 'cookie-value-asset-session-1',
      },
    ])
    expect(result).toEqual({
      assetSessionId: 'asset-session-1',
      cookie: setCookies[0],
      expiresAt: 123_456,
      url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui/assets/app.js',
    })
  })

  it('revokes the server session when base URL is missing before setting a cookie', async () => {
    const server = createFakeServer({
      baseUrl: undefined,
      createSessionResult: createSession('asset-session-2'),
    })
    const { adapter, setCookies } = createFakeCookieAdapter()
    mockState.createStaticAssetService.mockReturnValue(server)

    const service = createExtensionAssetService({
      cookieAdapter: adapter,
      getManifestEntryByExtensionId: () => new Map(),
    })

    await expect(service.createAssetSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'owner-session-1',
      pathPrefix: 'assets/',
      routeAssetPath: 'assets/app.js',
      ttlMs: 60_000,
      version: '1.0.0',
    })).rejects.toThrow('Extension asset server base URL is unavailable')

    expect(server.revokeSession).toHaveBeenCalledWith('asset-session-2')
    expect(adapter.setCookie).not.toHaveBeenCalled()
    expect(setCookies).toEqual([])
  })

  it('revokes the server session when route path or cookie setup fails', async () => {
    const server = createFakeServer({
      baseUrl: 'http://127.0.0.1:48123',
      createSessionResult: createSession('asset-session-3'),
    })
    const { adapter } = createFakeCookieAdapter()
    mockState.createStaticAssetService.mockReturnValue(server)
    const service = createExtensionAssetService({
      cookieAdapter: adapter,
      getManifestEntryByExtensionId: () => new Map(),
    })

    await expect(service.createAssetSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'owner-session-1',
      pathPrefix: '',
      routeAssetPath: '../secret.txt',
      ttlMs: 60_000,
      version: '1.0.0',
    })).rejects.toThrow('Extension asset session routeAssetPath must be a safe extension asset path')

    expect(server.revokeSession).toHaveBeenCalledWith('asset-session-3')
    expect(adapter.setCookie).not.toHaveBeenCalled()

    server.createSession.mockReturnValue(createSession('asset-session-4'))
    adapter.setCookie.mockRejectedValueOnce(new Error('cookie jar unavailable'))

    await expect(service.createAssetSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'owner-session-1',
      pathPrefix: 'assets/',
      routeAssetPath: 'assets/app.js',
      ttlMs: 60_000,
      version: '1.0.0',
    })).rejects.toThrow('cookie jar unavailable')

    expect(server.revokeSession).toHaveBeenCalledWith('asset-session-4')
  })

  it('removes cookies returned by asset, owner, plugin, and global revocation', async () => {
    const directSession = createSession('direct-asset-session')
    const ownerSession = createSession('owner-asset-session')
    const pluginSession = createSession('plugin-asset-session')
    const allSession = createSession('all-asset-session')
    const server = createFakeServer({
      baseUrl: 'http://127.0.0.1:48123',
      revokeAllResult: [allSession],
      revokeByExtensionIdResult: [pluginSession],
      revokeByOwnerSessionIdResult: [ownerSession],
    })
    server.revokeSession.mockReturnValue(directSession)
    const { adapter, removedCookies } = createFakeCookieAdapter()
    mockState.createStaticAssetService.mockReturnValue(server)

    const service = createExtensionAssetService({
      cookieAdapter: adapter,
      getManifestEntryByExtensionId: () => new Map(),
    })

    await service.revokeSession('direct-asset-session')
    await service.revokeByOwnerSessionId('owner-session-1')
    await service.revokeByExtensionId('airi-plugin-game-chess')
    await service.revokeAll()

    expect(server.revokeSession).toHaveBeenCalledWith('direct-asset-session')
    expect(server.revokeByOwnerSessionId).toHaveBeenCalledWith('owner-session-1')
    expect(server.revokeByExtensionId).toHaveBeenCalledWith('airi-plugin-game-chess')
    expect(server.revokeAll).toHaveBeenCalledOnce()
    expect(adapter.removeCookie).toHaveBeenCalledTimes(4)
    expect(removedCookies).toEqual([
      {
        expiresAt: 123_456,
        name: 'airi_extension_asset_session_direct-asset-session',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/direct-asset-session/ui',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/direct-asset-session/ui',
        value: 'cookie-value-direct-asset-session',
      },
      {
        expiresAt: 123_456,
        name: 'airi_extension_asset_session_owner-asset-session',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/owner-asset-session/ui',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/owner-asset-session/ui',
        value: 'cookie-value-owner-asset-session',
      },
      {
        expiresAt: 123_456,
        name: 'airi_extension_asset_session_plugin-asset-session',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/plugin-asset-session/ui',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/plugin-asset-session/ui',
        value: 'cookie-value-plugin-asset-session',
      },
      {
        expiresAt: 123_456,
        name: 'airi_extension_asset_session_all-asset-session',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/all-asset-session/ui',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/all-asset-session/ui',
        value: 'cookie-value-all-asset-session',
      },
    ])
  })

  it('revokes all sessions and removes cookies before stopping the server', async () => {
    const allSession = createSession('stop-asset-session')
    const server = createFakeServer({
      baseUrl: 'http://127.0.0.1:48123',
      revokeAllResult: [allSession],
    })
    const { adapter, removedCookies } = createFakeCookieAdapter()
    mockState.createStaticAssetService.mockReturnValue(server)

    const service = createExtensionAssetService({
      cookieAdapter: adapter,
      getManifestEntryByExtensionId: () => new Map(),
    })

    await service.stop()

    expect(server.revokeAll).toHaveBeenCalledOnce()
    expect(adapter.removeCookie).toHaveBeenCalledOnce()
    expect(server.stop).toHaveBeenCalledOnce()
    expect(removedCookies).toEqual([
      {
        expiresAt: 123_456,
        name: 'airi_extension_asset_session_stop-asset-session',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/stop-asset-session/ui',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/stop-asset-session/ui',
        value: 'cookie-value-stop-asset-session',
      },
    ])
  })
})
