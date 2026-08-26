import type { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'

import type {
  PluginHostDebugSnapshot,
} from '../../../../../shared/eventa/plugin/host'
import type { ExtensionAssetSnapshotService } from '../features/static-assets'
import type { ExtensionConfig, ManifestEntry } from '../types'

import { rewriteWidgetModuleAssetUrl } from '../kits/widget'
import { buildPluginRegistrySnapshot } from './registry'

/**
 * Builds the debug snapshot exposed by the Electron extension host inspector.
 *
 * Use when:
 * - Renderer devtools need sessions, kits, modules, and capability state
 * - Widget iframe asset URLs must be rewritten to mounted extension asset URLs
 *
 * Expects:
 * - `host` is the initialized extension host instance
 * - `manifestEntryByExtensionId` contains entries for any extension-owned modules being inspected
 * - `extensionAssetService` owns extension asset URL/session lifecycle when mounted asset URLs are needed
 *
 * Returns:
 * - A full debug snapshot with registry, sessions, kits, modules, and capabilities
 */
export function buildPluginHostDebugSnapshot(options: {
  config: ExtensionConfig
  entries: ManifestEntry[]
  extensionAssetService?: ExtensionAssetSnapshotService
  extensionsRoot: string
  host: ExtensionHost
  loaded: Set<string>
  manifestEntryByExtensionId: Map<string, ManifestEntry>
}): Promise<PluginHostDebugSnapshot> {
  const extensionAssetService = options.extensionAssetService
  const modules = Promise.all(options.host
    .listBindings()
    .map(module =>
      rewriteWidgetModuleAssetUrl(
        module,
        options.manifestEntryByExtensionId,
        {
          extensionAssetBaseUrl: extensionAssetService?.getBaseUrl(),
          ...(extensionAssetService
            ? {
                createAssetSession: ({ extensionId, routeAssetPath, sessionId, sessionPathPrefix, version }: {
                  extensionId: string
                  routeAssetPath: string
                  sessionId: string
                  sessionPathPrefix: string
                  version: string
                }) => extensionAssetService.createAssetSession({
                  extensionId,
                  ownerSessionId: sessionId,
                  pathPrefix: sessionPathPrefix,
                  routeAssetPath,
                  version,
                }),
              }
            : {}),
        },
      ),
    ))

  return modules.then(resolvedModules => ({
    capabilities: options.host.listCapabilities(),
    kits: options.host.listKits(),
    modules: resolvedModules,
    refreshedAt: Date.now(),
    registry: buildPluginRegistrySnapshot({
      config: options.config,
      entries: options.entries,
      extensionsRoot: options.extensionsRoot,
      loaded: options.loaded,
    }),
    sessions: options.host.listSessions().map(session => ({
      extensionId: session.manifest.id,
      id: session.id,
      moduleId: session.extension.id,
      phase: session.phase,
      runtime: session.runtime ?? 'electron',
    })),
  }))
}
