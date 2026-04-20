import type { ServerManager } from '../../server-manager/types'
import type { ExtensionAssetTokenStore } from './types'

import { stat } from 'node:fs/promises'

import { H3 } from 'h3'

import {
  normalizePluginAssetPath,
  resolvePluginAssetFilePath,
} from '../../../plugins/asset-mount'
import { HttpError } from '../../errors'
import { createH3Server } from '../../server'
import { createExtensionStaticAssetRoute } from './route'
import { createExtensionAssetTokenStore } from './token-store'

export interface ExtensionStaticAssetManifestEntry {
  rootDir: string
  version: string
}

export interface ExtensionStaticAssetServer extends ServerManager {
  getBaseUrl: () => string | undefined
  issueToken: ExtensionAssetTokenStore['issue']
  revokeByExtensionId: ExtensionAssetTokenStore['revokeByExtensionId']
  revokeAll: ExtensionAssetTokenStore['revokeAll']
}

/**
 * Creates the standalone extension static asset server.
 *
 * Use when:
 * - Main process must serve plugin iframe assets via local loopback HTTP
 * - Tokenized auth is required for all plugin asset requests
 *
 * Expects:
 * - `getManifestEntryByName` returns up-to-date plugin root/version map
 *
 * Returns:
 * - Lifecycle service with token issue/revoke APIs and local base URL getter
 */
export function createExtensionStaticAssetServer(options: {
  getManifestEntryByName: () => Map<string, ExtensionStaticAssetManifestEntry>
  host?: string
  tokenStore?: ExtensionAssetTokenStore
  getType?: (ext: string) => string | undefined
}): ExtensionStaticAssetServer {
  const host = options.host ?? '127.0.0.1'
  const tokenStore = options.tokenStore ?? createExtensionAssetTokenStore()
  const getType = options.getType ?? defaultExtensionAssetMimeTypeResolver

  const app = new H3()
  const serverLifecycle = createH3Server({ app, host })

  app.get('/_airi/extensions/**', createExtensionStaticAssetRoute({
    getType,
    authorize: async ({ token, extensionId, assetPath }) => {
      const entry = options.getManifestEntryByName().get(extensionId)
      if (!entry) {
        return {
          ok: false,
          error: new HttpError({
            status: 401,
            code: 'EXTENSION_ASSET_EXTENSION_NOT_REGISTERED',
            message: 'Unauthorized',
            reason: 'extension manifest entry does not exist for requested extensionId',
          }),
        }
      }

      return tokenStore.validate(token, {
        extensionId,
        version: entry.version,
        assetPath,
      })
    },
    resolveAsset: async ({ extensionId, assetPath }) => {
      const entry = options.getManifestEntryByName().get(extensionId)
      if (!entry) {
        return {
          ok: false,
          error: new HttpError({
            status: 404,
            code: 'EXTENSION_ASSET_EXTENSION_NOT_FOUND',
            message: 'Not Found',
            reason: 'extension manifest entry does not exist for requested extensionId',
          }),
        }
      }

      const normalizedAssetPath = normalizePluginAssetPath(assetPath)
      if (!normalizedAssetPath) {
        return {
          ok: false,
          error: new HttpError({
            status: 400,
            code: 'EXTENSION_ASSET_PATH_INVALID',
            message: 'Bad Request',
            reason: 'asset path could not be normalized',
          }),
        }
      }

      const fullAssetPath = `ui/${normalizedAssetPath}`
      const filePath = await resolvePluginAssetFilePath(entry.rootDir, fullAssetPath)
      if (!filePath) {
        return {
          ok: false,
          error: new HttpError({
            status: 400,
            code: 'EXTENSION_ASSET_PATH_RESOLVE_FAILED',
            message: 'Bad Request',
            reason: 'resolved asset path is outside extension root',
          }),
        }
      }

      try {
        const fileStats = await stat(filePath)
        if (!fileStats.isFile()) {
          return {
            ok: false,
            error: new HttpError({
              status: 404,
              code: 'EXTENSION_ASSET_NOT_FILE',
              message: 'Not Found',
              reason: 'resolved path exists but is not a file',
            }),
          }
        }

        return {
          ok: true,
          filePath,
          size: fileStats.size,
          mtime: fileStats.mtimeMs,
        }
      }
      catch {
        return {
          ok: false,
          error: new HttpError({
            status: 404,
            code: 'EXTENSION_ASSET_NOT_FOUND',
            message: 'Not Found',
            reason: 'resolved file does not exist',
          }),
        }
      }
    },
  }))

  return {
    key: 'extension-static-assets',
    async start() {
      await serverLifecycle.start()
    },
    async stop() {
      await serverLifecycle.stop()
    },
    getBaseUrl() {
      return serverLifecycle.getAddress()?.baseUrl
    },
    issueToken: tokenStore.issue,
    revokeByExtensionId: tokenStore.revokeByExtensionId,
    revokeAll: tokenStore.revokeAll,
  }
}

const extensionAssetMimeTypeOverrides: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
}

function defaultExtensionAssetMimeTypeResolver(ext: string) {
  return extensionAssetMimeTypeOverrides[ext.toLowerCase()]
}
