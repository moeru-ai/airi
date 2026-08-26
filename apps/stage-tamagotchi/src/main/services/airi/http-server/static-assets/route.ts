import type { StaticAssetResolveResult, StaticAssetSession, StaticAssetSessionValidationResult } from './types'

import { readFile } from 'node:fs/promises'

import { eventHandler, getCookie, getRequestURL, serveStatic } from 'h3'

import { HttpError, toH3HttpError } from '../errors'
import { normalizeStaticAssetPath, parseStaticAssetRequestPath } from './paths'
import { createStaticAssetSessionCookieName } from './session-store'

const staticAssetSecurityHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

export interface StaticAssetRouteOptions {
  authorize: (params: {
    assetPath: string
    assetSessionId: string
    cookieValue: string | undefined
    extensionId: string
  }) => Promise<StaticAssetSessionValidationResult>
  getType?: (ext: string) => string | undefined
  refreshSession: (assetSessionId: string) => StaticAssetSession | undefined
  resolveAsset: (params: { assetPath: string, extensionId: string }) => Promise<StaticAssetResolveResult>
}

/**
 * Creates the secured extension static asset route handler.
 *
 * Use when:
 * - Serving plugin iframe assets under `/_airi/extensions/:extensionId/sessions/:assetSessionId/ui/**assetPath`
 *
 * Expects:
 * - Cookie-backed asset session data to be present and valid
 * - `resolveAsset` to map request params into a validated local file
 *
 * Returns:
 * - H3 event handler that enforces cookie auth before static file response
 */
export function createStaticAssetRoute(options: StaticAssetRouteOptions) {
  return eventHandler(async (event) => {
    try {
      Object.entries(staticAssetSecurityHeaders).forEach(([key, value]) => {
        event.res.headers.set(key, value)
      })

      if (event.req.method !== 'GET' && event.req.method !== 'HEAD') {
        throw new HttpError({
          code: 'EXTENSION_ASSET_METHOD_NOT_ALLOWED',
          message: 'Method Not Allowed',
          status: 405,
        })
      }

      const requestPath = parseStaticAssetRequestPath(getRequestURL(event).pathname)
      const extensionId = requestPath?.extensionId ?? ''
      const assetSessionId = requestPath?.assetSessionId ?? ''
      const assetPath = normalizeStaticAssetPath(requestPath?.assetPath ?? '')

      if (!extensionId || !assetSessionId || !assetPath) {
        throw new HttpError({
          code: 'EXTENSION_ASSET_REQUEST_INVALID',
          message: 'Unauthorized',
          reason: 'required extensionId, assetSessionId, or assetPath is missing',
          status: 401,
        })
      }

      const cookieValue = getCookie(event, createStaticAssetSessionCookieName(assetSessionId))
      const auth = await options.authorize({
        assetPath,
        assetSessionId,
        cookieValue,
        extensionId,
      })
      if (!auth.ok) {
        throw auth.error
      }

      options.refreshSession(assetSessionId)

      let resolved: Awaited<ReturnType<StaticAssetRouteOptions['resolveAsset']>> | undefined
      const resolveOnce = async () => {
        if (!resolved) {
          resolved = await options.resolveAsset({ assetPath, extensionId })
        }
        return resolved
      }

      return await serveStatic(event, {
        getContents: async () => {
          const item = await resolveOnce()
          if (!item.ok) {
            throw item.error
          }
          return await readFile(item.filePath)
        },
        getMeta: async () => {
          const item = await resolveOnce()
          if (!item.ok) {
            throw item.error
          }

          return {
            mtime: item.mtime,
            size: item.size,
          }
        },
        getType: options.getType,
      })
    }
    catch (error) {
      if (error instanceof HttpError) {
        throw toH3HttpError(error, {
          headers: staticAssetSecurityHeaders,
        })
      }

      throw error
    }
  })
}
