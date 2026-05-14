import type { PluginHostModuleSummary } from '../../../../../../shared/eventa/plugin/host'
import type { ManifestEntry } from '../../types'

import { isPlainObject } from 'es-toolkit'

import {
  buildMountedStaticAssetPath,
  normalizeStaticAssetPath,
} from '../../../http-server/static-assets/paths'

/**
 * Describes one widget iframe asset as seen from the mounted `/ui` route.
 *
 * Use when:
 * - Converting plugin config asset paths into mounted extension asset URLs
 * - Creating sessions that must validate against route-relative asset paths
 *
 * Expects:
 * - `routeAssetPath` is relative to `/_airi/extensions/:extensionId/sessions/:assetSessionId/ui/`
 * - `sessionPathPrefix` is a directory prefix under that same route, or empty for root
 *
 * Returns:
 * - N/A
 */
export interface WidgetAssetRoute {
  routeAssetPath: string
  sessionPathPrefix: string
}

function normalizeWidgetAssetPath(assetPath: string): string | undefined {
  const trimmed = assetPath.trim().replaceAll('\\', '/')
  if (!trimmed) {
    return undefined
  }

  const withoutRelativePrefix = trimmed.startsWith('./')
    ? trimmed.slice(2)
    : trimmed

  return normalizeStaticAssetPath(withoutRelativePrefix)
}

/**
 * Normalizes a widget iframe asset path into `/ui` route semantics.
 *
 * Use when:
 * - Building mounted widget iframe URLs
 * - Creating asset sessions that must validate against the `/ui` static asset route
 * - Keeping widget route semantics owned by the widget kit module
 *
 * Expects:
 * - `assetPath` points to a file-like path under plugin static assets
 *
 * Returns:
 * - The route-relative asset path and the allowed session prefix for that route
 */
export function resolveWidgetAssetRoute(assetPath: string): WidgetAssetRoute | undefined {
  const normalized = normalizeWidgetAssetPath(assetPath)
  if (!normalized) {
    return undefined
  }

  const routeAssetPath = normalized.startsWith('ui/')
    ? normalized.slice(3)
    : normalized
  if (!routeAssetPath) {
    return undefined
  }

  const segments = routeAssetPath.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return {
      routeAssetPath,
      sessionPathPrefix: normalized.startsWith('ui/') ? '' : routeAssetPath,
    }
  }

  return {
    routeAssetPath,
    sessionPathPrefix: `${segments.slice(0, -1).join('/')}/`,
  }
}

/**
 * Rewrites widget iframe config to use mounted plugin asset URLs.
 *
 * Use when:
 * - Building plugin inspect snapshots with renderer-consumable widget iframe URLs
 * - Creating temporary asset sessions for widget-owned iframe assets
 *
 * Expects:
 * - Module config may contain widget iframe `src` or `assetPath` fields
 * - Mapping includes a manifest entry for `module.ownerPluginId`
 *
 * Returns:
 * - Original module when rewrite is not applicable
 * - Cloned module with injected iframe `src` when asset path mount succeeds
 */
export function rewriteWidgetModuleAssetUrl(
  module: PluginHostModuleSummary,
  manifestEntryByName: Map<string, ManifestEntry>,
  options?: {
    pluginAssetBaseUrl?: string
    createAssetSession?: (input: {
      extensionId: string
      version: string
      sessionId: string
      routeAssetPath: string
      sessionPathPrefix: string
    }) => Promise<{ assetSessionId: string, url?: string }>
  },
): Promise<PluginHostModuleSummary> | PluginHostModuleSummary {
  const entry = manifestEntryByName.get(module.ownerPluginId)
  if (!entry) {
    return module
  }

  const config = isPlainObject(module.config) ? module.config as Record<string, unknown> : {}
  const widgetConfig = isPlainObject(config.widget) ? config.widget as Record<string, unknown> : {}
  const iframeConfig = isPlainObject(widgetConfig.iframe) ? widgetConfig.iframe as Record<string, unknown> : {}
  const iframeSrc = typeof iframeConfig.src === 'string' ? iframeConfig.src.trim() : ''
  if (iframeSrc) {
    return module
  }

  const assetPath = normalizeWidgetAssetPath(
    typeof iframeConfig.assetPath === 'string'
      ? iframeConfig.assetPath
      : typeof widgetConfig.iframeAssetPath === 'string'
        ? widgetConfig.iframeAssetPath
        : typeof config.iframeAssetPath === 'string'
          ? config.iframeAssetPath
          : '',
  )
  if (!assetPath) {
    return module
  }

  const widgetAssetRoute = resolveWidgetAssetRoute(assetPath)
  if (!widgetAssetRoute) {
    return module
  }

  if (!options?.pluginAssetBaseUrl || !options.createAssetSession) {
    return module
  }

  return options.createAssetSession({
    extensionId: module.ownerPluginId,
    version: entry.version,
    sessionId: module.ownerSessionId,
    routeAssetPath: widgetAssetRoute.routeAssetPath,
    sessionPathPrefix: widgetAssetRoute.sessionPathPrefix,
  }).then((session) => {
    const mountedPath = buildMountedStaticAssetPath({
      extensionId: module.ownerPluginId,
      assetSessionId: session.assetSessionId,
      assetPath: widgetAssetRoute.routeAssetPath,
    })
    const iframeUrl = session.url ?? (mountedPath ? new URL(mountedPath, options.pluginAssetBaseUrl).toString() : '')
    if (!iframeUrl) {
      return module
    }

    return {
      ...module,
      config: {
        ...config,
        widget: {
          ...widgetConfig,
          iframe: {
            ...iframeConfig,
            src: iframeUrl,
          },
        },
      },
    }
  })
}
