import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildMountedPluginAssetPath,
  normalizePluginAssetPath,
  parsePluginAssetRequestPath,
  resolvePluginAssetFilePath,
} from './asset-mount'

describe('asset-mount', () => {
  const tempRoots: string[] = []

  afterEach(async () => {
    for (const root of tempRoots) {
      await rm(root, { recursive: true, force: true })
    }
    tempRoots.length = 0
  })

  it('normalizes valid asset paths and rejects traversal-like segments', () => {
    expect(normalizePluginAssetPath('dist/ui/index.html')).toBe('dist/ui/index.html')
    expect(normalizePluginAssetPath('./dist/ui/index.html')).toBeUndefined()
    expect(normalizePluginAssetPath('../secret.txt')).toBeUndefined()
    expect(normalizePluginAssetPath('dist/../ui/index.html')).toBeUndefined()
  })

  it('parses mounted plugin request path and rejects malformed routes', () => {
    expect(parsePluginAssetRequestPath('/_airi/extensions/airi-plugin-game-chess/ui/dist/ui/index.html')).toEqual({
      extensionId: 'airi-plugin-game-chess',
      assetPath: 'dist/ui/index.html',
    })
    expect(parsePluginAssetRequestPath('/_airi/extensions/airi-plugin-game-chess/ui/../../etc/passwd')).toBeUndefined()
    expect(parsePluginAssetRequestPath('/_airi/extensions//ui/index.html')).toBeUndefined()
  })

  it('builds mounted asset path with encoded segments', () => {
    expect(buildMountedPluginAssetPath({
      extensionId: 'airi-plugin-game-chess',
      assetPath: 'dist/ui/index.html',
    })).toBe('/_airi/extensions/airi-plugin-game-chess/ui/dist/ui/index.html')
  })

  it('resolves only files inside plugin root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-plugin-assets-'))
    tempRoots.push(root)

    await mkdir(join(root, 'dist', 'ui'), { recursive: true })
    await writeFile(join(root, 'dist', 'ui', 'index.html'), '<html></html>')

    await expect(resolvePluginAssetFilePath(root, 'dist/ui/index.html')).resolves.toContain('dist/ui/index.html')
    await expect(resolvePluginAssetFilePath(root, '../outside.txt')).resolves.toBeUndefined()
  })
})
