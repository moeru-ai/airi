import type { StaticAssetService } from '../../../http-server/static-assets'
import type { StaticAssetSession } from '../../../http-server/static-assets/types'
import type { PluginAssetCookie, PluginAssetCookieAdapter } from './index'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPluginAssetService } from './index'

const mockState = vi.hoisted(() => ({
  createStaticAssetService: vi.fn(),
}))

vi.mock('../../../http-server/static-assets', () => ({
  createStaticAssetService: mockState.createStaticAssetService,
}))

function createSession(assetSessionId: string, extensionId = 'airi-plugin-game-chess'): StaticAssetSession {
  return {
    assetSessionId,
    cookieName: `airi_extension_asset_session_${assetSessionId}`,
    cookieValue: `cookie-value-${assetSessionId}`,
    cookiePath: `/_airi/extensions/${extensionId}/sessions/${assetSessionId}/ui`,
    expiresAt: 123_456,
  }
}

function createFakeServer(options: {
  baseUrl?: string
  createSessionResult?: StaticAssetSession
  revokeByOwnerSessionIdResult?: StaticAssetSession[]
  revokeByExtensionIdResult?: StaticAssetSession[]
  revokeAllResult?: StaticAssetSession[]
} = {}) {
  return {
    key: 'static-assets',
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    getBaseUrl: vi.fn(() => options.baseUrl),
    createSession: vi.fn(() => options.createSessionResult ?? createSession('asset-session-1')),
    revokeSession: vi.fn((assetSessionId: string) => createSession(assetSessionId)),
    revokeByOwnerSessionId: vi.fn(() => options.revokeByOwnerSessionIdResult ?? []),
    revokeByExtensionId: vi.fn(() => options.revokeByExtensionIdResult ?? []),
    revokeAll: vi.fn(() => options.revokeAllResult ?? []),
  } satisfies StaticAssetService
}

function createFakeCookieAdapter() {
  const setCookies: PluginAssetCookie[] = []
  const removedCookies: PluginAssetCookie[] = []

  return {
    adapter: {
      setCookie: vi.fn(async (cookie) => {
        setCookies.push(cookie)
      }),
      removeCookie: vi.fn(async (cookie) => {
        removedCookies.push(cookie)
      }),
    } satisfies PluginAssetCookieAdapter,
    removedCookies,
    setCookies,
  }
}

