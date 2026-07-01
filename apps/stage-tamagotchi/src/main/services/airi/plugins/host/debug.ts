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
  host: ExtensionHost
  extensionsRoot: string
  entries: ManifestEntry[]
  config: ExtensionConfig
  loaded: Set<string>
  manifestEntryByExtensionId: Map<string, ManifestEntry>
  extensionAssetService?: ExtensionAssetSnapshotService
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
                createAssetSession: ({ extensionId, version, sessionId, routeAssetPath, sessionPathPrefix }: {
                  extensionId: string
                  version: string
                  sessionId: string
                  routeAssetPath: string
                  sessionPathPrefix: string
                }) => extensionAssetService.createAssetSession({
                  extensionId,
                  version,
                  ownerSessionId: sessionId,
                  routeAssetPath,
                  pathPrefix: sessionPathPrefix,
                }),
              }
            : {}),
        },
      ),
    ))

  return modules.then(resolvedModules => ({
    registry: buildPluginRegistrySnapshot({
      extensionsRoot: options.extensionsRoot,
      entries: options.entries,
      config: options.config,
      loaded: options.loaded,
    }),
    sessions: options.host.listSessions().map(session => ({
      id: session.id,
      extensionId: session.manifest.id,
      phase: session.phase,
      runtime: session.runtime ?? 'electron',
      moduleId: session.extension.id,
    })),
    kits: options.host.listKits(),
    modules: resolvedModules,
    capabilities: options.host.listCapabilities(),
    refreshedAt: Date.now(),
  }))
}
