import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { Entry, ZipFile } from 'yauzl'
import { fromBuffer } from 'yauzl'

import type { Plugin } from 'vite'

export const LIVE2D_SDK_DIRECTORY = 'CubismSdkForWeb-5-r.3'
export const LIVE2D_SDK_CORE_RELATIVE_PATH = join('Core', 'live2dcubismcore.min.js')

const DEFAULT_LIVE2D_SDK_URL = 'https://cubism.live2d.com/sdk-web/bin/CubismSdkForWeb-5-r.3.zip'
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000

type Environment = Record<string, string | undefined>

interface Live2dSdkLogger {
  info(message: string): void
}

export interface StageLive2dSdkFromCacheOptions {
  root: string
  cacheDir: string
}

export interface EnsureLive2dSdkOptions {
  root: string
  cacheDir?: string
  env?: Environment
  from?: string
  homeDir?: string
  logger?: Live2dSdkLogger
  timeoutMs?: number
  downloadSdk?: (cacheDir: string) => Promise<void>
}

export interface Live2dSdkCacheOptions {
  cacheDir?: string
  from?: string
  timeoutMs?: number
}

interface DownloadAndExtractLive2dSdkOptions {
  cacheDir: string
  from: string
  logger?: Live2dSdkLogger
  timeoutMs: number
}

export function resolveLive2dSdkCacheDir(env: Environment = process.env, homeDir = homedir()): string {
  if (env.AIRI_LIVE2D_SDK_CACHE_DIR) {
    return env.AIRI_LIVE2D_SDK_CACHE_DIR
  }

  const userCacheRoot = env.XDG_CACHE_HOME || join(homeDir, '.cache')

  return join(userCacheRoot, 'airi', 'live2d', LIVE2D_SDK_DIRECTORY)
}

export async function stageLive2dSdkFromCache(options: StageLive2dSdkFromCacheOptions): Promise<void> {
  const sourceCorePath = live2dSdkCorePath(options.cacheDir)

  if (!(await exists(sourceCorePath))) {
    throw new Error(`Live2D SDK cache is missing ${sourceCorePath}`)
  }

  const projectSdkDir = join(options.root, '.cache', 'assets', 'js', LIVE2D_SDK_DIRECTORY)
  const publicCorePath = join(
    options.root,
    'public',
    'assets',
    'js',
    LIVE2D_SDK_DIRECTORY,
    LIVE2D_SDK_CORE_RELATIVE_PATH,
  )

  await rm(projectSdkDir, { recursive: true, force: true })
  await mkdir(dirname(projectSdkDir), { recursive: true })
  await cp(options.cacheDir, projectSdkDir, { recursive: true, force: true })

  await mkdir(dirname(publicCorePath), { recursive: true })
  await copyFile(sourceCorePath, publicCorePath)
}

export async function ensureLive2dSdk(options: EnsureLive2dSdkOptions): Promise<void> {
  const cacheDir = options.cacheDir || resolveLive2dSdkCacheDir(options.env, options.homeDir)

  if (!(await hasLive2dSdkCore(cacheDir))) {
    options.logger?.info('Downloading Cubism SDK...')
    await rm(cacheDir, { recursive: true, force: true })

    const downloadSdk =
      options.downloadSdk ||
      ((targetCacheDir: string) =>
        downloadAndExtractLive2dSdk({
          cacheDir: targetCacheDir,
          from: options.from || DEFAULT_LIVE2D_SDK_URL,
          logger: options.logger,
          timeoutMs: options.timeoutMs || DEFAULT_DOWNLOAD_TIMEOUT_MS,
        }))

    await downloadSdk(cacheDir)

    if (!(await hasLive2dSdkCore(cacheDir))) {
      throw new Error(`Live2D SDK download did not create ${live2dSdkCorePath(cacheDir)}`)
    }
  }

  await stageLive2dSdkFromCache({ root: options.root, cacheDir })
}

