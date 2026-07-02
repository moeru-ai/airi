import type { Plugin, ResolvedConfig } from 'vite'

import { Buffer } from 'node:buffer'
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import { createLogger } from 'vite'

interface DownloadWithRetryOptions {
  cacheDir?: string
  parentDir?: false | string
  retries?: number
  retryDelayMs?: number
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function resolveOutputDirs(config: ResolvedConfig, options?: DownloadWithRetryOptions) {
  const cacheDirOption = options?.cacheDir ?? '.cache'
  const parentDirOption = options?.parentDir ?? config.publicDir ?? config.root

  const cacheDir = isAbsolute(cacheDirOption) ? cacheDirOption : resolve(config.root, cacheDirOption)
  const parentDir = parentDirOption === false
    ? config.root
    : isAbsolute(parentDirOption)
      ? parentDirOption
      : resolve(config.root, parentDirOption)

  return { cacheDir, parentDir }
}

async function fetchArrayBufferWithRetry(url: string, logger: ReturnType<typeof createLogger>, options?: DownloadWithRetryOptions) {
  const retries = Math.max(0, options?.retries ?? 3)
  const retryDelayMs = Math.max(0, options?.retryDelayMs ?? 1000)

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`download_failed:${response.status}:${response.statusText}:${url}`)
      }
      return await response.arrayBuffer()
    }
    catch (error) {
      if (attempt >= retries) {
        throw error
      }

      const retryInMs = retryDelayMs * (attempt + 1)
      logger.warn(`Download failed for ${url} (attempt ${attempt + 1}/${retries + 1}). Retrying in ${retryInMs}ms.`)
      await new Promise(resolveDelay => setTimeout(resolveDelay, retryInMs))
    }
  }

  throw new Error(`unreachable_retry_state:${url}`)
}

/**
 * Downloads a remote static asset during Vite config resolution with bounded retries.
 *
 * Use when:
 * - a build depends on a small set of remote demo assets
 * - transient CDN/TLS socket resets should not fail CI immediately
 *
 * Expects:
 * - stable destination paths inside the Vite app or shared asset tree
 * - remote content can be cached safely between builds
 *
 * Returns:
 * - a Vite plugin that populates cache/output paths before the build proceeds
 */
export function downloadWithRetry(url: string, filename: string, destination: string, options?: DownloadWithRetryOptions): Plugin {
  return {
    name: `download-with-retry-${filename}`,
    async configResolved(config) {
      const logger = createLogger()
      const { cacheDir, parentDir } = resolveOutputDirs(config, options)
      const cachedFile = join(cacheDir, destination, filename)
      const outputFile = join(parentDir, destination, filename)

      try {
        if (!(await exists(cachedFile))) {
          logger.info(`Downloading ${filename}...`)
          const stream = await fetchArrayBufferWithRetry(url, logger, options)
          await mkdir(join(cacheDir, destination), { recursive: true })
          await writeFile(cachedFile, Buffer.from(stream))
          logger.info(`${filename} downloaded.`)
        }
        else {
          logger.info(`${filename} already exists in cache.`)
        }

        if (await exists(outputFile)) {
          logger.info(`${filename} already exists in ${parentDir}.`)
          return
        }

        await mkdir(join(parentDir, destination), { recursive: true }).catch(() => {})
        await copyFile(cachedFile, outputFile)
        logger.info(`${filename} copied to ${parentDir}.`)
      }
      catch (error) {
        console.error(error)
        throw error
      }
    },
  }
}
