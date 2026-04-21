import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { H3 } from 'h3'
import { toNodeHandler } from 'h3/node'
import { afterEach, describe, expect, it } from 'vitest'

import { HttpError } from '../../errors'
import { createExtensionStaticAssetRoute } from './route'

describe('createExtensionStaticAssetRoute', () => {
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

  it('returns 401 when token is missing', async () => {
    const app = new H3()
    app.get('/_airi/extensions/:extensionId/ui/**assetPath', createExtensionStaticAssetRoute({
      authorize: async () => ({
        ok: false,
        error: new HttpError({
          status: 401,
          code: 'TOKEN_MISSING',
          message: 'Unauthorized',
        }),
      }),
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

    const response = await fetch(`http://127.0.0.1:${port}/_airi/extensions/a/ui/index.html`)
    expect(response.status).toBe(401)
  })

  it('uses custom getType resolver and sets nosniff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-extension-static-assets-'))
    tempRoots.push(root)

    const wasmFilePath = join(root, 'module.wasm')
    await writeFile(wasmFilePath, new Uint8Array([0, 97, 115, 109]))

    let authorizeCalled = false
    const app = new H3()
    app.get('/_airi/extensions/:extensionId/ui/:assetPath', createExtensionStaticAssetRoute({
      authorize: async () => {
        authorizeCalled = true
        return { ok: true }
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

    const response = await fetch(`http://127.0.0.1:${port}/_airi/extensions/a/ui/module.wasm?t=test-token`)
    if (!authorizeCalled) {
      throw new Error(`Expected authorize to be called. response=${response.status} body=${await response.text()}`)
    }
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/wasm')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
