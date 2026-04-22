import type { PluginHostModuleSummary } from '../../../../../../shared/eventa/plugin/host'
import type { ManifestEntry } from '../../types'

import { isPlainObject } from 'es-toolkit'

import {
  buildMountedPluginAssetPath,
  normalizePluginAssetPath,
} from '../../asset-mount'

const trailingSlashesPattern = /\/+$/

/**
 * Describes one widget iframe asset as seen from the mounted `/ui` route.
 *
 * Use when:
 * - Converting plugin config asset paths into mounted extension asset URLs
 * - Issuing tokens that must validate against route-relative asset paths
 *
 * Expects:
 * - `routeAssetPath` is relative to `/_airi/extensions/:extensionId/ui/`
 * - `tokenPathPrefix` is a directory prefix under that same route, or empty for root
 *
 * Returns:
 * - N/A
 */
export interface WidgetAssetRoute {
  routeAssetPath: string
  tokenPathPrefix: string
}

function normalizeWidgetAssetPath(assetPath: string): string | undefined {
  const trimmed = assetPath.trim().replaceAll('\\', '/')
  if (!trimmed) {
    return undefined
  }

  const withoutRelativePrefix = trimmed.startsWith('./')
    ? trimmed.slice(2)
    : trimmed

  return normalizePluginAssetPath(withoutRelativePrefix)
}

function withSearchParams(url: string, query: Record<string, string>) {
  const next = new URL(url)
  for (const [key, value] of Object.entries(query)) {
    next.searchParams.set(key, value)
  }
  return next.toString()
}

/**
 * Normalizes a widget iframe asset path into `/ui` route semantics.
 *
 * Use when:
 * - Building mounted widget iframe URLs
 * - Issuing asset tokens that must validate against the `/ui` static asset route
 * - Keeping widget route semantics owned by the widget kit module
 *
 * Expects:
 * - `assetPath` points to a file-like path under plugin static assets
 *
 * Returns:
 * - The route-relative asset path and the allowed token prefix for that route
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
      tokenPathPrefix: routeAssetPath,
    }
  }

  return {
    routeAssetPath,
    tokenPathPrefix: `${segments.slice(0, -1).join('/')}/`,
  }
}

/**
 * Rewrites widget iframe config to use mounted plugin asset URLs.
 *
 * Use when:
 * - Building plugin inspect snapshots with renderer-consumable widget iframe URLs
 * - Issuing temporary asset tokens for widget-owned iframe assets
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
    issueAssetToken?: (input: {
      extensionId: string
      version: string
      sessionId: string
      routeAssetPath: string
      tokenPathPrefix: string
    }) => string
  },
): PluginHostModuleSummary {
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

  const mountedPath = buildMountedPluginAssetPath({
    extensionId: entry.manifest.name,
    assetPath: widgetAssetRoute.routeAssetPath,
  })
  if (!mountedPath) {
    return module
  }

  const mountedAbsoluteUrl = options?.pluginAssetBaseUrl
    ? new URL(mountedPath, `${options.pluginAssetBaseUrl.replace(trailingSlashesPattern, '')}/`).toString()
    : mountedPath
  const assetToken = options?.issueAssetToken?.({
    extensionId: entry.manifest.name,
    version: entry.version,
    sessionId: module.ownerSessionId,
    routeAssetPath: widgetAssetRoute.routeAssetPath,
    tokenPathPrefix: widgetAssetRoute.tokenPathPrefix,
  })
  const iframeSourceUrl = assetToken
    ? withSearchParams(mountedAbsoluteUrl, { t: assetToken })
    : mountedAbsoluteUrl

  return {
    ...module,
    config: {
      ...config,
      widget: {
        ...widgetConfig,
        iframe: {
          ...iframeConfig,
          src: iframeSourceUrl,
        },
      },
    },
  }
}
