import type { OutputAsset } from 'rollup'
import type { Plugin, RenderBuiltAssetUrl, ResolvedConfig } from 'vite'

import type { UploadProvider } from './providers/types'

import { Buffer } from 'node:buffer'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cwd } from 'node:process'

export { createS3Provider } from './providers/s3'
export type { S3ProviderOptions } from './providers/s3'
export type { UploadProvider } from './providers/types'

type IncludeMatcher = RegExp | ((filename: string) => boolean)

export interface WarpDrivePluginOptions {
  provider: UploadProvider
  /**
   * Prefix to prepend before the asset filename when uploading and when rewriting URLs.
   * e.g. `remote-assets` will produce `remote-assets/assets/duckdb-eh-123.wasm`.
   */
  prefix?: string
  /**
   * Restrict which assets are rewritten/uploaded.
   */
  include?: IncludeMatcher[]
  /**
   * Optional extra predicate that receives filename + host info to decide inclusion.
   */
  includeBy?: (filename: string, ctx: { hostId?: string, hostType?: string }) => boolean
  /**
   * Optional content-type resolver. If omitted, uploads use the provider default.
   */
  contentTypeBy?: (filename: string) => Promise<string | undefined> | string | undefined
  /**
   * Emit a manifest with module id + URL for debugging.
   */
  manifest?: boolean
  /**
   * Delete the uploaded local asset from disk after upload completes. Enabled by default.
   */
  delete?: boolean
  /**
   * Clean the remote prefix before uploading (delete existing objects). Enabled by default.
   */
  clean?: boolean
  /**
   * When enabled, skip cleaning and uploading; emit manifest/rewrite URLs only.
   */
  dryRun?: boolean
  /**
   * Skip uploading assets that are already present and not modified. Enabled by default when supported.
   */
  skipNotModified?: boolean
}

