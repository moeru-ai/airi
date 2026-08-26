import type { ServerManager } from '../server-manager/types'
import type { StaticAssetSessionStore } from './types'

import { AsyncLocalStorage } from 'node:async_hooks'
import { realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { H3 } from 'h3'

import { HttpError } from '../errors'
import { createH3Server } from '../server'
import {
  normalizeStaticAssetPath,
  resolveStaticAssetFilePath,
} from './paths'
import { createStaticAssetRoute } from './route'
import { createStaticAssetSessionStore } from './session-store'

export interface StaticAssetManifestEntry {
  rootDir: string
  version: string
}

export interface StaticAssetService extends ServerManager {
  createSession: StaticAssetSessionStore['createSession']
  getBaseUrl: () => string | undefined
  revokeAll: StaticAssetSessionStore['revokeAll']
  revokeByExtensionId: StaticAssetSessionStore['revokeByExtensionId']
  revokeByOwnerSessionId: StaticAssetSessionStore['revokeByOwnerSessionId']
  revokeSession: StaticAssetSessionStore['revokeSession']
}

/**
 * Creates the low-level extension static asset transport server.
 *
 * Use when:
 * - Main process must serve plugin iframe assets via local loopback HTTP
 * - Cookie-backed session auth is required for all plugin asset requests
 * - A higher-level plugin asset service needs an HTTP transport adapter
 *
 * Expects:
 * - `getManifestEntryByExtensionId` returns up-to-date extension root/version map
 *
 * Returns:
 * - Lifecycle service with session create/revoke APIs and local base URL getter
 */
export function createStaticAssetService(options: {
  getManifestEntryByExtensionId: () => Map<string, StaticAssetManifestEntry>
  getType?: (ext: string) => string | undefined
  host?: string
  sessionStore?: StaticAssetSessionStore
}): StaticAssetService {
  const host = options.host ?? '127.0.0.1'
  const sessionStore = options.sessionStore ?? createStaticAssetSessionStore()
  const getType = options.getType ?? defaultStaticAssetMimeTypeResolver

  const app = new H3()
  const serverLifecycle = createH3Server({ app, host })
  const manifestEntryRequestCache = new AsyncLocalStorage<Map<string, StaticAssetManifestEntry | undefined>>()
  const getManifestEntryForRequest = (extensionId: string) => {
    const cache = manifestEntryRequestCache.getStore()
    if (!cache) {
      return options.getManifestEntryByExtensionId().get(extensionId)
    }

    if (!cache.has(extensionId)) {
      cache.set(extensionId, options.getManifestEntryByExtensionId().get(extensionId))
    }

    return cache.get(extensionId)
  }

  const staticAssetRoute = createStaticAssetRoute({
    authorize: async ({ assetPath, assetSessionId, cookieValue, extensionId }) => {
      const entry = getManifestEntryForRequest(extensionId)
      if (!entry) {
        return {
          error: new HttpError({
            code: 'EXTENSION_ASSET_EXTENSION_NOT_REGISTERED',
            message: 'Unauthorized',
            reason: 'extension manifest entry does not exist for requested extensionId',
            status: 401,
          }),
          ok: false,
        }
      }

      return sessionStore.validateRequest({
        assetPath,
        assetSessionId,
        cookieValue,
        extensionId,
        version: entry.version,
      })
    },
    getType,
    refreshSession: sessionStore.refreshSession,
    resolveAsset: async ({ assetPath, extensionId }) => {
      const entry = getManifestEntryForRequest(extensionId)
      if (!entry) {
        return {
          error: new HttpError({
            code: 'EXTENSION_ASSET_EXTENSION_NOT_FOUND',
            message: 'Not Found',
            reason: 'extension manifest entry does not exist for requested extensionId',
            status: 404,
          }),
          ok: false,
        }
      }

      const normalizedAssetPath = normalizeStaticAssetPath(assetPath)
      if (!normalizedAssetPath) {
        return {
          error: new HttpError({
            code: 'EXTENSION_ASSET_PATH_INVALID',
            message: 'Bad Request',
            reason: 'asset path could not be normalized',
            status: 400,
          }),
          ok: false,
        }
      }

      const fullAssetPath = `ui/${normalizedAssetPath}`
      const resolvedRoot = await realpath(entry.rootDir)
      const candidatePath = resolve(resolvedRoot, fullAssetPath)
      const filePath = await resolveStaticAssetFilePath(entry.rootDir, fullAssetPath)
      if (!filePath) {
        try {
          await stat(candidatePath)
        }
        catch {
          return {
            error: new HttpError({
              code: 'EXTENSION_ASSET_NOT_FOUND',
              message: 'Not Found',
              reason: 'resolved file does not exist',
              status: 404,
            }),
            ok: false,
          }
        }

        return {
          error: new HttpError({
            code: 'EXTENSION_ASSET_PATH_RESOLVE_FAILED',
            message: 'Bad Request',
            reason: 'resolved asset path is outside extension root',
            status: 400,
          }),
          ok: false,
        }
      }

      try {
        const fileStats = await stat(filePath)
        if (!fileStats.isFile()) {
          return {
            error: new HttpError({
              code: 'EXTENSION_ASSET_NOT_FILE',
              message: 'Not Found',
              reason: 'resolved path exists but is not a file',
              status: 404,
            }),
            ok: false,
          }
        }

        return {
          filePath,
          mtime: fileStats.mtimeMs,
          ok: true,
          size: fileStats.size,
        }
      }
      catch {
        return {
          error: new HttpError({
            code: 'EXTENSION_ASSET_NOT_FOUND',
            message: 'Not Found',
            reason: 'resolved file does not exist',
            status: 404,
          }),
          ok: false,
        }
      }
    },
  })

  app.use('/_airi/extensions/**', event => manifestEntryRequestCache.run(new Map(), () => staticAssetRoute(event)))

  return {
    createSession: sessionStore.createSession,
    getBaseUrl() {
      return serverLifecycle.getAddress()?.baseUrl
    },
    key: 'static-assets',
    revokeAll: sessionStore.revokeAll,
    revokeByExtensionId: sessionStore.revokeByExtensionId,
    revokeByOwnerSessionId: sessionStore.revokeByOwnerSessionId,
    revokeSession: sessionStore.revokeSession,
    async start() {
      await serverLifecycle.start()
    },
    async stop() {
      await serverLifecycle.stop()
    },
  }
}

const staticAssetMimeTypeOverrides: Record<string, string> = {
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.wasm': 'application/wasm',
}

function defaultStaticAssetMimeTypeResolver(ext: string) {
  return staticAssetMimeTypeOverrides[ext.toLowerCase()]
}
