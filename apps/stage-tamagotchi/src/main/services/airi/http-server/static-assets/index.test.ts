import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createStaticAssetService } from './index'
import { createStaticAssetSessionStore } from './session-store'

describe('createStaticAssetService', () => {
  const servers: Array<ReturnType<typeof createStaticAssetService>> = []
  const tempRoots: string[] = []

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop()
      if (!server) {
        continue
      }
      await server.stop()
    }

    for (const root of tempRoots) {
      await rm(root, { recursive: true, force: true })
    }
    tempRoots.length = 0
  })

  it('accepts pathPrefix relative to /ui route segment', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'airi-extension-static-assets-'))
    tempRoots.push(rootDir)
    await mkdir(join(rootDir, 'ui', 'assets'), { recursive: true })
    await writeFile(join(rootDir, 'ui', 'assets', 'app.js'), 'console.log("ok")\n')

    const extensionId = 'airi-plugin-game-chess'
    const version = '1.0.0'
    const sessionStore = createStaticAssetSessionStore()
    const validateInputs: string[] = []
    const server = createStaticAssetService({
      getManifestEntryByName: () => new Map([
        [extensionId, { rootDir, version }],
      ]),
      sessionStore: {
        ...sessionStore,
        validateRequest(input) {
          validateInputs.push(input.assetPath)
          return sessionStore.validateRequest(input)
        },
      },
    })
    servers.push(server)
    await server.start()

    const session = server.createSession({
      extensionId,
      version,
      ownerSessionId: 'session-1',
      pathPrefix: '',
      ttlMs: 60_000,
    })

    const baseUrl = server.getBaseUrl()
    expect(baseUrl).toBeTruthy()

    const response = await fetch(`${baseUrl}/_airi/extensions/${extensionId}/sessions/${session.assetSessionId}/ui/assets/app.js`, {
      headers: {
        cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    })
    const responseBody = await response.text()
    expect({
      status: response.status,
      validateInputs,
      responseBody,
    }).toEqual({
      status: 200,
      validateInputs: ['assets/app.js'],
      responseBody: 'console.log("ok")\n',
    })
  })

  it('serves HEAD requests with valid cookie auth refresh and empty body', async () => {
    let refreshedSessionId: string | undefined
    const { extensionId, server } = await createStartedAssetServer({
      onRefreshSession: (assetSessionId) => {
        refreshedSessionId = assetSessionId
      },
    })

    const session = server.createSession({
      extensionId,
      version: '1.0.0',
      ownerSessionId: 'session-1',
      pathPrefix: '',
      ttlMs: 60_000,
    })

    const response = await fetch(`${server.getBaseUrl()}/_airi/extensions/${extensionId}/sessions/${session.assetSessionId}/ui/assets/app.js`, {
      headers: {
        cookie: `${session.cookieName}=${session.cookieValue}`,
      },
      method: 'HEAD',
    })

    expect(response.status).toBe(200)
    expect(refreshedSessionId).toBe(session.assetSessionId)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('')
  })

  it('returns 405 with security headers for POST requests', async () => {
    const { extensionId, server } = await createStartedAssetServer()

    const response = await fetch(`${server.getBaseUrl()}/_airi/extensions/${extensionId}/sessions/session-1/ui/assets/app.js`, {
      method: 'POST',
    })

    expect(response.status).toBe(405)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('returns 401 with security headers when cookie is missing through the real server', async () => {
    const { extensionId, server } = await createStartedAssetServer()
    const session = server.createSession({
      extensionId,
      version: '1.0.0',
      ownerSessionId: 'session-1',
      pathPrefix: '',
      ttlMs: 60_000,
    })

    const response = await fetch(`${server.getBaseUrl()}/_airi/extensions/${extensionId}/sessions/${session.assetSessionId}/ui/assets/app.js`)

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('rejects a previously valid URL and cookie after revocation', async () => {
    const { extensionId, server } = await createStartedAssetServer()
    const session = server.createSession({
      extensionId,
      version: '1.0.0',
      ownerSessionId: 'session-1',
      pathPrefix: '',
      ttlMs: 60_000,
    })
    const url = `${server.getBaseUrl()}/_airi/extensions/${extensionId}/sessions/${session.assetSessionId}/ui/assets/app.js`
    const headers = {
      cookie: `${session.cookieName}=${session.cookieValue}`,
    }

    const validResponse = await fetch(url, { headers })
    await validResponse.arrayBuffer()
    server.revokeSession(session.assetSessionId)
    const revokedResponse = await fetch(url, { headers })

    expect(validResponse.status).toBe(200)
    expect(revokedResponse.status).toBe(401)
    expect(revokedResponse.headers.get('cache-control')).toBe('no-store')
    expect(revokedResponse.headers.get('referrer-policy')).toBe('no-referrer')
    expect(revokedResponse.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('returns 404 for missing in-root assets with a valid session', async () => {
    const { extensionId, server } = await createStartedAssetServer()
    const session = server.createSession({
      extensionId,
      version: '1.0.0',
      ownerSessionId: 'session-1',
      pathPrefix: '',
      ttlMs: 60_000,
    })

    const response = await fetch(`${server.getBaseUrl()}/_airi/extensions/${extensionId}/sessions/${session.assetSessionId}/ui/assets/missing.js`, {
      headers: {
        cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('uses the same manifest entry for auth and asset resolution within one request', async () => {
    const firstRootDir = await mkdtemp(join(tmpdir(), 'airi-extension-static-assets-'))
    const secondRootDir = await mkdtemp(join(tmpdir(), 'airi-extension-static-assets-'))
    tempRoots.push(firstRootDir, secondRootDir)
    await mkdir(join(firstRootDir, 'ui', 'assets'), { recursive: true })
    await mkdir(join(secondRootDir, 'ui', 'assets'), { recursive: true })
    await writeFile(join(firstRootDir, 'ui', 'assets', 'app.js'), 'console.log("first")\n')
    await writeFile(join(secondRootDir, 'ui', 'assets', 'app.js'), 'console.log("second")\n')

    const extensionId = 'airi-plugin-game-chess'
    const version = '1.0.0'
    const manifestEntries = [
      new Map([[extensionId, { rootDir: firstRootDir, version }]]),
      new Map([[extensionId, { rootDir: secondRootDir, version }]]),
    ]
    let manifestReadCount = 0
    const server = createStaticAssetService({
      getManifestEntryByName: () => manifestEntries[Math.min(manifestReadCount++, manifestEntries.length - 1)],
    })
    servers.push(server)
    await server.start()

    const session = server.createSession({
      extensionId,
      version,
      ownerSessionId: 'session-1',
      pathPrefix: '',
      ttlMs: 60_000,
    })

    const response = await fetch(`${server.getBaseUrl()}/_airi/extensions/${extensionId}/sessions/${session.assetSessionId}/ui/assets/app.js`, {
      headers: {
        cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('console.log("first")\n')
    expect(manifestReadCount).toBe(1)
  })

  async function createStartedAssetServer(options: {
    onRefreshSession?: (assetSessionId: string) => void
  } = {}) {
    const rootDir = await mkdtemp(join(tmpdir(), 'airi-extension-static-assets-'))
    tempRoots.push(rootDir)
    await mkdir(join(rootDir, 'ui', 'assets'), { recursive: true })
    await writeFile(join(rootDir, 'ui', 'assets', 'app.js'), 'console.log("ok")\n')

    const extensionId = 'airi-plugin-game-chess'
    const version = '1.0.0'
    const sessionStore = createStaticAssetSessionStore()
    const server = createStaticAssetService({
      getManifestEntryByName: () => new Map([
        [extensionId, { rootDir, version }],
      ]),
      sessionStore: {
        ...sessionStore,
        refreshSession(assetSessionId) {
          options.onRefreshSession?.(assetSessionId)
          return sessionStore.refreshSession(assetSessionId)
        },
      },
    })
    servers.push(server)
    await server.start()

    return { extensionId, rootDir, server, sessionStore, version }
  }
})
