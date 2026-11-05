import type { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
import type { PluginHostDebugSnapshot, PluginHostGraphSummary } from '@proj-airi/stage-shared/plugin-host'

import type { ExtensionAssetSnapshotService } from '../features/static-assets'
import type { ExtensionConfig, ManifestEntry } from '../types'

import { rewriteWidgetModuleAssetUrl } from '../kits/widget'
import { buildPluginRegistrySnapshot } from './registry'

/**
 * Converts the injeca graph view of the host into plain values for the inspector.
 *
 * Use when:
 * - Devtools show the services, phases, statuses, and blockers of the plugin host graph
 *
 * Returns:
 * - Services, the explanation of each session that waits, and the last observe records
 */
export function buildPluginHostGraphSummary(host: ExtensionHost): PluginHostGraphSummary {
  const graph = host.inspect()
  return {
    services: graph.services.map(service => ({
      key: service.key,
      kind: service.kind,
      owner: { ...service.owner },
      phase: service.phase,
      status: service.status,
      instanceId: service.instanceId,
      exported: service.exported,
      consumer: service.consumer ? { ...service.consumer } : undefined,
    })),
    explanations: graph.explanations.map(explanation => ({
      sessionId: explanation.sessionId,
      extensionId: explanation.extensionId,
      lines: [...explanation.lines],
    })),
    events: graph.events.map(event => ({
      type: event.type,
      key: event.key,
      owner: { ...event.owner },
      from: event.from,
      to: event.to,
      decision: event.decision,
      hook: event.hook,
      reason: event.reason,
      at: event.at,
    })),
  }
}

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
 * - `canMaterializeAssetSession` rejects inactive and cleanup-pending session owners
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
  canMaterializeAssetSession: (input: { extensionId: string, sessionId: string }) => boolean
}): Promise<PluginHostDebugSnapshot> {
  const extensionAssetService = options.extensionAssetService
  const modules = Promise.all(options.host
    .listBindings()
    .map((module) => {
      const canMaterializeAssetSession = options.canMaterializeAssetSession({
        extensionId: module.ownerExtensionId,
        sessionId: module.ownerSessionId,
      })

      return rewriteWidgetModuleAssetUrl(
        module,
        options.manifestEntryByExtensionId,
        {
          extensionAssetBaseUrl: extensionAssetService?.getBaseUrl(),
          ...(extensionAssetService && canMaterializeAssetSession
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
      )
    }))

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
    graph: buildPluginHostGraphSummary(options.host),
    refreshedAt: Date.now(),
  }))
}
