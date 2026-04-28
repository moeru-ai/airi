import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { H3 } from 'h3'
import { toNodeHandler } from 'h3/node'
import { afterEach, describe, expect, it } from 'vitest'

import { HttpError } from '../errors'
import { createStaticAssetRoute } from './route'
import { createStaticAssetSessionCookieName } from './session-store'

describe('createStaticAssetRoute', () => {
  let server: ReturnType<typeof createServer> | undefined
  const tempRoots: string[] = []

  afterEach(async () => {
    for (const root of tempRoots) {
      await rm(root, { recursive: true, force: true })
    }
    tempRoots.length = 0

    await new Promise<void>((resolve) => {
      if (!server) {
        resolve()
        return
      }

      server.close(() => resolve())
      server = undefined
    })
  })

  it('returns 401 when cookie is missing', async () => {
    const app = new H3()
    app.get('/_airi/extensions/**', createStaticAssetRoute({
      authorize: async () => ({
        ok: false,
        error: new HttpError({
          status: 401,
          code: 'COOKIE_MISSING',
          message: 'Unauthorized',
        }),
      }),
      refreshSession: () => undefined,
      resolveAsset: async () => ({
        ok: false,
        error: new HttpError({
          status: 404,
          code: 'NOT_FOUND',
          message: 'Not Found',
        }),
      }),
    }))

    server = createServer(toNodeHandler(app))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const response = await fetch(`http://127.0.0.1:${port}/_airi/extensions/a/sessions/s1/ui/index.html`)
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('returns 405 with security headers when method is not allowed', async () => {
    const app = new H3()
    app.use('/_airi/extensions/**', createStaticAssetRoute({
      authorize: async () => ({
        ok: false,
        error: new HttpError({
          status: 401,
          code: 'COOKIE_MISSING',
          message: 'Unauthorized',
        }),
      }),
      refreshSession: () => undefined,
      resolveAsset: async () => ({
        ok: false,
        error: new HttpError({
          status: 404,
          code: 'NOT_FOUND',
          message: 'Not Found',
        }),
      }),
    }))

    server = createServer(toNodeHandler(app))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const response = await fetch(`http://127.0.0.1:${port}/_airi/extensions/a/sessions/s1/ui/index.html`, {
      method: 'POST',
    })
    expect(response.status).toBe(405)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('uses custom getType resolver and sets nosniff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-extension-static-assets-'))
    tempRoots.push(root)

    const wasmFilePath = join(root, 'module.wasm')
    await writeFile(wasmFilePath, new Uint8Array([0, 97, 115, 109]))

    let authorizeCalled = false
    let authorizedCookieValue: string | undefined
    let refreshedSessionId: string | undefined
    const app = new H3()
    app.get('/_airi/extensions/**', createStaticAssetRoute({
      authorize: async ({ cookieValue }) => {
        authorizeCalled = true
        authorizedCookieValue = cookieValue
        return {
          ok: true,
          session: {
            assetSessionId: 's1',
            cookieName: createStaticAssetSessionCookieName('s1'),
            cookieValue: 'test-token',
            cookiePath: '/_airi/extensions/a/sessions/s1/ui',
            expiresAt: Date.now() + 1000,
          },
        }
      },
      refreshSession: (assetSessionId) => {
        refreshedSessionId = assetSessionId
        return undefined
      },
      resolveAsset: async () => ({
        ok: true,
        filePath: wasmFilePath,
        size: 4,
        mtime: Date.now(),
      }),
      getType: ext => ext === '.wasm' ? 'application/wasm' : undefined,
    }))

    server = createServer(toNodeHandler(app))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const response = await fetch(`http://127.0.0.1:${port}/_airi/extensions/a/sessions/s1/ui/module.wasm`, {
      headers: { cookie: `${createStaticAssetSessionCookieName('s1')}=test-token` },
    })
    if (!authorizeCalled) {
      throw new Error(`Expected authorize to be called. response=${response.status} body=${await response.text()}`)
    }
    expect(response.status).toBe(200)
    expect(authorizedCookieValue).toBe('test-token')
    expect(refreshedSessionId).toBe('s1')
    expect(response.headers.get('content-type')).toBe('application/wasm')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('serves HEAD requests with auth refresh and no response body', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-extension-static-assets-'))
    tempRoots.push(root)

    const wasmFilePath = join(root, 'module.wasm')
    await writeFile(wasmFilePath, new Uint8Array([0, 97, 115, 109]))

    let authorizeCalled = false
    let refreshedSessionId: string | undefined
    const app = new H3()
    app.use('/_airi/extensions/**', createStaticAssetRoute({
      authorize: async ({ cookieValue }) => {
        authorizeCalled = true
        expect(cookieValue).toBe('test-token')
        return {
          ok: true,
          session: {
            assetSessionId: 's1',
            cookieName: createStaticAssetSessionCookieName('s1'),
            cookieValue: 'test-token',
            cookiePath: '/_airi/extensions/a/sessions/s1/ui',
            expiresAt: Date.now() + 1000,
          },
        }
      },
      refreshSession: (assetSessionId) => {
        refreshedSessionId = assetSessionId
        return undefined
      },
      resolveAsset: async () => ({
        ok: true,
        filePath: wasmFilePath,
        size: 4,
        mtime: Date.now(),
      }),
      getType: ext => ext === '.wasm' ? 'application/wasm' : undefined,
    }))

    server = createServer(toNodeHandler(app))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const response = await fetch(`http://127.0.0.1:${port}/_airi/extensions/a/sessions/s1/ui/module.wasm`, {
      headers: { cookie: `${createStaticAssetSessionCookieName('s1')}=test-token` },
      method: 'HEAD',
    })
    expect(response.status).toBe(200)
    expect(authorizeCalled).toBe(true)
    expect(refreshedSessionId).toBe('s1')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('')
  })
})
