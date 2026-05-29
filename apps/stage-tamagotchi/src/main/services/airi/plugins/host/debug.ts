import type { PluginHost } from '@proj-airi/plugin-sdk/plugin-host'

import type {
  PluginHostDebugSnapshot,
  PluginHostModuleSummary,
} from '../../../../../shared/eventa/plugin/host'
import type { PluginAssetSnapshotService } from '../features/static-assets'
import type { ManifestEntry, PluginConfig } from '../types'

import { rewriteWidgetModuleAssetUrl } from '../kits/widget'
import { buildPluginRegistrySnapshot } from './registry'

/**
 * Builds the debug snapshot exposed by the Electron plugin host inspector.
 *
 * Use when:
 * - Renderer devtools need sessions, kits, modules, and capability state
 * - Widget iframe asset URLs must be rewritten to mounted plugin asset URLs
 *
 * Expects:
 * - `host` is the initialized plugin host instance
 * - `manifestEntryByName` contains entries for any plugin-owned modules being inspected
 * - `pluginAssetService` owns plugin asset URL/session lifecycle when mounted asset URLs are needed
 *
 * Returns:
 * - A full debug snapshot with registry, sessions, kits, modules, and capabilities
 */
export function buildPluginHostDebugSnapshot(options: {
  host: PluginHost
  pluginsRoot: string
  entries: ManifestEntry[]
  config: PluginConfig
  loaded: Set<string>
  manifestEntryByName: Map<string, ManifestEntry>
  pluginAssetService?: PluginAssetSnapshotService
}): Promise<PluginHostDebugSnapshot> {
  const pluginAssetService = options.pluginAssetService
  const modules = Promise.all(options.host
    .listBindings()
    .map(module =>
      rewriteWidgetModuleAssetUrl(
        module as PluginHostModuleSummary,
        options.manifestEntryByName,
        {
          pluginAssetBaseUrl: pluginAssetService?.getBaseUrl(),
          ...(pluginAssetService
            ? {
                createAssetSession: ({ extensionId, version, sessionId, routeAssetPath, sessionPathPrefix }: {
                  extensionId: string
                  version: string
                  sessionId: string
                  routeAssetPath: string
                  sessionPathPrefix: string
                }) => pluginAssetService.createAssetSession({
                  pluginId: extensionId,
                  version,
                  ownerSessionId: sessionId,
                  routeAssetPath,
                  pathPrefix: sessionPathPrefix,
                }),
              }
            : {}),
        },
      ),
    ) as Array<PluginHostModuleSummary | Promise<PluginHostModuleSummary>>)

  return modules.then(resolvedModules => ({
    registry: buildPluginRegistrySnapshot({
      pluginsRoot: options.pluginsRoot,
      entries: options.entries,
      config: options.config,
      loaded: options.loaded,
    }),
    sessions: options.host.listSessions().map(session => ({
      id: session.id,
      manifestName: session.manifest.name,
      phase: session.phase,
      runtime: session.runtime,
      moduleId: session.identity.id,
    })),
    kits: options.host.listKits(),
    modules: resolvedModules as PluginHostDebugSnapshot['modules'],
    capabilities: options.host.listCapabilities(),
    refreshedAt: Date.now(),
  }))
}