export function WarpDrivePlugin(options: WarpDrivePluginOptions): Plugin {
  const include = options.include ?? []
  const prefix = normalizePrefix(options.prefix ?? 'remote-assets')
  const pluginName = 'proj-airi-warpdrive'
  const shouldDeleteLocalAsset = options.delete !== false
  const shouldCleanRemote = options.clean !== false
  const shouldSkipNotModified = options.skipNotModified !== false
  const isDryRun = options.dryRun === true

  const tracked = new Map<string, { key: string, url: string, hostId?: string, hostType?: string }>()
  const manifest: Array<{
    fileName: string
    url: string
    key: string
    hostId?: string
    hostType?: string
    size: number
  }> = []

  let resolvedConfig: ResolvedConfig | undefined
  let cleanedRemote = false
  const pendingUploads: Array<{
    fileName: string
    key: string
    localPath: string
    contentType?: string
  }> = []

  const shouldHandle = (filename: string, ctx: { hostId?: string, hostType?: string }) => {
    const includeMatch = include.some((matcher) => {
      if (matcher instanceof RegExp)
        return matcher.test(filename)

      return matcher(filename)
    })

    if (!includeMatch)
      return false
    if (options.includeBy)
      return options.includeBy(filename, ctx)

    return true
  }

  const renderBuiltUrl: RenderBuiltAssetUrl = (filename, ctx) => {
    if (!shouldHandle(filename, ctx))
      return
    if (!options.provider)
      return

    const key = prefix ? `${prefix}/${filename}` : filename
    const url = options.provider.getPublicUrl(key)

    tracked.set(filename, {
      key,
      url,
      hostId: ctx.hostId,
      hostType: ctx.hostType,
    })

    return url
  }

  return {
    name: pluginName,
    apply: 'build',
    enforce: 'post',
    config: () => {
      return {
        experimental: {
          renderBuiltUrl,
        },
      }
    },
    configResolved(config) {
      resolvedConfig = config
    },
    async generateBundle(_, bundle) {
      if (!resolvedConfig) {
        console.warn?.(`[${pluginName}] Vite config not resolved, skipping upload step`)
        return
      }
      if (!options.provider) {
        resolvedConfig.logger.warn(`[${pluginName}] no upload provider configured, skipping upload step`)
        return
      }

      const root = resolvedConfig.root || cwd()
      const outDir = resolve(root, resolvedConfig.build.outDir)

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'asset')
          continue

        const trackedMeta = tracked.get(fileName)
        if (!trackedMeta)
          continue

        const key = trackedMeta.key
        const url = trackedMeta.url
        const localPath = join(outDir, fileName)
        const size = getAssetSize(output)
        const contentType = await options.contentTypeBy?.(fileName)

        manifest.push({
          fileName,
          url,
          key,
          hostId: trackedMeta.hostId,
          hostType: trackedMeta.hostType,
          size,
        })

        pendingUploads.push({ fileName, key, localPath, contentType })
        resolvedConfig.logger.info(`[${pluginName}] scheduled uploading: ${fileName} -> ${key} (${size} bytes)`)
      }

      if (options.manifest && manifest.length) {
        this.emitFile({
          type: 'asset',
          fileName: 'remote-assets.manifest.json',
          source: JSON.stringify({ assets: manifest }, null, 2),
        })
      }
    },
    async closeBundle() {
      if (!resolvedConfig) {
        console.warn?.(`[${pluginName}] Vite config not resolved, skipping upload step`)
        return
      }
      if (!options.provider) {
        resolvedConfig.logger.warn(`[${pluginName}] no upload provider configured, skipping upload step`)
        return
      }
      if (!pendingUploads.length)
        return
      if (isDryRun) {
        resolvedConfig.logger.info(
          `[${pluginName}] dry run enabled; skipping clean/upload for ${pendingUploads.length} assets`,
        )
        return
      }

      if (shouldCleanRemote && !cleanedRemote) {
        if (!prefix) {
          resolvedConfig.logger.warn(`[${pluginName}] skipping clean step because no prefix provided`)
        }
        else if (typeof options.provider.cleanPrefix === 'function') {
          resolvedConfig.logger.info(`[${pluginName}] cleaning remote prefix: ${prefix}`)
          await options.provider.cleanPrefix(prefix)
          resolvedConfig.logger.info(`[${pluginName}] cleaned remote prefix: ${prefix}`)
          cleanedRemote = true
        }
        else {
          resolvedConfig.logger.warn(
            `[${pluginName}] clean is enabled but provider does not support prefix cleaning; skipping`,
          )
        }
      }

      resolvedConfig.logger.info(`[${pluginName}] uploading ${pendingUploads.length} assets to remote storage...`)
      const uploads: Array<Promise<void>> = []

      for (const { fileName, key, localPath, contentType } of pendingUploads) {
        uploads.push((async () => {
          if (shouldSkipNotModified && typeof options.provider.shouldSkipUpload === 'function') {
            try {
              const skip = await options.provider.shouldSkipUpload(localPath, key)
              if (skip) {
                resolvedConfig.logger.info(
                  `[${pluginName}] skipped upload (not modified): ${fileName} -> ${key}`,
                )
                if (shouldDeleteLocalAsset) {
                  try {
                    await rm(localPath, { force: true })
                    resolvedConfig.logger.info(`[${pluginName}] deleted local asset: ${fileName}`)
                  }
                  catch (error) {
                    resolvedConfig.logger.warn(`[${pluginName}] failed to delete local asset ${fileName}: ${error}`)
                  }
                }
                return
              }
            }
            catch (error) {
              resolvedConfig.logger.warn(
                `[${pluginName}] could not determine if upload should be skipped for ${fileName}: ${error}`,
              )
            }
          }
          try {
            await options.provider.upload(localPath, key, contentType)
          }
          catch (error) {
            resolvedConfig.logger.error(`[${pluginName}] upload failed, file: ${fileName} -> ${key}: ${error}`, { error })
            throw error
          }

          if (shouldDeleteLocalAsset) {
            try {
              await rm(localPath, { force: true })
              resolvedConfig.logger.info(`[${pluginName}] deleted local asset: ${fileName}`)
            }
            catch (error) {
              resolvedConfig.logger.warn(`[${pluginName}] failed to delete local asset ${fileName}: ${error}`)
            }
          }
        })())
      }

      await Promise.all(uploads)
      resolvedConfig.logger.info(`[${pluginName}] upload complete`)
    },
  }
}

function normalizePrefix(prefix: string) {
  return prefix.replace(/^\/*/, '').replace(/\/*$/, '')
}

function getAssetSize(asset: OutputAsset) {
  if (typeof asset.source === 'string')
    return Buffer.byteLength(asset.source)

  return asset.source?.byteLength ?? 0
}
