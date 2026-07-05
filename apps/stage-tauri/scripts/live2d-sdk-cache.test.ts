import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ensureLive2dSdk,
  LIVE2D_SDK_CORE_RELATIVE_PATH,
  LIVE2D_SDK_DIRECTORY,
  resolveLive2dSdkCacheDir,
  stageLive2dSdkFromCache,
} from './live2d-sdk-cache'

async function createCachedSdk(cacheDir: string, content = 'cached-sdk-core') {
  const cachedCore = join(cacheDir, LIVE2D_SDK_CORE_RELATIVE_PATH)

  await mkdir(dirname(cachedCore), { recursive: true })
  await writeFile(cachedCore, content)
}

function projectSdkCorePaths(root: string) {
  const sdkCorePath = join('assets', 'js', LIVE2D_SDK_DIRECTORY, LIVE2D_SDK_CORE_RELATIVE_PATH)

  return {
    cache: join(root, '.cache', sdkCorePath),
    public: join(root, 'public', sdkCorePath),
  }
}

describe('live2d sdk cache', () => {
  it('uses an explicit persistent cache directory when provided', () => {
    expect(resolveLive2dSdkCacheDir({ AIRI_LIVE2D_SDK_CACHE_DIR: '/tmp/airi-live2d-sdk' }, '/home/test')).toBe(
      '/tmp/airi-live2d-sdk',
    )
  })

  it('defaults to the user cache directory', () => {
    expect(resolveLive2dSdkCacheDir({}, '/home/test')).toBe(
      join('/home/test', '.cache', 'airi', 'live2d', LIVE2D_SDK_DIRECTORY),
    )
    expect(resolveLive2dSdkCacheDir({ XDG_CACHE_HOME: '/var/cache/test' }, '/home/test')).toBe(
      join('/var/cache/test', 'airi', 'live2d', LIVE2D_SDK_DIRECTORY),
    )
  })

  it('stages cached sdk files into project cache and public assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-stage-tauri-root-'))
    const cacheRoot = await mkdtemp(join(tmpdir(), 'airi-live2d-cache-'))
    const cacheDir = join(cacheRoot, LIVE2D_SDK_DIRECTORY)

    try {
      await createCachedSdk(cacheDir)

      await stageLive2dSdkFromCache({ root, cacheDir })

      const stagedPaths = projectSdkCorePaths(root)

      await expect(readFile(stagedPaths.cache, 'utf8')).resolves.toBe('cached-sdk-core')
      await expect(readFile(stagedPaths.public, 'utf8')).resolves.toBe('cached-sdk-core')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(cacheRoot, { recursive: true, force: true })
    }
  })

  it('does not download when the persistent cache already has the sdk core', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-stage-tauri-root-'))
    const cacheDir = await mkdtemp(join(tmpdir(), 'airi-live2d-cache-'))

    try {
      await createCachedSdk(cacheDir)

      await ensureLive2dSdk({
        root,
        cacheDir,
        downloadSdk: async () => {
          throw new Error('download should not run on cache hit')
        },
      })

      await expect(readFile(projectSdkCorePaths(root).public, 'utf8')).resolves.toBe('cached-sdk-core')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('downloads into the persistent cache before staging when the sdk core is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-stage-tauri-root-'))
    const cacheDir = await mkdtemp(join(tmpdir(), 'airi-live2d-cache-'))

    try {
      await ensureLive2dSdk({
        root,
        cacheDir,
        downloadSdk: async (targetCacheDir) => {
          await createCachedSdk(targetCacheDir, 'downloaded-sdk-core')
        },
      })

      const stagedPaths = projectSdkCorePaths(root)

      await expect(readFile(join(cacheDir, LIVE2D_SDK_CORE_RELATIVE_PATH), 'utf8')).resolves.toBe('downloaded-sdk-core')
      await expect(readFile(stagedPaths.cache, 'utf8')).resolves.toBe('downloaded-sdk-core')
      await expect(readFile(stagedPaths.public, 'utf8')).resolves.toBe('downloaded-sdk-core')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(cacheDir, { recursive: true, force: true })
    }
  })
})
