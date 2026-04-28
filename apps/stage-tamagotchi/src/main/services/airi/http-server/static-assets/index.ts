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
  getBaseUrl: () => string | undefined
  createSession: StaticAssetSessionStore['createSession']
  revokeSession: StaticAssetSessionStore['revokeSession']
  revokeByOwnerSessionId: StaticAssetSessionStore['revokeByOwnerSessionId']
  revokeByExtensionId: StaticAssetSessionStore['revokeByExtensionId']
  revokeAll: StaticAssetSessionStore['revokeAll']
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
 * - `getManifestEntryByName` returns up-to-date plugin root/version map
 *
 * Returns:
 * - Lifecycle service with session create/revoke APIs and local base URL getter
 */
export function createStaticAssetService(options: {
  getManifestEntryByName: () => Map<string, StaticAssetManifestEntry>
  host?: string
  sessionStore?: StaticAssetSessionStore
  getType?: (ext: string) => string | undefined
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
      return options.getManifestEntryByName().get(extensionId)
    }

    if (!cache.has(extensionId)) {
      cache.set(extensionId, options.getManifestEntryByName().get(extensionId))
    }

    return cache.get(extensionId)
  }

  const staticAssetRoute = createStaticAssetRoute({
    getType,
    authorize: async ({ extensionId, assetSessionId, assetPath, cookieValue }) => {
      const entry = getManifestEntryForRequest(extensionId)
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

      return sessionStore.validateRequest({
        extensionId,
        version: entry.version,
        assetSessionId,
        assetPath,
        cookieValue,
      })
    },
    refreshSession: sessionStore.refreshSession,
    resolveAsset: async ({ extensionId, assetPath }) => {
      const entry = getManifestEntryForRequest(extensionId)
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

      const normalizedAssetPath = normalizeStaticAssetPath(assetPath)
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
      const resolvedRoot = await realpath(entry.rootDir)
      const candidatePath = resolve(resolvedRoot, fullAssetPath)
      const filePath = await resolveStaticAssetFilePath(entry.rootDir, fullAssetPath)
      if (!filePath) {
        try {
          await stat(candidatePath)
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
  })

  app.use('/_airi/extensions/**', event => manifestEntryRequestCache.run(new Map(), () => staticAssetRoute(event)))

  return {
    key: 'static-assets',
    async start() {
      await serverLifecycle.start()
    },
    async stop() {
      await serverLifecycle.stop()
    },
    getBaseUrl() {
      return serverLifecycle.getAddress()?.baseUrl
    },
    createSession: sessionStore.createSession,
    revokeSession: sessionStore.revokeSession,
    revokeByOwnerSessionId: sessionStore.revokeByOwnerSessionId,
    revokeByExtensionId: sessionStore.revokeByExtensionId,
    revokeAll: sessionStore.revokeAll,
  }
}

const staticAssetMimeTypeOverrides: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
}

function defaultStaticAssetMimeTypeResolver(ext: string) {
  return staticAssetMimeTypeOverrides[ext.toLowerCase()]
}
