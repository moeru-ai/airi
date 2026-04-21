import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createExtensionStaticAssetServer } from './index'
import { createExtensionAssetTokenStore } from './token-store'

describe('createExtensionStaticAssetServer', () => {
  const servers: Array<ReturnType<typeof createExtensionStaticAssetServer>> = []

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop()
      if (!server) {
        continue
      }
      await server.stop()
    }
  })

  it('accepts pathPrefix relative to /ui route segment', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'airi-extension-static-assets-'))
    await mkdir(join(rootDir, 'ui', 'assets'), { recursive: true })
    await writeFile(join(rootDir, 'ui', 'assets', 'app.js'), 'console.log("ok")\n')

    const extensionId = 'airi-plugin-game-chess'
    const version = '1.0.0'
    const tokenStore = createExtensionAssetTokenStore()
    const validateInputs: string[] = []
    const server = createExtensionStaticAssetServer({
      getManifestEntryByName: () => new Map([
        [extensionId, { rootDir, version }],
      ]),
      tokenStore: {
        ...tokenStore,
        validate(token, input) {
          validateInputs.push(input.assetPath)
          return tokenStore.validate(token, input)
        },
      },
    })
    servers.push(server)
    await server.start()

    const token = server.issueToken({
      extensionId,
      version,
      sessionId: 'session-1',
      pathPrefix: 'assets/',
      ttlMs: 60_000,
    })

    const baseUrl = server.getBaseUrl()
    expect(baseUrl).toBeTruthy()

    const response = await fetch(`${baseUrl}/_airi/extensions/${extensionId}/ui/assets/app.js?t=${token}`)
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
})