describe('createPluginAssetService', () => {
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

    const service = createPluginAssetService({
      getManifestEntryByName: () => new Map(),
      cookieAdapter: adapter,
    })

    const result = await service.createAssetSession({
      pluginId: 'airi-plugin-game-chess',
      version: '1.0.0',
      ownerSessionId: 'owner-session-1',
      routeAssetPath: 'assets/app.js',
      pathPrefix: 'assets/',
      ttlMs: 60_000,
    })

    expect(server.createSession).toHaveBeenCalledWith({
      extensionId: 'airi-plugin-game-chess',
      version: '1.0.0',
      ownerSessionId: 'owner-session-1',
      pathPrefix: 'assets/',
      ttlMs: 60_000,
    })
    expect(adapter.setCookie).toHaveBeenCalledOnce()
    expect(setCookies).toEqual([
      {
        name: 'airi_extension_asset_session_asset-session-1',
        value: 'cookie-value-asset-session-1',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui',
        expiresAt: 123_456,
      },
    ])
    expect(result).toEqual({
      url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui/assets/app.js',
      assetSessionId: 'asset-session-1',
      cookie: setCookies[0],
      expiresAt: 123_456,
    })
  })

  it('revokes the server session when base URL is missing before setting a cookie', async () => {
    const server = createFakeServer({
      baseUrl: undefined,
      createSessionResult: createSession('asset-session-2'),
    })
    const { adapter, setCookies } = createFakeCookieAdapter()
    mockState.createStaticAssetService.mockReturnValue(server)

    const service = createPluginAssetService({
      getManifestEntryByName: () => new Map(),
      cookieAdapter: adapter,
    })

    await expect(service.createAssetSession({
      pluginId: 'airi-plugin-game-chess',
      version: '1.0.0',
      ownerSessionId: 'owner-session-1',
      routeAssetPath: 'assets/app.js',
      pathPrefix: 'assets/',
      ttlMs: 60_000,
    })).rejects.toThrow('Plugin asset server base URL is unavailable')

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
    const service = createPluginAssetService({
      getManifestEntryByName: () => new Map(),
      cookieAdapter: adapter,
    })

    await expect(service.createAssetSession({
      pluginId: 'airi-plugin-game-chess',
      version: '1.0.0',
      ownerSessionId: 'owner-session-1',
      routeAssetPath: '../secret.txt',
      pathPrefix: '',
      ttlMs: 60_000,
    })).rejects.toThrow('Plugin asset session routeAssetPath must be a safe plugin asset path')

    expect(server.revokeSession).toHaveBeenCalledWith('asset-session-3')
    expect(adapter.setCookie).not.toHaveBeenCalled()

    server.createSession.mockReturnValue(createSession('asset-session-4'))
    adapter.setCookie.mockRejectedValueOnce(new Error('cookie jar unavailable'))

    await expect(service.createAssetSession({
      pluginId: 'airi-plugin-game-chess',
      version: '1.0.0',
      ownerSessionId: 'owner-session-1',
      routeAssetPath: 'assets/app.js',
      pathPrefix: 'assets/',
      ttlMs: 60_000,
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
      revokeByOwnerSessionIdResult: [ownerSession],
      revokeByExtensionIdResult: [pluginSession],
      revokeAllResult: [allSession],
    })
    server.revokeSession.mockReturnValue(directSession)
    const { adapter, removedCookies } = createFakeCookieAdapter()
    mockState.createStaticAssetService.mockReturnValue(server)

    const service = createPluginAssetService({
      getManifestEntryByName: () => new Map(),
      cookieAdapter: adapter,
    })

    await service.revokeSession('direct-asset-session')
    await service.revokeByOwnerSessionId('owner-session-1')
    await service.revokeByPluginId('airi-plugin-game-chess')
    await service.revokeAll()

    expect(server.revokeSession).toHaveBeenCalledWith('direct-asset-session')
    expect(server.revokeByOwnerSessionId).toHaveBeenCalledWith('owner-session-1')
    expect(server.revokeByExtensionId).toHaveBeenCalledWith('airi-plugin-game-chess')
    expect(server.revokeAll).toHaveBeenCalledOnce()
    expect(adapter.removeCookie).toHaveBeenCalledTimes(4)
    expect(removedCookies).toEqual([
      {
        name: 'airi_extension_asset_session_direct-asset-session',
        value: 'cookie-value-direct-asset-session',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/direct-asset-session/ui',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/direct-asset-session/ui',
        expiresAt: 123_456,
      },
      {
        name: 'airi_extension_asset_session_owner-asset-session',
        value: 'cookie-value-owner-asset-session',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/owner-asset-session/ui',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/owner-asset-session/ui',
        expiresAt: 123_456,
      },
      {
        name: 'airi_extension_asset_session_plugin-asset-session',
        value: 'cookie-value-plugin-asset-session',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/plugin-asset-session/ui',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/plugin-asset-session/ui',
        expiresAt: 123_456,
      },
      {
        name: 'airi_extension_asset_session_all-asset-session',
        value: 'cookie-value-all-asset-session',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/all-asset-session/ui',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/all-asset-session/ui',
        expiresAt: 123_456,
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

    const service = createPluginAssetService({
      getManifestEntryByName: () => new Map(),
      cookieAdapter: adapter,
    })

    await service.stop()

    expect(server.revokeAll).toHaveBeenCalledOnce()
    expect(adapter.removeCookie).toHaveBeenCalledOnce()
    expect(server.stop).toHaveBeenCalledOnce()
    expect(removedCookies).toEqual([
      {
        name: 'airi_extension_asset_session_stop-asset-session',
        value: 'cookie-value-stop-asset-session',
        url: 'http://127.0.0.1:48123/_airi/extensions/airi-plugin-game-chess/sessions/stop-asset-session/ui',
        path: '/_airi/extensions/airi-plugin-game-chess/sessions/stop-asset-session/ui',
        expiresAt: 123_456,
      },
    ])
  })
})
