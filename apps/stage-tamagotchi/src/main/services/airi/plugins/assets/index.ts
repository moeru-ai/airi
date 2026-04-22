import type { ExtensionStaticAssetManifestEntry } from '../../http-server/http/extension-static-assets'
import type { ServerManager } from '../../http-server/server-manager/types'

import { createExtensionStaticAssetServer } from '../../http-server/http/extension-static-assets'

/**
 * Describes one plugin asset access token issuance request.
 *
 * Use when:
 * - A plugin-owned asset URL must be mounted behind the local loopback server
 * - Snapshot builders need a transport-agnostic way to authorize one plugin asset route
 *
 * Expects:
 * - `pluginId` matches a manifest entry registered in the asset host
 * - `pathPrefix` is scoped to the mounted route prefix accepted by the token store
 *
 * Returns:
 * - N/A
 */
export interface PluginAssetAccessTokenInput {
  pluginId: string
  version: string
  sessionId: string
  pathPrefix: string
  ttlMs: number
}

/**
 * Describes the plugin asset methods needed while building renderer-facing snapshots.
 *
 * Use when:
 * - Snapshot builders must request route-scoped asset tokens without depending on HTTP server internals
 * - Host bootstrap wants to layer caching or policy on top of the raw asset transport
 *
 * Expects:
 * - `routeAssetPath` identifies the mounted asset file being exposed in the snapshot
 * - Implementations may use `routeAssetPath` for caching even if the transport ignores it
 *
 * Returns:
 * - N/A
 */
export interface PluginAssetSnapshotService {
  getBaseUrl: () => string | undefined
  issueAccessToken: (input: {
    pluginId: string
    version: string
    sessionId: string
    routeAssetPath: string
    pathPrefix: string
  }) => string
}

/**
 * Defines the plugin-owned asset hosting service used by the plugin host.
 *
 * Use when:
 * - Plugin snapshots need mounted asset URLs without depending on the H3 server shape
 * - Host teardown must revoke plugin asset access independently from widget/gamelet logic
 *
 * Expects:
 * - Implementations own the underlying transport and token lifecycle
 *
 * Returns:
 * - A startable/stoppable asset-hosting service with generic plugin-facing methods
 */
export interface PluginAssetService extends ServerManager {
  getBaseUrl: () => string | undefined
  issueAccessToken: (input: PluginAssetAccessTokenInput) => string
  revokeByPluginId: (pluginId: string) => void
  revokeAll: () => void
}

/**
 * Creates the plugin asset host service backed by the extension static asset server.
 *
 * Use when:
 * - The plugin host needs to expose mounted asset URLs to renderer snapshots
 * - Asset token lifecycle should stay inside the plugin domain instead of the HTTP server layer
 *
 * Expects:
 * - `getManifestEntryByName` returns the latest plugin root/version map
 *
 * Returns:
 * - A plugin-facing asset host service with generic plugin asset methods
 */
export function createPluginAssetService(options: {
  getManifestEntryByName: () => Map<string, ExtensionStaticAssetManifestEntry>
}): PluginAssetService {
  const server = createExtensionStaticAssetServer(options)

  return {
    key: 'plugin-assets',
    async start() {
      await server.start()
    },
    async stop() {
      await server.stop()
    },
    getBaseUrl() {
      return server.getBaseUrl()
    },
    issueAccessToken(input) {
      return server.issueToken({
        extensionId: input.pluginId,
        version: input.version,
        sessionId: input.sessionId,
        pathPrefix: input.pathPrefix,
        ttlMs: input.ttlMs,
      })
    },
    revokeByPluginId(pluginId) {
      server.revokeByExtensionId(pluginId)
    },
    revokeAll() {
      server.revokeAll()
    },
  }
}
