import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
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
      await rm(root, { force: true, recursive: true })
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
      assetPath: 'dist/ui/index.html',
      assetSessionId: 'asset-session-1',
      extensionId: 'airi-plugin-game-chess',
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
      assetPath: 'dist/ui/index.html',
      assetSessionId: 'asset-session-1',
      extensionId: 'airi-plugin-game-chess',
    })).toBe('/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui/dist/ui/index.html')
    expect(buildMountedStaticAssetPath({
      assetPath: 'dist/ui/file name.html',
      assetSessionId: 'asset-session-1',
      extensionId: 'airi-plugin-game-chess',
    })).toBe('/_airi/extensions/airi-plugin-game-chess/sessions/asset-session-1/ui/dist/ui/file%20name.html')
    expect(buildMountedStaticAssetPath({
      assetPath: 'dist/ui/index.html',
      assetSessionId: 'asset-session-1',
      extensionId: 'bad/id',
    })).toBeUndefined()
    expect(buildMountedStaticAssetPath({
      assetPath: 'dist/ui/index.html',
      assetSessionId: 'bad session',
      extensionId: 'airi-plugin-game-chess',
    })).toBeUndefined()
  })

  it('resolves only files inside plugin root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-plugin-assets-'))
    tempRoots.push(root)

    await mkdir(join(root, 'dist', 'ui'), { recursive: true })
    await writeFile(join(root, 'dist', 'ui', 'index.html'), '<html></html>')

    await expect(resolveStaticAssetFilePath(root, 'dist/ui/index.html')).resolves.toContain('dist/ui/index.html')
    await expect(resolveStaticAssetFilePath(root, '../outside.txt')).resolves.toBeUndefined()
  })

  it('rejects symlinked plugin asset files that resolve outside plugin root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-plugin-assets-'))
    const outsideRoot = await mkdtemp(join(tmpdir(), 'airi-plugin-assets-outside-'))
    tempRoots.push(root, outsideRoot)

    const outsideFile = join(outsideRoot, 'secret.txt')
    await writeFile(outsideFile, 'secret')
    await symlink(outsideFile, join(root, 'link-name'))

    await expect(resolveStaticAssetFilePath(root, 'link-name')).resolves.toBeUndefined()
  })
})