export function Live2dSdkCache(options: Live2dSdkCacheOptions = {}): Plugin {
  return {
    name: 'stage-tauri-live2d-sdk-cache',
    async configResolved(config) {
      await ensureLive2dSdk({
        root: config.root,
        cacheDir: options.cacheDir,
        env: process.env,
        from: options.from,
        logger: config.logger,
        timeoutMs: options.timeoutMs,
      })
    },
  }
}

async function downloadAndExtractLive2dSdk(options: DownloadAndExtractLive2dSdkOptions): Promise<void> {
  const archive = await fetchArchive(options.from, options.timeoutMs)
  const cacheParent = dirname(options.cacheDir)

  await mkdir(cacheParent, { recursive: true })

  const tempRoot = await mkdtemp(join(cacheParent, '.download-'))

  try {
    options.logger?.info('Unzipping Cubism SDK...')
    await unzip(archive, tempRoot)

    const extractedDir = join(tempRoot, LIVE2D_SDK_DIRECTORY)

    if (!(await hasLive2dSdkCore(extractedDir))) {
      throw new Error(`Cubism SDK archive did not contain ${LIVE2D_SDK_CORE_RELATIVE_PATH}`)
    }

    await rm(options.cacheDir, { recursive: true, force: true })
    await moveDirectory(extractedDir, options.cacheDir)
    options.logger?.info(`Cubism SDK cached at ${options.cacheDir}`)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

async function fetchArchive(from: string, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(from, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Failed to download Cubism SDK from ${from}: ${response.status} ${response.statusText}`)
    }

    return Buffer.from(await response.arrayBuffer())
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function unzip(buffer: Buffer, target: string): Promise<void> {
  await mkdir(target, { recursive: true })

  await new Promise<void>((resolvePromise, rejectPromise) => {
    fromBuffer(buffer, { lazyEntries: true }, (error, zipFile) => {
      if (error) {
        rejectPromise(error)
        return
      }

      zipFile.on('entry', (entry) => {
        void extractZipEntry(zipFile, entry, target)
          .then(() => zipFile.readEntry())
          .catch((entryError) => {
            zipFile.close()
            rejectPromise(entryError)
          })
      })

      zipFile.on('end', resolvePromise)
      zipFile.on('error', rejectPromise)
      zipFile.readEntry()
    })
  })
}

async function extractZipEntry(zipFile: ZipFile, entry: Entry, target: string): Promise<void> {
  const targetPath = resolveZipEntryTarget(target, entry.fileName)

  if (entry.fileName.endsWith('/')) {
    await mkdir(targetPath, { recursive: true })
    return
  }

  await mkdir(dirname(targetPath), { recursive: true })

  const readStream = await openZipEntryReadStream(zipFile, entry)

  await pipeline(readStream, createWriteStream(targetPath))
}

function openZipEntryReadStream(zipFile: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolvePromise, rejectPromise) => {
    zipFile.openReadStream(entry, (error, readStream) => {
      if (error) {
        rejectPromise(error)
        return
      }

      resolvePromise(readStream)
    })
  })
}

function resolveZipEntryTarget(target: string, entryName: string): string {
  const targetPath = resolve(target, entryName)
  const targetRelativePath = relative(target, targetPath)

  if (targetRelativePath.startsWith('..') || isAbsolute(targetRelativePath)) {
    throw new Error(`Cubism SDK archive contains unsafe path: ${entryName}`)
  }

  return targetPath
}

async function moveDirectory(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'EXDEV') {
      throw error
    }

    await cp(from, to, { recursive: true, force: true })
    await rm(from, { recursive: true, force: true })
  }
}

async function hasLive2dSdkCore(cacheDir: string): Promise<boolean> {
  return exists(live2dSdkCorePath(cacheDir))
}

async function exists(path: string): Promise<boolean> {
  try {
    const result = await stat(path)

    return result.isFile() || result.isDirectory()
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

function live2dSdkCorePath(cacheDir: string): string {
  return join(cacheDir, LIVE2D_SDK_CORE_RELATIVE_PATH)
}

function isErrnoException(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
}
