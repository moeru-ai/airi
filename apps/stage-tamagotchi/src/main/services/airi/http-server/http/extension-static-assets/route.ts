import type { ExtensionStaticAssetRouteOptions } from './types'

import { readFile } from 'node:fs/promises'

import { eventHandler, getQuery, getRequestURL, serveStatic } from 'h3'

import {
  normalizePluginAssetPath,
  parsePluginAssetRequestPath,
} from '../../../plugins/asset-mount'
import { HttpError, toH3HttpError } from '../../errors'

/**
 * Creates the secured extension static asset route handler.
 *
 * Use when:
 * - Serving plugin iframe assets under `/_airi/extensions/:extensionId/ui/**assetPath`
 *
 * Expects:
 * - Query token `t` to be present and valid
 * - `resolveAsset` to map request params into a validated local file
 *
 * Returns:
 * - H3 event handler that enforces token auth before static file response
 */
export function createExtensionStaticAssetRoute(options: ExtensionStaticAssetRouteOptions) {
  return eventHandler(async (event) => {
    try {
      const requestPath = parsePluginAssetRequestPath(getRequestURL(event).pathname)
      const extensionId = requestPath?.extensionId ?? ''
      const assetPath = normalizePluginAssetPath(requestPath?.assetPath ?? '')
      const queryToken = getQuery(event).t
      const token = typeof queryToken === 'string' ? queryToken : ''

      if (!token || !extensionId || !assetPath) {
        throw new HttpError({
          status: 401,
          code: 'EXTENSION_ASSET_REQUEST_INVALID',
          message: 'Unauthorized',
          reason: 'required token, extensionId, or assetPath is missing',
        })
      }

      const auth = await options.authorize({ token, extensionId, assetPath })
      if (!auth.ok) {
        throw auth.error
      }

      let resolved: Awaited<ReturnType<ExtensionStaticAssetRouteOptions['resolveAsset']>> | undefined
      const resolveOnce = async () => {
        if (!resolved) {
          resolved = await options.resolveAsset({ extensionId, assetPath })
        }
        return resolved
      }

      return await serveStatic(event, {
        getType: options.getType,
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
            return undefined
          }

          event.res.headers.set('X-Content-Type-Options', 'nosniff')
          return {
            size: item.size,
            mtime: item.mtime,
          }
        },
      })
    }
    catch (error) {
      if (error instanceof HttpError) {
        throw toH3HttpError(error)
      }
      throw error
    }
  })
}
