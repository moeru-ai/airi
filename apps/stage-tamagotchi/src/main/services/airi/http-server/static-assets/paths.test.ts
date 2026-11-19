import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildMountedStaticAssetPath,
  normalizeStaticAssetPath,
  parseStaticAssetRequestPath,
  resolveStaticAssetFilePath,
} from './paths'

describe('static asset paths', () => {
  const tempRoots: string[] = []

  afterEach(async () => {
    for (const root of tempRoots) {
      await rm(root, { recursive: true, force: true })
    }
    tempRoots.length = 0
  })

  it('normalizes valid asset paths and rejects traversal-like segments', () => {
    expect(normalizeStaticAssetPath('dist/ui/index.html')).toBe('dist/ui/index.html')
    expect(normalizeStaticAssetPath('./dist/ui/index.html')).toBeUndefined()
    expect(normalizeStaticAssetPath('../secret.txt')).toBeUndefined()
    expect(normalizeStaticAssetPath('dist/../ui/index.html')).toBeUndefined()
  })

  it('parses session-scoped mounted plugin request path and rejects malformed routes', () => {
    expect(parseStaticAssetRequestPath('/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui/dist/ui/index.html')).toEqual({
      extensionId: 'airi-plugin-game-chess',
      assetSessionId: 'asset-session-1',
      assetPath: 'dist/ui/index.html',
    })
    expect(parseStaticAssetRequestPath('/_airi/extensions/airi-plugin-game-chess/ui/dist/ui/index.html')).toBeUndefined()
    expect(parseStaticAssetRequestPath('/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui/../../etc/passwd')).toBeUndefined()
    expect(parseStaticAssetRequestPath('/_airi/extensions//sessions/asset-session-1/ui/index.html')).toBeUndefined()
    expect(parseStaticAssetRequestPath('/_airi/extensions/airi-plugin-game-chess//sessions/asset-session-1/ui/index.html')).toBeUndefined()
    expect(parseStaticAssetRequestPath('/_airi/extensions/airi-plugin-game-chess/sessions//ui/index.html')).toBeUndefined()
    expect(parseStaticAssetRequestPath('/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1//ui/index.html')).toBeUndefined()
    expect(parseStaticAssetRequestPath('/_airi/extensions/p/sessions/s/ui/safe%2F..%2Fsecret.txt')).toBeUndefined()
    expect(parseStaticAssetRequestPath('/_airi/extensions/p%/sessions/s/ui/index.html')).toBeUndefined()
  })

  it('builds session-scoped mounted asset path with encoded segments', () => {
    expect(buildMountedStaticAssetPath({
      extensionId: 'airi-plugin-game-chess',
      assetSessionId: 'asset-session-1',
      assetPath: 'dist/ui/index.html',
    })).toBe('/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui/dist/ui/index.html')
    expect(buildMountedStaticAssetPath({
      extensionId: 'airi-plugin-game-chess',
      assetSessionId: 'asset-session-1',
      assetPath: 'dist/ui/file name.html',
    })).toBe('/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui/dist/ui/file%20name.html')
    expect(buildMountedStaticAssetPath({
      extensionId: 'bad/id',
      assetSessionId: 'asset-session-1',
      assetPath: 'dist/ui/index.html',
    })).toBeUndefined()
    expect(buildMountedStaticAssetPath({
      extensionId: 'airi-plugin-game-chess',
      assetSessionId: 'bad session',
      assetPath: 'dist/ui/index.html',
    })).toBeUndefined()
  })

  it('resolves only files inside plugin root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-plugin-assets-'))
    tempRoots.push(root)

    await mkdir(join(root, 'dist', 'ui'), { recursive: true })
    await writeFile(join(root, 'dist', 'ui', 'index.html'), '<html></html>')

    // The resolver returns the real path. A temporary directory can be under a link, for example `/var` on macOS.
    await expect(resolveStaticAssetFilePath(root, 'dist/ui/index.html')).resolves.toBe(join(await realpath(root), 'dist', 'ui', 'index.html'))
    await expect(resolveStaticAssetFilePath(root, '../outside.txt')).resolves.toBeUndefined()
  })

  it('rejects plugin assets reached through a directory link outside the plugin root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-plugin-assets-'))
    const outsideRoot = await mkdtemp(join(tmpdir(), 'airi-plugin-assets-outside-'))
    tempRoots.push(root, outsideRoot)

    const outsideFile = join(outsideRoot, 'secret.txt')
    await writeFile(outsideFile, 'secret')
    await symlink(outsideRoot, join(root, 'link-name'), 'junction')

    await expect(resolveStaticAssetFilePath(root, 'link-name/secret.txt')).resolves.toBeUndefined()
  })
})
